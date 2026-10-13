#!/usr/bin/env python3
"""
베이스 바디(.blend) 1개 → 프리셋 아바타 스틸 (성별당 체지방 5 × 근육 5 = 25장)

  # bpy 모듈 파이썬
  python scripts/render-avatars.py -- --blend body_m.blend --sex m --out ~/avatar-renders/m
  # Blender 앱
  blender -b body_m.blend -P scripts/render-avatars.py -- --sex m --out ~/avatar-renders/m

  --preview       저해상도 · 저샘플 (프레이밍 확인용, WebP 안 만듦)
  --cells F2M4,F3M3   일부 칸만
  자세한 플래그: --help · 사용법: scripts/AVATARS.md

칸 = 셰이프 키 값만 다르다. 카메라 · 조명 · 포즈 · 재질은 기본(중립) 몸으로 한 번 정해 25칸이 공유한다.
  F i → fat 키 = levels[i-1],  M j → muscle 키 = levels[j-1]
출력: avatar_{m|f}_F{i}M{j}.png (1080×1620 RGBA, 투명) + .webp (720×1080, 60~90KB) + render-log.json
.blend 파일은 저장하지 않는다 (열어서 렌더만).
"""
import argparse
import io
import json
import math
import os
import re
import sys
import time

try:
    import bpy
    from mathutils import Matrix, Quaternion, Vector
except ImportError:
    sys.exit('bpy 가 없습니다. Blender 의 bpy 모듈 파이썬으로 돌리거나 `blender -b <file> -P scripts/render-avatars.py -- ...` 로 실행하세요.')
import numpy as np

CLOTH_RE = re.compile(r'short|pant|bra|top|cloth|shirt|wear|trunk|옷|바지|브라|의상', re.I)


def log(*a):
    print('[avatar]', *a, flush=True)


def die(msg, code=2):
    print(f'\n[avatar] 오류: {msg}\n', file=sys.stderr, flush=True)
    sys.exit(code)


# ── 인자 ─────────────────────────────────────────────────────────────────

def parse_args():
    if '--' in sys.argv:
        argv = sys.argv[sys.argv.index('--') + 1:]
    elif os.path.basename(sys.argv[0]).endswith('.py'):
        argv = sys.argv[1:]
    else:
        argv = []  # blender -P 인데 -- 가 없다
    p = argparse.ArgumentParser(prog='render-avatars.py', description='프리셋 아바타 25칸 렌더')
    p.add_argument('--blend', help='.blend 경로 (blender -b <file> 로 이미 열었으면 생략)')
    p.add_argument('--sex', required=True, choices=['m', 'f'])
    p.add_argument('--out', required=True, help='출력 폴더')
    p.add_argument('--body', help='몸 메시 이름 (기본: Armature 모디파이어가 있는 메시 중 정점이 가장 많은 것)')
    p.add_argument('--clothes', help='옷 메시 이름, 쉼표 (기본: 같은 리그에 붙은 메시 중 이름/재질/컬렉션에 short·bra·top… 이 있는 것)')
    p.add_argument('--hide', default='', help='추가로 숨길 오브젝트, 쉼표')
    p.add_argument('--fat-key', default='fat')
    p.add_argument('--muscle-key', default='muscle')
    p.add_argument('--levels', default='0,0.25,0.5,0.75,1', help='단계 1~5 의 키 값 (두 키 공통)')
    p.add_argument('--fat-levels', help='fat 키만 따로 (기본 --levels)')
    p.add_argument('--muscle-levels', help='muscle 키만 따로 (기본 --levels)')
    p.add_argument('--allow-missing-keys', action='store_true', help='키가 없어도 진행 (파이프라인 점검용 — 25칸이 모두 같은 몸)')
    p.add_argument('--cells', help='일부 칸만, 예: F2M4,F3M3')
    p.add_argument('--skip-existing', action='store_true', help='PNG 가 이미 있는 칸은 건너뜀 (끊긴 렌더 이어 하기)')
    p.add_argument('--res', help='마스터 해상도 WxH (기본 1080x1620, --preview 360x540)')
    p.add_argument('--samples', type=int, help='Cycles 샘플 (기본 64, --preview 8)')
    p.add_argument('--engine', default='cycles', choices=['cycles', 'eevee', 'workbench'])
    p.add_argument('--gpu', action='store_true', help='Cycles GPU (Metal/OptiX/CUDA/HIP 중 되는 것)')
    p.add_argument('--preview', action='store_true', help='빠른 확인용 (저해상도 · 저샘플 · WebP 생략)')
    p.add_argument('--arm-angle', type=float, default=15.0, help='팔과 몸통 사이 각도(도). A-포즈')
    p.add_argument('--palms', default='in', choices=['in', 'keep'], help='in = 손바닥이 허벅지를 보게 전완을 비튼다(기본)')
    p.add_argument('--no-pose', action='store_true', help='포즈를 건드리지 않음 (.blend 의 포즈 그대로)')
    p.add_argument('--lens', type=float, default=0.0, help='0 = 직교 카메라(기본). 숫자 = 원근 초점거리(mm)')
    p.add_argument('--margin-top', type=float, default=0.06, help='머리 위 여백 (프레임 높이 비율)')
    p.add_argument('--margin-bottom', type=float, default=0.04, help='발바닥 아래 여백 (프레임 높이 비율)')
    p.add_argument('--keep-scene-lights', action='store_true', help='.blend 조명을 끄지 않음 (기본: 끄고 3점 조명 사용)')
    p.add_argument('--exposure', type=float, default=0.0, help='노출 보정 (stop). 전체 밝기만 바꿀 때')
    p.add_argument('--body-color', default='#B9B9BB', help='몸 클레이 색 (sRGB)')
    p.add_argument('--cloth-color', default='#8A8A8D', help='옷 클레이 색 — 몸보다 한 톤 어둡게')
    p.add_argument('--sss', type=float, default=0.0, help='서브서피스 가중치 (0~0.1 정도, 기본 0)')
    p.add_argument('--no-webp', action='store_true')
    p.add_argument('--webp-res', default='720x1080')
    p.add_argument('--webp-kb', default='60-90', help='WebP 목표 용량 범위 KB — 상한 이하에서 가장 높은 품질')
    a = p.parse_args(argv)
    a.res = a.res or ('360x540' if a.preview else '1080x1620')
    a.samples = a.samples or (8 if a.preview else 64)
    if a.preview:
        a.no_webp = True
    a.res = parse_wh(a.res, '--res')
    a.webp_res = parse_wh(a.webp_res, '--webp-res')
    a.fat_levels = parse_levels(a.fat_levels or a.levels, '--fat-levels')
    a.muscle_levels = parse_levels(a.muscle_levels or a.levels, '--muscle-levels')
    lo, _, hi = a.webp_kb.partition('-')
    a.webp_kb = (float(lo), float(hi or lo))
    a.cells = parse_cells(a.cells)
    a.out = os.path.expanduser(a.out)
    a.blend = a.blend and os.path.expanduser(a.blend)
    return a


