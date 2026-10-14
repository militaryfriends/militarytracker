"""
3D 아바타 모델(.glb) 만들기 — .blend 몸 하나 → 폰에서 돌릴 수 있는 가벼운 메시 + "살 · 근육" 모프 4개.

    PY=/path/to/bpy-python   # bpy 모듈 (scripts/AVATARS.md 참고)
    $PY scripts/build-avatar-3d.py -- --blend Miltary_Friend_Model.blend --sex m --out assets/avatar/avatar_m.raw.glb
    npx @gltf-transform/cli meshopt assets/avatar/avatar_m.raw.glb assets/avatar/avatar_m.glb   # 압축

모프 타깃(셰이프 키) 4개 — 앱이 엔진 좌표(체지방 f · 근육 m, 1.0~5.0)로 값을 정한다(src/components/body/avatar3d/morph.ts).
  fat_up    기본 몸 → 체지방 F5      fat_down  기본 몸 → F1
  mus_up    기본 몸 → 근육 M5        mus_down  기본 몸 → M1
기본 몸 = .blend 에 있는 몸 그대로(BASE_COORD). 몸 메시에 같은 이름의 셰이프 키가 있으면 그걸 쓰고(모델러가 만든 키),
없으면 이 스크립트가 부위별(리그의 DEF 본 가중치)로 부풀리고 · 줄이고 · 근육 결을 펴서 임시 키를 만든다.
옷(반바지)은 가까운 몸 정점의 변화를 그대로 따라간다.

포즈는 A-포즈(팔과 몸통 --arm-angle 도), 리그 · 재질 · 텍스처는 버린다(앱이 회색 클레이로 그린다).
"""
import argparse
import importlib.util
import json
import math
import os
import sys

sys.dont_write_bytecode = True  # render-avatars.py 를 가져와도 scripts/__pycache__ 를 만들지 않게

import bpy
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('render_avatars', os.path.join(HERE, 'render-avatars.py'))
ra = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ra)

KEYS = ('fat_up', 'fat_down', 'mus_up', 'mus_down')


def log(*a):
    print('[avatar3d]', *a, flush=True)


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--blend', required=True)
    p.add_argument('--sex', choices=['m', 'f'], required=True)
    p.add_argument('--out', required=True, help='.glb 경로')
    p.add_argument('--body', default='', help='몸 메시 이름 (기본: 아마추어가 붙은 가장 큰 메시)')
    p.add_argument('--clothes', default='', help='옷 메시 이름들, 쉼표 (기본: 리그에 붙은 나머지 메시)')
    p.add_argument('--arm-angle', type=float, default=17.0)
    p.add_argument('--body-tris', type=int, default=24000, help='몸 삼각형 수 목표')
    p.add_argument('--cloth-tris', type=int, default=5000)
    p.add_argument('--preview', default='', help='모프별 정면 · 측면 렌더를 이 폴더에')
    return p.parse_args(argv)


# ── 메시 유틸 ─────────────────────────────────────────────────────────────