def parse_wh(s, flag):
    m = re.fullmatch(r'(\d+)[x×](\d+)', s.strip())
    if not m:
        die(f'{flag} 는 1080x1620 형식이어야 합니다: {s}')
    return int(m[1]), int(m[2])


def parse_levels(s, flag):
    try:
        v = [float(x) for x in s.split(',')]
    except ValueError:
        die(f'{flag} 는 숫자 5개(쉼표)여야 합니다: {s}')
    if len(v) != 5:
        die(f'{flag} 는 5단계여야 합니다 (지금 {len(v)}개): {s}')
    if any(b < a for a, b in zip(v, v[1:])):
        die(f'{flag} 는 커지는 순서여야 합니다 (오른쪽·위로 갈수록 단조 증가): {s}')
    return v


def parse_cells(s):
    if not s:
        return None
    out = []
    for c in s.split(','):
        m = re.fullmatch(r'F([1-5])M([1-5])', c.strip(), re.I)
        if not m:
            die(f'--cells 형식: F2M4,F3M3 (1~5) — 잘못된 값: {c}')
        out.append((int(m[1]), int(m[2])))
    return out


# ── 장면 준비 ────────────────────────────────────────────────────────────

def open_blend(a):
    if a.blend:
        path = os.path.abspath(a.blend)
        if not os.path.exists(path):
            die(f'.blend 가 없습니다: {path}')
        if os.path.abspath(bpy.data.filepath or '') != path:
            bpy.ops.wm.open_mainfile(filepath=path, load_ui=False)
    elif not bpy.data.filepath:
        die('--blend 로 파일을 주거나 `blender -b <file> -P ...` 로 여세요.')
    log('파일', bpy.data.filepath)


def armature_of(o):
    for m in o.modifiers:
        if m.type == 'ARMATURE' and m.object:
            return m.object
    return None


def find_body(a):
    if a.body:
        o = bpy.data.objects.get(a.body)
        if not o or o.type != 'MESH':
            die(f'--body "{a.body}" 메시가 없습니다. 메시: {", ".join(x.name for x in bpy.data.objects if x.type == "MESH")}')
        return o
    cands = [o for o in bpy.context.scene.objects if o.type == 'MESH' and armature_of(o)]
    if not cands:
        die('Armature 모디파이어가 있는 메시가 없습니다. --body 로 지정하세요.')
    return max(cands, key=lambda o: len(o.data.vertices))


def freeze_animation(ids):
    """현재 프레임 값을 확정하고 액션을 뗀다 — 렌더 때 키프레임이 키 값 · 포즈를 덮어쓰지 않게 (드라이버는 유지)."""
    sc = bpy.context.scene
    sc.frame_set(sc.frame_current)
    for idb in ids:
        ad = getattr(idb, 'animation_data', None) if idb else None
        if not ad:
            continue
        if ad.action:
            ad.action = None
        ad.use_nla = False


def find_key(obj, name):
    sk = obj.data.shape_keys
    if not sk:
        return None
    for kb in sk.key_blocks:
        if kb.name.lower() == name.lower():
            return kb
    return None


def key_names(obj):
    sk = obj.data.shape_keys
    return [kb.name for kb in sk.key_blocks[1:]] if sk else []


def prepare_key(kb, levels):
    kb.mute = False
    kb.slider_min = min(kb.slider_min, min(levels))
    kb.slider_max = max(kb.slider_max, max(levels))
    sk = kb.id_data
    ad = sk.animation_data
    if ad:
        path = f'key_blocks["{kb.name}"].value'
        for d in list(ad.drivers):
            if d.data_path == path:
                log(f'경고: 키 "{kb.name}" 의 드라이버를 이번 렌더에서만 끕니다')
                ad.drivers.remove(d)


# ── A-포즈 ───────────────────────────────────────────────────────────────

def ev_pose_bone(rig, name):
    dg = bpy.context.evaluated_depsgraph_get()
    re_ = rig.evaluated_get(dg)
    return re_.pose.bones.get(name), re_.matrix_world


def bone_dir(rig, name):
    pb, mw = ev_pose_bone(rig, name)
    if not pb:
        return None, None
    h, t = mw @ pb.head, mw @ pb.tail
    return h, (t - h).normalized()


def angle_from_down(d):
    return math.degrees(d.angle(Vector((0, 0, -1))))


def descendants(pb):
    out = []
    for c in pb.children:
        out.append(c)
        out += descendants(c)
    return out


def fmt(s, side):
    return s.format(s=side, side='Left' if side == 'L' else 'Right')


# (이름, 상완 본, 전완 본, 제약 끄기) — 위에서부터 시도하고, DEF/ORG 본 방향을 재서 실제로 움직였는지 확인한다
ARM_CANDIDATES = [
    ('rigify FK', 'upper_arm_fk.{s}', 'forearm_fk.{s}', False),
    ('metarig', 'upper_arm.{s}', 'forearm.{s}', False),
    ('mixamo', 'mixamorig:{side}Arm', 'mixamorig:{side}ForeArm', False),
    ('ORG 본(제약 끔)', 'ORG-upper_arm.{s}', None, True),
    ('DEF 본(제약 끔)', 'DEF-upper_arm.{s}', None, True),
]
MEASURE_UPPER = ['DEF-upper_arm.{s}', 'ORG-upper_arm.{s}']
MEASURE_FORE = ['DEF-forearm.{s}', 'ORG-forearm.{s}', 'forearm_fk.{s}', 'forearm.{s}', 'mixamorig:{side}ForeArm']
# 손바닥 방향 = 검지 뿌리 → 새끼 뿌리
MEASURE_INDEX = ['DEF-f_index.01.{s}', 'ORG-f_index.01.{s}', 'f_index.01.{s}', 'mixamorig:{side}HandIndex1']
MEASURE_PINKY = ['DEF-f_pinky.01.{s}', 'ORG-f_pinky.01.{s}', 'f_pinky.01.{s}', 'mixamorig:{side}HandPinky1']


def ik_fk_switch(rig, side):
    """Rigify 팔의 IK/FK 스위치 (1.0 = FK). 없으면 None."""
    for pb in rig.pose.bones:
        if 'upper_arm' in pb.name and pb.name.endswith('.' + side) and 'IK_FK' in pb.keys():
            return pb
    return None


def rotate_world(rig, pb, q):
    """포즈 본을 자기 머리를 중심으로 월드 회전 q 만큼 돌린다."""
    rr = rig.matrix_world.to_3x3().normalized()
    r = rr.inverted() @ q.to_matrix() @ rr
    m = pb.matrix.copy()
    h = m.translation.copy()
    pb.matrix = Matrix.Translation(h) @ r.to_4x4() @ Matrix.Translation(-h) @ m
    bpy.context.view_layer.update()