def evaluated_copy(obj, name):
    """모디파이어 · 포즈 · 셰이프 키가 적용된 상태를 월드 좌표의 새 메시 오브젝트로."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=False, depsgraph=dg)
    me.name = name
    me.transform(obj.matrix_world)
    new = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(new)
    return new


def positions(me):
    a = np.empty(len(me.vertices) * 3, np.float64)
    me.vertices.foreach_get('co', a)
    return a.reshape(-1, 3)


def vertex_normals(me):
    a = np.empty(len(me.vertices) * 3, np.float64)
    me.vertex_normals.foreach_get('vector', a)
    return a.reshape(-1, 3)


def edges_of(me):
    e = np.empty(len(me.edges) * 2, np.int64)
    me.edges.foreach_get('vertices', e)
    return e.reshape(-1, 2)


def neighbor_mean(x, edges, n):
    """정점마다 이웃 평균 (x: (n,) 또는 (n,3))."""
    acc = np.zeros_like(x)
    cnt = np.zeros(n)
    np.add.at(acc, edges[:, 0], x[edges[:, 1]])
    np.add.at(acc, edges[:, 1], x[edges[:, 0]])
    np.add.at(cnt, edges[:, 0], 1)
    np.add.at(cnt, edges[:, 1], 1)
    cnt[cnt == 0] = 1
    return acc / (cnt[:, None] if x.ndim == 2 else cnt)


def diffuse(x, edges, n, it, k=0.5):
    for _ in range(it):
        x = x + k * (neighbor_mean(x, edges, n) - x)
    return x


def taubin(P, edges, it, lam=0.5, mu=-0.53):
    """부피를 덜 잃는 스무딩 — 근육 결(복근 · 혈관)을 편다."""
    n = len(P)
    for _ in range(it):
        P = P + lam * (neighbor_mean(P, edges, n) - P)
        P = P + mu * (neighbor_mean(P, edges, n) - P)
    return P


def decimate(obj, tris):
    cur = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    if cur <= tris:
        return
    m = obj.modifiers.new('dec', 'DECIMATE')
    m.ratio = tris / cur
    m.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = obj
    with bpy.context.temp_override(object=obj, active_object=obj):
        bpy.ops.object.modifier_apply(modifier=m.name)
    log(f'{obj.name}: 삼각형 {cur} → {sum(len(p.vertices) - 2 for p in obj.data.polygons)}')


def transfer(src_P, src_D, dst_P, k=6):
    """src 정점의 변위 D 를 dst 정점으로 (가까운 k개 거리 가중 평균)."""
    kd = KDTree(len(src_P))
    for i, p in enumerate(src_P):
        kd.insert(p, i)
    kd.balance()
    out = {key: np.zeros_like(dst_P) for key in src_D}
    for j, q in enumerate(dst_P):
        hits = kd.find_n(q, k)
        w = np.array([1.0 / max(d, 1e-5) for _, _, d in hits])
        idx = [i for _, i, _ in hits]
        w /= w.sum()
        for key, D in src_D.items():
            out[key][j] = (D[idx] * w[:, None]).sum(0)
    return out


def transfer_cloth(src_P, src_D, dst_P, dst_N, radius):
    """옷 정점은 아래 몸이 바깥으로 가장 많이 나온 쪽을 따른다 — 평균만 쓰면 배 · 사타구니가 옷을 뚫는다."""
    kd = KDTree(len(src_P))
    for i, p in enumerate(src_P):
        kd.insert(p, i)
    kd.balance()
    out = {key: np.zeros_like(dst_P) for key in src_D}
    for j, q in enumerate(dst_P):
        hits = kd.find_range(q, radius)
        if len(hits) < 4:
            hits = kd.find_n(q, 8)
        idx = np.array([i for _, i, _ in hits])
        dist = np.array([d for _, _, d in hits])
        n = dst_N[j]
        for key, D in src_D.items():
            Dk = D[idx]
            push = Dk @ n
            w = np.exp((push - push.max()) * 60.0) / (1.0 + dist / radius)
            w /= w.sum()
            out[key][j] = (Dk * w[:, None]).sum(0)
    return out


def set_keys(obj, base, disp):
    obj.shape_key_add(name='Basis', from_mix=False)
    for key in KEYS:
        kb = obj.shape_key_add(name=key, from_mix=False)
        kb.data.foreach_set('co', (base + disp[key]).astype(np.float32).ravel())
        kb.value = 0.0
    obj.data.update()


# ── 임시 모프 (부위 가중치 × 방향 × 높이) ────────────────────────────────

def group_weights(obj, n):
    """원본 몸의 DEF 본 정점 그룹 가중치 (아마추어 · 스무딩은 정점 순서를 바꾸지 않는다)."""
    names = {g.index: g.name for g in obj.vertex_groups}
    W = {}
    for v in obj.data.vertices:
        for g in v.groups:
            nm = names[g.group]
            if nm.startswith('DEF-'):
                W.setdefault(nm, np.zeros(n))[v.index] = g.weight
    return W


def region(W, n, *prefixes):
    r = np.zeros(n)
    for nm, w in W.items():
        base = nm[4:]
        if any(base == p or base.startswith(p + '.') for p in prefixes):
            r += w
    return np.clip(r, 0, 1)


def procedural(P, Nrm, edges, W, rig, H):
    n = len(P)
    s = H / 2.0  # 아래 수치는 키 2.0 m 기준 (이 모델) — 다른 키면 비례
    mw = rig.matrix_world

    def bz(name):
        pb = rig.pose.bones.get(name)
        return (mw @ pb.head).z if pb else None

    pelvis = bz('DEF-spine') or 0.52 * H
    navel = (bz('DEF-spine.001') or 0.6 * H) + 0.03 * s
    chest = bz('DEF-spine.003') or 0.73 * H
    axis_y = float(np.median(P[:, 1]))

    lower = region(W, n, 'spine', 'spine.001', 'pelvis')
    mid = region(W, n, 'spine.002')
    chest_r = region(W, n, 'spine.003', 'breast')
    shoulder = region(W, n, 'shoulder')
    uarm = region(W, n, 'upper_arm')
    farm = region(W, n, 'forearm')
    thigh = region(W, n, 'thigh')
    shin = region(W, n, 'shin')
    neck = region(W, n, 'spine.004', 'spine.005')
    head = region(W, n, 'spine.006')
    torso = np.clip(lower + mid + chest_r, 0, 1)

    # 몸통 둘레 각도: 앞(-Y) 0, 옆 ±90, 뒤 180
    th = np.arctan2(P[:, 0], -(P[:, 1] - axis_y))
    front = np.clip(np.cos(th), 0, 1)
    back = np.clip(-np.cos(th), 0, 1)
    side = np.abs(np.sin(th))
    # 팔 · 다리는 정점 법선 방향으로 앞뒤를 본다
    nfront = np.clip(-Nrm[:, 1], 0, 1)
    nback = np.clip(Nrm[:, 1], 0, 1)
    z = P[:, 2]
    g = lambda c, sig: np.exp(-0.5 * ((z - c) / sig) ** 2)

    # 사타구니 쪽(골반 아래)은 배처럼 나오지 않는다
    above_pelvis = np.clip((z - (pelvis + 0.01 * s)) / (0.09 * s), 0, 1) ** 1.5
    fat_up = s * (
        torso * 0.03
        + (lower + mid) * g(navel, 0.15 * s) * front ** 1.2 * above_pelvis * 0.085   # 배
        + lower * g(pelvis + 0.15 * s, 0.09 * s) * side ** 2 * 0.045                  # 옆구리
        + lower * back * 0.018
        + chest_r * 0.012                                                            # 가슴
        + thigh * (0.026 + 0.018 * g(pelvis - 0.05 * s, 0.1 * s))                    # 허벅지 · 엉덩이
        + uarm * (0.014 + 0.01 * nback)
        + farm * 0.005 + shin * 0.007
        + neck * 0.018 + head * nfront * 0.006
    )
    fat_down = -s * (
        (lower + mid) * g(navel, 0.14 * s) * (front + side) * 0.01
        + lower * side * 0.008 + torso * 0.003 + thigh * 0.004 + uarm * 0.003
    )
    muscle = (
        shoulder * 0.022 + uarm * 0.017 + farm * 0.008
        + chest_r * front * 0.018
        + (mid + chest_r) * (side * 0.016 + back * 0.012)                # 광배 · 등
        + neck * 0.012 * (1 - front)                                     # 승모
        + thigh * 0.016 + shin * nback * 0.011
        + lower * back * 0.008
    )
    mus_up = s * muscle * 0.75
    mus_down = -s * muscle * 1.3

    # 경계가 튀지 않게 변위량을 메시 위에서 퍼뜨린다
    amp = {k: diffuse(v, edges, n, 30) for k, v in
           (('fat_up', fat_up), ('fat_down', fat_down), ('mus_up', mus_up), ('mus_down', mus_down))}
    Nn = diffuse(Nrm, edges, n, 6)
    Nn /= np.linalg.norm(Nn, axis=1, keepdims=True) + 1e-9

    Ps = taubin(P, edges, 60)
    detail = P - Ps
    flat_fat = np.clip(torso + 0.6 * uarm + 0.5 * thigh + 0.4 * shoulder, 0, 1)
    flat_mus = np.clip(torso * 0.6 + uarm + farm + shoulder + thigh + shin * 0.6, 0, 1)
    flat_fat = diffuse(flat_fat, edges, n, 8)
    flat_mus = diffuse(flat_mus, edges, n, 8)

    T = {
        # 살: 복근 · 혈관이 묻히게 결을 85% 펴고 부풀린다
        'fat_up': P - detail * (0.95 * flat_fat)[:, None] + Nn * amp['fat_up'][:, None],
        # 더 마르게: 결을 조금 더 세우고 살짝 줄인다
        'fat_down': P + detail * (0.18 * flat_fat)[:, None] + Nn * amp['fat_down'][:, None],
        'mus_up': P + detail * (0.12 * flat_mus)[:, None] + Nn * amp['mus_up'][:, None],
        # 근육 적게: 줄이고 결을 반쯤 편다
        'mus_down': P - detail * (0.7 * flat_mus)[:, None] + Nn * amp['mus_down'][:, None],
    }
    return {k: T[k] - P for k in KEYS}


def keys_from_blend(body, base_P):
    """모델러가 만든 같은 이름의 셰이프 키가 있으면 그 변위를 쓴다(포즈 · 스무딩 적용 뒤 값으로)."""
    sk = body.data.shape_keys
    if not sk or not all(k in sk.key_blocks for k in KEYS):
        return None
    out = {}
    saved = {kb.name: kb.value for kb in sk.key_blocks}
    for key in KEYS:
        for kb in sk.key_blocks[1:]:
            kb.value = saved[kb.name] if kb.name not in KEYS else 0.0
        sk.key_blocks[key].value = 1.0
        bpy.context.view_layer.update()
        tmp = evaluated_copy(body, '_tmp')
        out[key] = positions(tmp.data) - base_P
        bpy.data.objects.remove(tmp)
    for kb in sk.key_blocks:
        kb.value = saved[kb.name]
    bpy.context.view_layer.update()
    log('모델러 셰이프 키 사용:', ', '.join(KEYS))
    return out


# ── 미리보기 ─────────────────────────────────────────────────────────────

def preview(objs, folder):
    os.makedirs(folder, exist_ok=True)
    sc = bpy.context.scene
    keep = set(o.name for o in objs)
    for o in sc.objects:
        o.hide_render = o.name not in keep
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'
    sc.display.shading.color_type = 'SINGLE'
    sc.display.shading.single_color = (0.72, 0.72, 0.73)
    sc.render.resolution_x, sc.render.resolution_y = 300, 450
    P = np.concatenate([positions(o.data) for o in objs])
    mn, mx = P.min(0), P.max(0)
    c = (mn + mx) / 2
    cam = bpy.data.objects.new('PC', bpy.data.cameras.new('PC'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = (mx[2] - mn[2]) * 1.08
    states = [('base', {})] + [(k, {k: 1.0}) for k in KEYS] + [('F5M1', {'fat_up': 1, 'mus_down': 1}), ('F5M5', {'fat_up': 1, 'mus_up': 1}),
                                                              ('F1M1', {'fat_down': 1, 'mus_down': 1}), ('F1M5', {'fat_down': 1, 'mus_up': 1})]
    for name, vals in states:
        for o in objs:
            for kb in o.data.shape_keys.key_blocks[1:]:
                kb.value = vals.get(kb.name, 0.0)
        for view in ('front', 'side'):
            if view == 'front':
                cam.location = (c[0], mn[1] - 5, c[2])
                cam.rotation_euler = (math.radians(90), 0, 0)
            else:
                cam.location = (mx[0] + 5, c[1], c[2])
                cam.rotation_euler = (math.radians(90), 0, math.radians(90))
            sc.render.filepath = os.path.join(folder, f'{name}_{view}.png')
            bpy.ops.render.render(write_still=True)
    for o in objs:
        for kb in o.data.shape_keys.key_blocks[1:]:
            kb.value = 0.0


# ── main ─────────────────────────────────────────────────────────────────

def main():
    a = parse_args()
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(a.blend), load_ui=False)
    sc = bpy.context.scene
    body = bpy.data.objects[a.body] if a.body else ra.find_body(argparse.Namespace(body=''))
    rig = ra.armature_of(body)
    if a.clothes:
        clothes = [bpy.data.objects[n.strip()] for n in a.clothes.split(',') if n.strip()]
    else:
        clothes = [o for o in sc.objects if o.type == 'MESH' and o is not body and rig
                   and (ra.armature_of(o) is rig or o.parent is rig)]
    log('몸', body.name, len(body.data.vertices), '| 옷', [o.name for o in clothes])
    ra.freeze_animation([rig, rig.data] + [o.data.shape_keys for o in [body] + clothes if o.data.shape_keys])

    # 모델러 키가 있으면 기본 상태에서는 0
    sk = body.data.shape_keys
    if sk:
        for k in KEYS:
            if k in sk.key_blocks:
                sk.key_blocks[k].value = 0.0

    # A-포즈
    tmp = evaluated_copy(body, '_tmp')
    cx = float((positions(tmp.data)[:, 0].min() + positions(tmp.data)[:, 0].max()) / 2)
    bpy.data.objects.remove(tmp)
    for side in ('L', 'R'):
        ra.pose_arm(rig, side, a.arm_angle, cx, True)
    bpy.context.view_layer.update()

    # 몸 (고해상도) — 변위는 여기서 계산하고 저해상도로 옮긴다
    hi = evaluated_copy(body, '_hi')
    P = positions(hi.data)
    H = float(P[:, 2].max() - P[:, 2].min())
    if len(P) != len(body.data.vertices):
        raise SystemExit('모디파이어가 정점 수를 바꿨습니다 — 정점 그룹을 맞출 수 없습니다')
    D = keys_from_blend(body, P)
    procedural_keys = D is None
    if D is None:
        log('셰이프 키 fat_up/fat_down/mus_up/mus_down 없음 → 임시 모프를 만듭니다')
        D = procedural(P, vertex_normals(hi.data), edges_of(hi.data), group_weights(body, len(P)), rig, H)

    # 저해상도 몸
    lo = evaluated_copy(body, 'body')
    decimate(lo, a.body_tris)
    lo_P = positions(lo.data)
    set_keys(lo, lo_P, transfer(P, D, lo_P, k=6))

    # 옷: 합치고 줄인 뒤 가까운 몸 변위를 따른다
    outs = [lo]
    if clothes:
        parts = [evaluated_copy(o, f'_c{i}') for i, o in enumerate(clothes)]
        bm = bmesh.new()
        for o in parts:
            bm.from_mesh(o.data)
            bpy.data.objects.remove(o)
        me = bpy.data.meshes.new('clothes')
        bm.to_mesh(me)
        bm.free()
        cl = bpy.data.objects.new('clothes', me)
        sc.collection.objects.link(cl)
        decimate(cl, a.cloth_tris)
        cl.data.validate()
        cP = positions(cl.data)
        cN = vertex_normals(cl.data)
        cD = transfer_cloth(P, D, cP, cN, 0.06 * H / 2)
        # 옷은 천 — 변위를 옷 위에서 고르게 펴되(앞판이 허리띠를 따라 같이 나온다) 몸보다 안으로는 들어가지 않게
        cE = edges_of(cl.data)
        for key in KEYS:
            t = cD[key]
            sm = diffuse(t, cE, len(cP), 40)
            need = np.maximum(0.0, (t * cN).sum(1) - (sm * cN).sum(1))
            cD[key] = sm + cN * need[:, None]
        set_keys(cl, cP, cD)
        outs.append(cl)
    bpy.data.objects.remove(hi)

    # 바닥 = 발바닥, 가운데 = 0
    allP = np.concatenate([positions(o.data) for o in outs])
    off = Vector((-(allP[:, 0].min() + allP[:, 0].max()) / 2, -(allP[:, 1].min() + allP[:, 1].max()) / 2, -allP[:, 2].min()))
    for o in outs:
        for kb in o.data.shape_keys.key_blocks:
            for d in kb.data:
                d.co += off
        o.data.vertices.foreach_set('co', np.array([d.co for d in o.data.shape_keys.key_blocks[0].data]).ravel())
        o.data.update()
        o.data.materials.clear()
        for p in o.data.polygons:
            p.use_smooth = True

    if a.preview:
        preview(outs, a.preview)

    # 내보내기 — 메시 · 모프만
    for o in sc.objects:
        o.select_set(False)
    for o in outs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = outs[0]
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(a.out), export_format='GLB', use_selection=True,
        export_apply=False, export_skins=False, export_animations=False,
        export_morph=True, export_morph_normal=True, export_materials='NONE',
        export_texcoords=False, export_vertex_color='NONE', export_yup=True, export_cameras=False, export_lights=False,
    )
    meta = {
        'sex': a.sex, 'heightM': round(H, 3), 'keys': list(KEYS),
        'tris': {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in outs},
        'source': os.path.basename(a.blend), 'procedural': procedural_keys,
    }
    log('완료', a.out, json.dumps(meta, ensure_ascii=False))


if __name__ == '__main__':
    main()