def aim(rig, ctrl, measure, target):
    for _ in range(6):
        _, d = bone_dir(rig, measure)
        if d.angle(target) < math.radians(0.2):
            break
        rotate_world(rig, ctrl, d.rotation_difference(target))
    _, d = bone_dir(rig, measure)
    return math.degrees(d.angle(target))


def twist_palms(rig, side, ctrl, fore):
    """전완을 제 축으로 돌려 손바닥이 허벅지를 보게(엄지 앞) — 검지→새끼 벡터를 +Y(뒤)로."""
    pbs = rig.pose.bones
    idx = next((fmt(n, side) for n in MEASURE_INDEX if fmt(n, side) in pbs), None)
    pky = next((fmt(n, side) for n in MEASURE_PINKY if fmt(n, side) in pbs), None)
    if not (idx and pky):
        return None
    want = Vector((0, 1, 0))
    total = 0.0
    for _ in range(5):
        _, axis = bone_dir(rig, fore)
        v = bone_dir(rig, pky)[0] - bone_dir(rig, idx)[0]
        vp, tp = v - axis * v.dot(axis), want - axis * want.dot(axis)
        ang = math.atan2(axis.dot(vp.cross(tp)), vp.dot(tp))
        if abs(ang) < math.radians(1):
            break
        rotate_world(rig, ctrl, Quaternion(axis, ang))
        total += math.degrees(ang)
    return total


def pose_arm(rig, side, angle, center_x, palms_in=True):
    pbs = rig.pose.bones
    upper_names = [fmt(n, side) for n in MEASURE_UPPER]
    fore_names = [fmt(n, side) for n in MEASURE_FORE]
    for label, ctrl_name, fore_ctrl_name, mute in ARM_CANDIDATES:
        ctrl = pbs.get(fmt(ctrl_name, side))
        if not ctrl:
            continue
        fctrl = pbs.get(fmt(fore_ctrl_name, side)) if fore_ctrl_name else None
        upper = next((n for n in upper_names if n in pbs), ctrl.name)
        fore = next((n for n in fore_names if n in pbs), None)
        # 되돌릴 상태
        touched = [b for b in (ctrl, fctrl) if b]
        saved = [(b, b.location.copy(), b.rotation_quaternion.copy(), b.rotation_euler.copy(),
                  tuple(b.rotation_axis_angle), b.scale.copy()) for b in touched]
        sw = ik_fk_switch(rig, side) if label == 'rigify FK' else None
        sw_old = sw['IK_FK'] if sw else None
        muted = []
        if mute:
            for b in [ctrl] + descendants(ctrl):
                for c in b.constraints:
                    if not c.mute:
                        c.mute = True
                        muted.append(c)
        if sw:
            sw['IK_FK'] = 1.0
        rig.update_tag()
        bpy.context.view_layer.update()

        head, d = bone_dir(rig, upper)
        sx = 1.0 if head.x >= center_x else -1.0
        a = math.radians(angle)
        target = Vector((sx * math.sin(a), 0.0, -math.cos(a)))  # 정면 평면에서 바깥 아래
        start = angle_from_down(d)
        err = aim(rig, ctrl, upper, target)
        twist = None
        if fctrl and fore:
            aim(rig, fctrl, fore, target)  # 팔꿈치를 편다 (전완도 같은 방향)
            if palms_in:
                twist = twist_palms(rig, side, fctrl, fore)
        fore_ok, fore_ang = True, None
        if fore:
            _, fd = bone_dir(rig, fore)
            fore_ang = angle_from_down(fd)
            fore_ok = abs(fore_ang - angle) < 30
        if err < 2.0 and fore_ok:
            msg = f'{side}팔: {label} ({ctrl.name}) — 몸통과 {start:.0f}° → {angle_from_down(bone_dir(rig, upper)[1]):.1f}°'
            if fore_ang is not None:
                msg += f', 전완 {fore_ang:.1f}°'
            if twist is not None:
                msg += f', 손바닥 안쪽으로 {twist:+.0f}° 비틂'
            log(msg)
            return label
        # 실패 → 되돌리고 다음 후보
        for b, loc, rq, re_, raa, sc in saved:
            b.location, b.rotation_quaternion, b.rotation_euler, b.rotation_axis_angle, b.scale = loc, rq, re_, raa, sc
        for c in muted:
            c.mute = False
        if sw:
            sw['IK_FK'] = sw_old
        rig.update_tag()
        bpy.context.view_layer.update()
        log(f'{side}팔: {label} 실패 (오차 {err:.1f}°, 전완 {fore_ang}) — 다음 방법 시도')
    log(f'경고: {side}팔 A-포즈 실패 — .blend 포즈 그대로 렌더합니다 (--no-pose 로 끄거나 .blend 에서 포즈를 잡아 두세요)')
    return None


# ── 재질 · 조명 · 카메라 ─────────────────────────────────────────────────

def srgb_to_linear(hex_):
    h = hex_.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


def clay_material(name, hex_, sss):
    m = bpy.data.materials.new(name)
    if m.node_tree is None:
        m.use_nodes = True
    col = srgb_to_linear(hex_)
    m.diffuse_color = col  # 워크벤치용
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    inp = bsdf.inputs
    inp['Base Color'].default_value = col
    inp['Roughness'].default_value = 0.62
    for k, v in (('Specular IOR Level', 0.25), ('Subsurface Weight', sss), ('Subsurface Scale', 0.02),
                 ('Sheen Weight', 0.15), ('Sheen Roughness', 0.6)):
        if k in inp:
            inp[k].default_value = v
    if 'Subsurface Radius' in inp:
        inp['Subsurface Radius'].default_value = (1.0, 0.6, 0.5)
    return m


def assign(obj, mat):
    if not obj.material_slots:
        obj.data.materials.append(mat)
    for s in obj.material_slots:
        s.material = mat


def eval_points(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        oe = o.evaluated_get(dg)
        me = oe.to_mesh()
        co = np.empty(len(me.vertices) * 3, dtype=np.float64)
        me.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)
        mw = np.array(oe.matrix_world)
        pts.append(co @ mw[:3, :3].T + mw[:3, 3])
        oe.to_mesh_clear()
    return np.concatenate(pts)


def project_px(cam, pts, res):
    """월드 점 → 픽셀 (x 왼쪽부터, y 아래부터)."""
    dg = bpy.context.evaluated_depsgraph_get()
    P = np.array(cam.calc_matrix_camera(dg, x=res[0], y=res[1]))
    V = np.array(cam.matrix_world.inverted())
    h = np.c_[pts, np.ones(len(pts))] @ (P @ V).T
    ndc = h[:, :2] / h[:, 3:4]
    return (ndc + 1) / 2 * np.array(res)


def build_camera(a, pts):
    """기본 몸 한 번으로 카메라를 고정 — 발바닥 = 아래 여백, 머리 꼭대기 = 위 여백."""
    mn, mx = pts.min(0), pts.max(0)
    h = mx[2] - mn[2]
    span = h / (1 - a.margin_top - a.margin_bottom)  # 프레임 세로 (월드 m)
    frame_mid = mn[2] - a.margin_bottom * span + span / 2
    chest = mn[2] + 0.72 * h
    cx = (mn[0] + mx[0]) / 2
    cd = bpy.data.cameras.new('AVATAR_cam')
    cam = bpy.data.objects.new('AVATAR_cam', cd)
    bpy.context.scene.collection.objects.link(cam)
    cd.sensor_fit = 'VERTICAL'
    cd.clip_start, cd.clip_end = 0.01, 1000
    cam.rotation_euler = (math.radians(90), 0, 0)  # 정면 (-Y 에서 +Y 를 봄)
    if a.lens <= 0:
        cd.type = 'ORTHO'
        cd.ortho_scale = span
        cam.location = (cx, mn[1] - 3 * h, chest)
        cd.shift_y = (frame_mid - chest) / span
    else:
        cd.type = 'PERSP'
        cd.lens, cd.sensor_height = a.lens, 24.0
        dist = span * a.lens / 24.0
        cy = (mn[1] + mx[1]) / 2
        cd.shift_y = (frame_mid - chest) / span
        want_b, want_t = a.margin_bottom * a.res[1], (1 - a.margin_top) * a.res[1]
        for _ in range(6):  # 원근: 투영해 보며 거리 · 시프트를 맞춘다
            cam.location = (cx, cy - dist, chest)
            bpy.context.view_layer.update()
            px = project_px(cam, pts, a.res)
            b, t = px[:, 1].min(), px[:, 1].max()
            dist *= (t - b) / (want_t - want_b)
            cam.location = (cx, cy - dist, chest)
            bpy.context.view_layer.update()
            px = project_px(cam, pts, a.res)
            b, t = px[:, 1].min(), px[:, 1].max()
            cd.shift_y += ((b + t) / 2 - (want_b + want_t) / 2) / a.res[1]
    bpy.context.scene.camera = cam
    bpy.context.view_layer.update()
    return cam, dict(h=float(h), span=float(span), feet_z=float(mn[2]), top_z=float(mx[2]), center_x=float(cx))


def build_lights(pts):
    """3점 조명 — 몸 크기 기준 고정 위치. 키(왼쪽 앞 위) · 필(오른쪽 앞) · 림(오른쪽 뒤 위)."""
    mn, mx = pts.min(0), pts.max(0)
    h = mx[2] - mn[2]
    c = Vector(((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, mn[2] + 0.62 * h))
    s = (h / 2.0) ** 2  # 몸 크기에 맞춰 세기 보정
    spec = [  # 이름, 오프셋(×h), 크기(×h), 세기(W)
        ('key', (-0.75, -1.25, 0.45), 0.7, 125 * s),
        ('fill', (1.0, -1.0, 0.05), 1.0, 30 * s),
        ('rim', (0.6, 1.1, 0.55), 0.5, 120 * s),
        ('rim2', (-0.7, 1.0, 0.35), 0.5, 55 * s),
    ]
    for name, off, size, power in spec:
        ld = bpy.data.lights.new(f'AVATAR_{name}', 'AREA')
        ld.shape, ld.size, ld.energy = 'DISK', size * h, power
        if hasattr(ld, 'use_shadow'):
            ld.use_shadow = True
        lo = bpy.data.objects.new(f'AVATAR_{name}', ld)
        bpy.context.scene.collection.objects.link(lo)
        lo.location = c + Vector(off) * h
        lo.rotation_euler = (c - lo.location).to_track_quat('-Z', 'Y').to_euler()
        if hasattr(lo, 'visible_camera'):
            lo.visible_camera = False


def setup_world():
    w = bpy.data.worlds.new('AVATAR_world')
    if w.node_tree is None:
        w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = (0.5, 0.5, 0.5, 1)
    bg.inputs['Strength'].default_value = 0.08  # 그림자가 새까맣지 않게 약한 환경광
    bpy.context.scene.world = w


def setup_render(a):
    sc = bpy.context.scene
    r = sc.render
    r.resolution_x, r.resolution_y = a.res
    r.resolution_percentage, r.pixel_aspect_x, r.pixel_aspect_y = 100, 1, 1
    r.film_transparent = True
    r.use_motion_blur = False
    r.use_compositing = False
    r.use_sequencer = False
    r.use_simplify = False
    r.image_settings.file_format = 'PNG'
    r.image_settings.color_mode = 'RGBA'
    r.image_settings.color_depth = '8'
    r.image_settings.compression = 15
    vs = sc.view_settings
    try:
        vs.view_transform = 'AgX'
        vs.look = 'None'
    except TypeError:
        vs.view_transform = 'Standard'
    vs.exposure, vs.gamma = a.exposure, 1.0
    sc.display_settings.display_device = 'sRGB'
    if a.engine == 'cycles':
        r.engine = 'CYCLES'
        cy = sc.cycles
        cy.device = 'CPU'
        if a.gpu:
            enable_gpu(cy)
        cy.samples = a.samples
        cy.use_adaptive_sampling = True
        cy.adaptive_threshold = 0.02
        cy.max_bounces, cy.diffuse_bounces, cy.glossy_bounces = 6, 3, 2
        cy.transmission_bounces, cy.volume_bounces, cy.transparent_max_bounces = 0, 0, 4
        cy.caustics_reflective = cy.caustics_refractive = False
        cy.use_denoising = True
        try:
            cy.denoiser = 'OPENIMAGEDENOISE'
        except TypeError:
            pass
        r.use_persistent_data = True
    elif a.engine == 'eevee':
        r.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in engine_ids() else 'BLENDER_EEVEE_NEXT'
        sc.eevee.taa_render_samples = a.samples
    else:
        r.engine = 'BLENDER_WORKBENCH'
        sh = sc.display.shading
        sh.light, sh.color_type = 'STUDIO', 'MATERIAL'


def engine_ids():
    return [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]


def enable_gpu(cy):
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
    except KeyError:
        return
    for t in ('METAL', 'OPTIX', 'CUDA', 'HIP', 'ONEAPI'):
        try:
            prefs.compute_device_type = t
        except TypeError:
            continue
        prefs.get_devices()
        devs = [d for d in prefs.devices if d.type == t]
        if devs:
            for d in prefs.devices:
                d.use = d.type == t
            cy.device = 'GPU'
            log('GPU', t, ', '.join(d.name for d in devs))
            return
    log('GPU 를 찾지 못해 CPU 로 렌더합니다')


# ── WebP ─────────────────────────────────────────────────────────────────

def make_webp(png, webp, size, kb_range):
    """상한(KB) 이하에서 가장 높은 품질 (최고 품질로도 하한보다 작으면 그대로 둔다).
    Pillow 가 없으면(Blender 앱의 파이썬) Blender 의 WebP 저장으로 — 축소 필터는 Pillow(LANCZOS)보다 거칠다."""
    hi_kb = kb_range[1]
    img = None
    try:
        from PIL import Image
        im = Image.open(png).convert('RGBA').resize(size, Image.LANCZOS)

        def enc(q):
            b = io.BytesIO()
            im.save(b, 'WEBP', quality=q, method=6, alpha_quality=100)
            return b.getvalue()
    except ImportError:
        img = bpy.data.images.load(png)
        img.scale(*size)
        img.file_format = 'WEBP'
        tmp = webp + '.tmp.webp'

        def enc(q):
            img.save(filepath=tmp, quality=q)
            with open(tmp, 'rb') as f:
                return f.read()
    best = None
    data = enc(100)
    if len(data) <= hi_kb * 1024:
        best = (100, data)
    else:
        lo, hi = 40, 99
        while lo <= hi:  # 품질 이분 탐색
            q = (lo + hi) // 2
            data = enc(q)
            if len(data) <= hi_kb * 1024:
                best, lo = (q, data), q + 1
            else:
                hi = q - 1
        if best is None:
            best = (40, enc(40))
            log(f'경고: 품질 40 에서도 {len(best[1]) / 1024:.0f}KB > {hi_kb:.0f}KB')
    with open(webp, 'wb') as f:
        f.write(best[1])
    if img is not None:
        bpy.data.images.remove(img)
        if os.path.exists(webp + '.tmp.webp'):
            os.remove(webp + '.tmp.webp')
    return best[0], len(best[1]) / 1024


# ── 메인 ─────────────────────────────────────────────────────────────────

def main():
    a = parse_args()
    t0 = time.time()
    open_blend(a)
    sc = bpy.context.scene
    body = find_body(a)
    rig = armature_of(body)
    log('몸', body.name, f'({len(body.data.vertices)} 정점)', '리그', rig.name if rig else '-')

    # 리그에 붙은 메시 = 몸 · 옷 · 기타 (나머지는 렌더에서 숨긴다)
    attached = [o for o in sc.objects if rig and o.type == 'MESH' and o is not body
                and (armature_of(o) is rig or o.parent is rig)]
    if a.clothes:
        names = [n.strip() for n in a.clothes.split(',') if n.strip()]
        missing = [n for n in names if n not in bpy.data.objects]
        if missing:
            die(f'--clothes 에 없는 오브젝트: {", ".join(missing)}')
        clothes = [bpy.data.objects[n] for n in names]
    else:
        def is_cloth(o):
            words = [o.name] + [s.material.name for s in o.material_slots if s.material] + [c.name for c in o.users_collection]
            return any(CLOTH_RE.search(w) for w in words)
        clothes = [o for o in attached if is_cloth(o)]
    hide_extra = {n.strip() for n in a.hide.split(',') if n.strip()}
    extras = [o for o in attached if o not in clothes and o.name not in hide_extra]
    keep = [o for o in [body] + clothes + extras if o.name not in hide_extra]
    log('옷', [o.name for o in clothes] or '-', '| 기타(몸 색)', [o.name for o in extras] or '-')

    freeze_animation([rig, rig.data if rig else None] + [o.data.shape_keys for o in keep if o.data.shape_keys])

    # 셰이프 키
    keys = {}
    for role, name, levels in (('fat', a.fat_key, a.fat_levels), ('muscle', a.muscle_key, a.muscle_levels)):
        kb = find_key(body, name)
        if not kb:
            if not a.allow_missing_keys:
                die(f'몸 메시 "{body.name}" 에 셰이프 키 "{name}" 이(가) 없습니다.\n'
                    f'  있는 키: {", ".join(key_names(body)) or "(없음)"}\n'
                    f'  → .blend 에 키를 만들거나 --{role}-key 로 이름을 지정하세요. (점검만: --allow-missing-keys)')
            log(f'경고: "{name}" 키 없음 — --allow-missing-keys 라 모든 칸이 같은 몸으로 렌더됩니다')
            continue
        prepare_key(kb, levels)
        linked = [kb]
        for o in clothes + extras:  # 옷에 같은 이름 키가 있으면 같이 움직인다
            ck = find_key(o, name)
            if ck:
                prepare_key(ck, levels)
                linked.append(ck)
        keys[role] = linked
        log(f'키 {role}: "{kb.name}"' + (f' (+옷 {len(linked) - 1})' if len(linked) > 1 else ''), '값', levels)

    def set_cell(fv, mv):
        for kb in keys.get('fat', []):
            kb.value = fv
        for kb in keys.get('muscle', []):
            kb.value = mv
        body.data.update()
        bpy.context.view_layer.update()

    # 중립(키 0) 몸으로 포즈 · 프레이밍을 한 번만
    set_cell(0.0, 0.0)
    pts0 = eval_points([body])
    center_x = float((pts0[:, 0].min() + pts0[:, 0].max()) / 2)
    pose = {}
    if not a.no_pose and rig:
        for side in ('L', 'R'):
            pose[side] = pose_arm(rig, side, a.arm_angle, center_x, a.palms == 'in')
        if rig.animation_data:
            rig.animation_data.use_nla = False
        bpy.context.view_layer.update()
    pts0 = eval_points([body])

    # 숨기기 · 재질 · 조명 · 카메라
    keep_set = set(keep)
    for o in sc.objects:
        if o in keep_set or o.type == 'ARMATURE':
            continue
        if o.type == 'LIGHT' and a.keep_scene_lights:
            continue
        o.hide_render = True
    for o in keep:
        o.hide_render = False
    body_mat = clay_material('AVATAR_clay_body', a.body_color, a.sss)
    cloth_mat = clay_material('AVATAR_clay_cloth', a.cloth_color, 0.0)
    for o in [body] + extras:
        assign(o, body_mat)
    for o in clothes:
        assign(o, cloth_mat)
    setup_render(a)
    if not a.keep_scene_lights:
        setup_world()
        build_lights(pts0)
    cam, frame = build_camera(a, pts0)
    px0 = project_px(cam, pts0, a.res)
    log(f'프레임: 키 {frame["h"]:.3f}m · 발 {px0[:, 1].min():.1f}px · 머리 {a.res[1] - px0[:, 1].max():.1f}px(위에서) · '
        f'{"직교" if a.lens <= 0 else f"원근 {a.lens:g}mm"} · {a.res[0]}x{a.res[1]} · {sc.render.engine} {a.samples}spp')

    # 렌더
    os.makedirs(a.out, exist_ok=True)
    cells = a.cells or [(f, m) for m in range(1, 6) for f in range(1, 6)]
    log_path = os.path.join(a.out, 'render-log.json')
    try:
        with open(log_path) as f:
            report = json.load(f)
    except (OSError, ValueError):
        report = {}
    report.update(blend=bpy.data.filepath, sex=a.sex, body=body.name, res=a.res, samples=a.samples,
                  engine=sc.render.engine, camera='ortho' if a.lens <= 0 else f'persp {a.lens}mm',
                  arm_angle=None if a.no_pose else a.arm_angle, pose=pose, frame=frame,
                  keys={r: kbs[0].name for r, kbs in keys.items()},
                  fat_levels=a.fat_levels, muscle_levels=a.muscle_levels)
    report.setdefault('cells', {})
    for i, (f, m) in enumerate(cells, 1):
        name = f'avatar_{a.sex}_F{f}M{m}'
        png = os.path.join(a.out, name + '.png')
        if a.skip_existing and os.path.exists(png):
            log(f'[{i}/{len(cells)}] {name} 있음 — 건너뜀')
            continue
        fv, mv = a.fat_levels[f - 1], a.muscle_levels[m - 1]
        set_cell(fv, mv)
        px = project_px(cam, eval_points([body]), a.res)
        feet, head = px[:, 1].min(), a.res[1] - px[:, 1].max()
        out_frame = px[:, 0].min() < 0 or px[:, 0].max() > a.res[0] or feet < 0 or head < 0
        drift = abs(feet - px0[:, 1].min()) > 1 or abs(head - (a.res[1] - px0[:, 1].max())) > 1
        t = time.time()
        sc.render.filepath = png
        bpy.ops.render.render(write_still=True)
        dt = time.time() - t
        entry = dict(fat=fv, muscle=mv, seconds=round(dt, 1), feet_px=round(float(feet), 1), head_px=round(float(head), 1))
        kv = ' '.join(f'{r}={v:g}' if r in keys else f'{r}=(키 없음)' for r, v in (('fat', fv), ('muscle', mv)))
        msg = f'[{i}/{len(cells)}] {name}  {kv}  {dt:.1f}s  발 {feet:.1f}px 머리 {head:.1f}px'
        if out_frame:
            msg += '  ⚠ 프레임 밖으로 나감'
        if drift:
            msg += '  ⚠ 발/머리 위치가 기본 몸과 다름 (키가 키·발 높이를 바꾼다)'
        if not a.no_webp:
            q, kb = make_webp(png, os.path.join(a.out, name + '.webp'), a.webp_res, a.webp_kb)
            entry.update(webp_q=q, webp_kb=round(kb, 1))
            msg += f'  webp q{q} {kb:.0f}KB'
        report['cells'][f'F{f}M{m}'] = entry
        log(msg)
        with open(log_path, 'w') as fp:
            json.dump(report, fp, ensure_ascii=False, indent=1)
    log(f'끝 — {len(cells)}칸, {time.time() - t0:.0f}s → {os.path.abspath(a.out)}')


if __name__ == '__main__':
    main()
