"""
3D 아바타(.glb) — MakeHuman(CC0) 기본 메시 + 체중 · 근육 매크로 타깃. 남녀 같은 파이프라인 (2026-11-01, 피드백 P2 · P3).

    # 재료는 build-avatar-female.py 맨 위와 같다 (~/mh 에 targets.npz · base.obj)
    PY=~/.venv-bpy/bin/python
    cd /tmp && $PY ~/…/scripts/build-avatar-mh.py -- --sex m --mh ~/mh --out /tmp/avatar_m.raw.glb --tex /tmp/m_tex --preview /tmp/m_prev
    cd /tmp && $PY ~/…/scripts/build-avatar-mh.py -- --sex f --mh ~/mh --out /tmp/avatar_f.raw.glb --tex /tmp/f_tex

약속(앱 morph.ts · stage.ts 와 같음)
  · 메시 이름 body · clothes, 모프 4개 fat_up · fat_down · mus_up · mus_down
  · 기본 몸 = 중간 체형(남 F3 · M3 근처, 여 F2 · M3) — 근육 결이 은은한 몸에서 빼고 더한다(풍선을 붙이지 않는다)
  · 모프는 진짜 체형 타깃(MakeHuman 체중 · 근육 매크로) — 살은 배 한 곳이 아니라 몸 전체에 같이 붙는다
  · 자세: 힘 뺀 선 자세 — 팔 몸통에서 9° (살 · 근육 모프에서는 몸에 박히지 않게 더 벌림), 팔꿈치 10°, 쇄골 4° 내림, 좌우 대칭
  · 얼굴 없는 마네킹 머리, 정면 -Y, 발바닥 z = 0
옷: 남 = 반바지, 여 = 스포츠 브라 + 반바지 (위장무늬, 몸을 평면으로 잘라 띄움 — 모프마다 몸을 그대로 따라간다)
"""
import argparse
import importlib.util
import math
import os
import sys

sys.dont_write_bytecode = True

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('avatar_f', os.path.join(HERE, 'build-avatar-female.py'))
fm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fm)
av = fm.av
KEYS = av.KEYS
SCALE = fm.SCALE

# (근육, 체중) — MakeHuman 매크로 0~1, 0.5 = 평균
SPEC = {
    'm': {
        'base': (0.5, 0.5),        # F3 · M3 근처 — 평균 체형
        'fat_up': (0.5, 1.0),      # F5 (남 약 28%)
        'fat_down': (0.5, 0.0),    # F1 (남 약 9%)
        'mus_up': (1.0, 0.5),      # M5
        'mus_down': (0.0, 0.5),    # M1
        'fat_gain': 1.3,
        # 매크로만으로는 F5(28%)의 배 · 옆구리가 덜 나온다 — 살은 몸 전체에: 아랫배 한 덩어리 · 옆구리 · 엉덩이 · 팔다리 · 목/턱 밑
        'extra': {
            'fat_up': [('stomach/stomach-pregnant-incr', 0.55), ('stomach/stomach-navel-in', 0.35), ('torso/torso-scale-depth-incr', 0.35),
                       ('hip/hip-scale-horiz-incr', 0.3), ('buttocks/buttocks-volume-incr', 0.35), ('neck/neck-double-incr', 0.5),
                       ('armslegs/{s}-upperarm-fat-incr', 0.35), ('armslegs/{s}-upperleg-fat-incr', 0.5), ('armslegs/{s}-lowerleg-fat-incr', 0.3)],
            'fat_down': [('stomach/stomach-pregnant-decr', 0.35), ('stomach/stomach-tone-incr', 0.35),
                         ('armslegs/{s}-upperarm-fat-decr', 0.5), ('armslegs/{s}-upperleg-fat-decr', 0.4)],
            'mus_up': [('torso/torso-muscle-pectoral-incr', 0.5), ('torso/torso-vshape-incr', 0.45), ('torso/torso-muscle-dorsi-incr', 0.4),
                       ('armslegs/{s}-upperarm-muscle-incr', 0.3), ('armslegs/{s}-upperarm-shoulder-muscle-incr', 0.3),
                       ('armslegs/{s}-upperleg-muscle-incr', 0.35), ('armslegs/{s}-lowerarm-muscle-incr', 0.3)],
            'mus_down': [('torso/torso-vshape-decr', 0.3), ('armslegs/{s}-upperarm-muscle-decr', 0.4),
                         ('armslegs/{s}-upperarm-shoulder-muscle-decr', 0.4), ('armslegs/{s}-upperleg-muscle-decr', 0.3)],
        },
    },
    'f': {
        'base': (0.55, 0.38),
        'fat_up': (0.55, 1.0),
        'fat_down': (0.55, 0.05),
        'mus_up': (1.0, 0.38),
        'mus_down': (0.0, 0.38),
        'fat_gain': 1.35,
        'extra': {
            'fat_up': [('stomach/stomach-pregnant-incr', 0.4), ('stomach/stomach-navel-in', 0.25), ('hip/hip-scale-horiz-incr', 0.2),
                       ('buttocks/buttocks-volume-incr', 0.3), ('neck/neck-double-incr', 0.3),
                       ('armslegs/{s}-upperarm-fat-incr', 0.35), ('armslegs/{s}-upperleg-fat-incr', 0.35)],
            'fat_down': [('stomach/stomach-pregnant-decr', 0.25), ('armslegs/{s}-upperarm-fat-decr', 0.4)],
            'mus_up': [('torso/torso-vshape-incr', 0.25), ('armslegs/{s}-upperarm-shoulder-muscle-incr', 0.3),
                       ('armslegs/{s}-upperleg-muscle-incr', 0.3)],
        },
        # 골반이 넓어 팔을 더 벌려야 몸에 닿지 않는다
        'arm_add': 4.0,
    },
}
# 모양마다 팔 각도(팔과 몸통 사이, 도) — 살 · 근육이 붙은 몸은 팔이 몸에 박히지 않게 더 벌린다
ARM = {'base': 9.0, 'fat_up': 16.0, 'fat_down': 8.0, 'mus_up': 13.0, 'mus_down': 8.0}
ELBOW = 8.0
CLAVICLE = 4.0


def log(*a):
    print('[avatar-mh]', *a, flush=True)


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--sex', choices=['m', 'f'], required=True)
    p.add_argument('--mh', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--tex', default='')
    p.add_argument('--preview', default='')
    return p.parse_args(argv)


class MH(fm.MH):
    def __init__(self, folder, sex):
        super().__init__(folder)
        self.g = 'male' if sex == 'm' else 'female'

    def shape(self, muscle, weight, extra=()):
        V = self.V0.copy()
        for name, w in extra:
            for side in (('l', 'r') if '{s}' in name else ('',)):
                self._add(V, name.replace('{s}', side), w)
        g = self.g
        for mk, mv in self._tri(muscle).items():
            for wk, wv in self._tri(weight).items():
                f = mv * wv
                self._add(V, f'macrodetails/universal-{g}-young-{mk}muscle-{wk}weight', f)
                self._add(V, f'macrodetails/proportions/{g}-young-{mk}muscle-{wk}weight-idealproportions', f * 0.5)
        for race in ('african', 'asian', 'caucasian'):
            self._add(V, f'macrodetails/{race}-{g}-young', 1 / 3)
        return V


def mannequin_head(P, edges, z_neck, z_top):
    """build-avatar-female.py 의 마네킹 머리 + 턱 처리: 목 앞으로 튀어나온 턱 · 입 아래 정점도 머리로 본다.
    (원본은 높이로만 섞어서, 남성처럼 턱이 목 높이까지 내려오면 턱이 새 부리처럼 남고 그 아래가 검게 파였다)"""
    n = len(P)
    span = z_top - z_neck
    t = np.clip((P[:, 2] - z_neck) / (0.16 * span), 0, 1)
    w = t * t * (3 - 2 * t)
    # 목 앞면: 목 높이 띠의 앞쪽(가장 작은 y) — 그보다 앞에 있고 목~머리 사이 높이면 턱
    # 목 가운데(좌우 3cm 안)의 목 높이 ~ 4cm 위 띠 — 가슴 · 승모 앞면이 섞이지 않게
    # (z_neck 는 목 관절 위 — 남성은 턱 밑면이 거의 이 높이라, 목 앞면은 그보다 아래 띠에서 잰다)
    band = (P[:, 2] > z_neck - 0.07) & (P[:, 2] < z_neck - 0.03) & (np.abs(P[:, 0]) < 0.03)
    front = np.percentile(P[band, 1], 3) if band.any() else P[:, 1].min()
    chin = (P[:, 2] > z_neck - 0.04) & (P[:, 2] < z_neck + 0.45 * span) & (np.abs(P[:, 0]) < 0.08) & (P[:, 1] < front - 0.008)
    log(f'턱 정점 {int(chin.sum())}')
    w[chin] = 1.0
    # 그 둘레를 부드럽게 (턱 경계에 계단이 생기지 않게)
    for _ in range(6):
        m = av.neighbor_mean(w[:, None], edges, n)[:, 0]
        w = np.maximum(w, np.where(P[:, 2] > z_neck - 0.04, m, 0))
    hd = P[:, 2] > z_neck + 0.25 * span
    H = P[hd]
    mid = H[(H[:, 2] > z_neck + 0.45 * span) & (H[:, 2] < z_neck + 0.75 * span)]
    c = np.array([np.median(H[:, 0]), (np.percentile(mid[:, 1], 99) + np.percentile(mid[:, 1], 1)) / 2, 0.0])
    ax = np.percentile(np.abs(mid[:, 0] - c[0]), 90)
    ay = (np.percentile(mid[:, 1], 99) - np.percentile(mid[:, 1], 1)) / 2 * 1.03
    az = (z_top - (z_neck + 0.06 * span)) / 2
    c[2] = z_top - az

    def egg(U):
        lo = ((1 - U[:, 2]) / 2) ** 2
        sx = ax * (1.08 - 0.36 * lo)
        sy = ay * (1.05 - 0.24 * lo)
        return 1.0 / np.sqrt((U[:, 0] / sx) ** 2 + (U[:, 1] / sy) ** 2 + (U[:, 2] / az) ** 2)

    def project(Q):
        d = Q - c
        U = d / (np.linalg.norm(d, axis=1, keepdims=True) + 1e-12)
        return c + U * egg(U)[:, None]

    d = P - c
    U = d / (np.linalg.norm(d, axis=1, keepdims=True) + 1e-12)
    for _ in range(20):
        U = U + (0.5 * w)[:, None] * (av.neighbor_mean(U, edges, n) - U)
        U /= np.linalg.norm(U, axis=1, keepdims=True) + 1e-12
    Q = c + U * egg(U)[:, None]
    out = P + (Q - P) * w[:, None]
    full = w > 0.98
    for _ in range(200):
        m = av.neighbor_mean(out, edges, n)
        out = out + (0.5 * w)[:, None] * (m - out)
        out[full] = project(out[full])
    band = (w > 0.02) & (w < 0.98)
    for _ in range(30):
        m = av.neighbor_mean(out, edges, n)
        out[band] = out[band] + 0.5 * (m[band] - out[band])
    return out


def pose_relaxed(rig, J, arm_deg):
    """힘 뺀 선 자세(좌우 대칭): 쇄골을 내리고, 팔을 몸통 쪽으로 내리고(정면에서 arm_deg),
    옆에서 봐도 위팔이 수직이 되게 뒤로 세우고, 아래팔은 앞으로 ELBOW 만큼만 굽힌다.
    MakeHuman 기본 자세는 팔이 앞으로 뻗어 있어(옆에서 손이 배 앞에 옴) 그대로 두면 어정쩡해 보인다."""
    from mathutils import Quaternion, Vector

    def rot(pb, turns):
        """turns: [(월드 축, 라디안)] 차례로 — 월드 회전을 지금 뼈 공간으로 바꿔 넣는다"""
        bpy.context.view_layer.update()
        qw = Quaternion()
        for ax, rad in turns:
            qw = Quaternion(Vector(ax), rad) @ qw
        m = (rig.matrix_world @ pb.matrix).to_3x3()
        axis, ang = qw.to_axis_angle()
        local = (m.inverted() @ axis).normalized()
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = Quaternion(local, ang)

    for pb in rig.pose.bones:          # 앞 모양의 자세를 지우고 시작
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = Quaternion()
    for s, sign in (('l', 1), ('r', -1)):
        d = J[f'elbow.{s}'] - J[f'shoulder.{s}']
        cur = math.degrees(math.atan2(abs(d[0]), -d[2]))          # 정면에서 본 팔 각도(수직 아래 기준)
        fwd = math.atan2(-d[1], math.hypot(d[0], d[2]))           # 옆에서 본 위팔이 앞으로 기운 각도
        v = J[f'hand.{s}'] - J[f'elbow.{s}']
        fwd2 = math.atan2(-v[1], math.hypot(v[0], v[2]))          # 아래팔이 앞으로 기운 각도
        rot(rig.pose.bones[f'shoulder.{s}'], [((0.0, 1.0, 0.0), math.radians(CLAVICLE) * sign)])
        rot(rig.pose.bones[f'upper_arm.{s}'], [((0.0, 1.0, 0.0), math.radians(cur - arm_deg - CLAVICLE) * sign),
                                              ((1.0, 0.0, 0.0), fwd)])
        rot(rig.pose.bones[f'forearm.{s}'], [((1.0, 0.0, 0.0), (fwd2 - fwd) - math.radians(ELBOW))])
        if s == 'l':
            log(f'팔 앞기울기 위팔 {math.degrees(fwd):.1f}° · 아래팔 {math.degrees(fwd2):.1f}°')
    bpy.context.view_layer.update()


def main():
    a = parse_args()
    S = SPEC[a.sex]
    male = a.sex == 'm'
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mh = MH(a.mh, a.sex)
    ex = S.get('extra', {})
    shapes = {'base': mh.shape(*S['base']), **{k: mh.shape(*S[k], ex.get(k, ())) for k in KEYS}}
    B = {k: fm.to_blender(V) for k, V in shapes.items()}
    B['fat_up'] = B['base'] + (B['fat_up'] - B['base']) * S['fat_gain']
    base_mh = shapes['base']

    body_f = [(f, t) for g, f, t in mh.faces if g == 'body']
    y = lambda name: mh.joint(base_mh, name)[1]
    waist_y = y('joint-spine-3') + (-0.35 if male else 0.05)
    thigh_y = (y('joint-l-upper-leg') + y('joint-l-knee')) / 2 + (0.05 if male else 0.25)
    sh_x = mh.joint(base_mh, 'joint-l-shoulder')[0]
    neck_y = y('joint-neck')

    holes = fm.head_holes([f for f, _ in body_f], base_mh, neck_y + 0.3)
    body_f = body_f + [(h, [-1] * len(h)) for h in holes]
    body, used_b = fm.build_mesh('body', B['base'], body_f, mh.VT)
    remap = {o: n for n, o in enumerate(used_b)}
    faces_local = [[remap[i] for i in f] for f, _ in body_f]
    E = fm.edges_from_faces(faces_local)
    z_neck = fm.to_blender(mh.joint(base_mh, 'joint-neck')[None])[0, 2] + 0.02
    z_top = B['base'][used_b, 2].max()
    head = {k: mannequin_head(P[used_b], E, z_neck, z_top) for k, P in B.items()}
    # 유두 자리 매끈하게(마네킹) — 유두 정점은 MakeHuman 'breast-point' 타깃이 가장 많이 미는 점(좌우 하나씩)
    tips = []
    k = 'targets/breast/breast-point-incr'
    idx, vec = mh.npz[f'{k}.index'], mh.npz[f'{k}.vector'].astype(np.float64)
    mag = np.linalg.norm(vec, axis=1)
    for sgn in (1, -1):
        side = np.array([i for i in range(len(idx)) if mh.V0[idx[i], 0] * sgn > 0 and int(idx[i]) in remap])
        if len(side):
            tips.append(remap[int(idx[side[np.argmax(mag[side])]])])
    log(f'유두 자리 {tips}')
    for k in head:
        head[k] = fm.smooth_spots(head[k], E, [head[k][i] for i in tips], 0.035)
    body.data.vertices.foreach_set('co', head['base'].astype(np.float32).ravel())
    fm.add_shape_keys(body, {k: head[k] for k in KEYS})

    zb = lambda yy: float(fm.to_blender(np.array([[0.0, yy, 0.0]]))[0, 2])
    xb = lambda xx: float(xx * SCALE)
    pieces = []
    sh = fm.cut_piece(body, '_shorts', [(zb(thigh_y), 'z'), (zb(waist_y), 'z')],
                      lambda c: zb(thigh_y) < c.z < zb(waist_y) and abs(c.x) < xb(sh_x * 1.35))
    fm.offset_piece(sh, 0.007 if male else 0.006)
    pieces.append(sh)
    if not male:
        bust_lo = y('joint-spine-1') - 0.95
        bust_hi = y('joint-spine-1') + 0.25
        br = fm.cut_piece(body, '_bra', [(zb(bust_lo), 'z'), (zb(bust_hi), 'z'), (zb(neck_y - 0.12), 'z'),
                                         (xb(sh_x * 0.36), 'x'), (-xb(sh_x * 0.36), 'x'), (xb(sh_x * 0.64), 'x'), (-xb(sh_x * 0.64), 'x'),
                                         (xb(sh_x * 0.9), 'x'), (-xb(sh_x * 0.9), 'x')],
                          lambda c: (zb(bust_lo) < c.z < zb(bust_hi) and abs(c.x) < xb(sh_x * 0.9))
                          or (zb(bust_hi) - 0.001 < c.z < zb(neck_y - 0.12) and xb(sh_x * 0.36) < abs(c.x) < xb(sh_x * 0.64)))
        fm.offset_piece(br, 0.005)
        pieces.append(br)

    # 리그 — 기본 몸 관절, 자동 가중치는 원래 MakeHuman 모양 복사본에서 받아 옮긴다
    J = {}
    jb = lambda n: fm.to_blender(mh.joint(base_mh, n)[None])[0]
    J['pelvis'], J['neck'], J['head2'] = jb('joint-pelvis'), jb('joint-neck'), jb('joint-head-2')
    for s in ('l', 'r'):
        for k, n in (('shoulder', 'shoulder'), ('elbow', 'elbow'), ('hand', 'hand'), ('leg', 'upper-leg'), ('knee', 'knee'), ('ankle', 'ankle')):
            J[f'{k}.{s}'] = jb(f'joint-{s}-{n}')
    rig = fm.make_rig(J)
    tmp, _ = fm.build_mesh('_bind', B['base'], body_f)
    fm.bind(tmp, rig)
    nv = len(tmp.data.vertices)
    W = {}
    for vg in tmp.vertex_groups:
        col = np.zeros(nv)
        for i in range(nv):
            try:
                col[i] = vg.weight(i)
            except RuntimeError:
                pass
        W[vg.name] = col
    # 자동 가중치(열 확산)가 좌우로 다르게 나와 한쪽 겨드랑이만 부풀었다 — 오른쪽(-x)을 거울로 왼쪽에 옮겨 대칭으로
    from mathutils.kdtree import KDTree
    P0 = B['base'][used_b]
    kd = KDTree(len(P0))
    for i, q in enumerate(P0):
        kd.insert(q.tolist(), i)
    kd.balance()
    mir = np.array([kd.find((-q[0], q[1], q[2]))[1] for q in P0])
    swap = lambda n: n[:-2] + ('.r' if n.endswith('.l') else '.l') if n[-2:] in ('.l', '.r') else n
    left = P0[:, 0] > 0
    W2 = {n: c.copy() for n, c in W.items()}
    for n in W:
        src = W.get(swap(n), np.zeros(nv))
        W2[n][left] = src[mir[left]]
    for n, col in W2.items():
        g = body.vertex_groups.new(name=n)
        for i in np.nonzero(col > 0)[0]:
            g.add([int(i)], float(col[i]), 'REPLACE')
    bpy.data.objects.remove(tmp)
    mod = body.modifiers.new('rig', 'ARMATURE')
    mod.object = rig
    rig.data.pose_position = 'POSE'

    # 모양마다 그 모양의 팔 각도로 굳힌다 (옷은 리그에 붙이지 않는다 — 팔이 닿지 않는다)
    objs = [body] + pieces
    final = {o.name: {} for o in objs}
    for k in ['base'] + list(KEYS):
        with bpy.context.temp_override(active_object=rig, object=rig):
            bpy.ops.object.mode_set(mode='POSE')
            pose_relaxed(rig, J, ARM[k] + S.get('arm_add', 0.0))
            bpy.ops.object.mode_set(mode='OBJECT')
        for o in objs:
            for kb in o.data.shape_keys.key_blocks[1:]:
                kb.value = 1.0 if kb.name == k else 0.0
        bpy.context.view_layer.update()
        for o in objs:
            final[o.name][k] = fm.evaluated_positions(o)
        log(f'{k}: 팔 {ARM[k] + S.get("arm_add", 0.0)}°')
    polys = {o.name: [list(p.vertices) for p in o.data.polygons] for o in objs}
    uvl = body.data.uv_layers.get('UVMap')
    uvs = [tuple(uvl.data[i].uv) for i in range(len(uvl.data))] if uvl else []
    piece_names = [p.name for p in pieces]
    for o in objs + [rig]:
        bpy.data.objects.remove(o)

    def rebuild(name, res, faces, uv=None):
        me = bpy.data.meshes.new(name)
        me.from_pydata(res['base'].tolist(), [], faces)
        me.update()
        if uv:
            layer = me.uv_layers.new(name='UVMap')
            layer.data.foreach_set('uv', np.array(uv, np.float32).ravel())
        for p in me.polygons:
            p.use_smooth = True
        o = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(o)
        fm.add_shape_keys(o, {k: res[k] for k in KEYS})
        return o

    body = rebuild('body', final['body'], polys['body'], uvs)
    cres, cfaces, off = None, [], 0
    for pn in piece_names:
        r = final[pn]
        cres = r if cres is None else {k: np.concatenate([cres[k], r[k]]) for k in r}
        cfaces += [[i + off for i in f] for f in polys[pn]]
        off += len(r['base'])
    clothes = rebuild('clothes', cres, cfaces)
    outs = [body, clothes]

    allP = np.concatenate([final['body']['base'], cres['base']])
    shift = np.array([-(allP[:, 0].min() + allP[:, 0].max()) / 2, -(allP[:, 1].min() + allP[:, 1].max()) / 2, -allP[:, 2].min()])
    for o in outs:
        for kb in o.data.shape_keys.key_blocks:
            co = np.empty(len(kb.data) * 3)
            kb.data.foreach_get('co', co)
            kb.data.foreach_set('co', (co.reshape(-1, 3) + shift).astype(np.float32).ravel())
        co = np.empty(len(o.data.vertices) * 3)
        o.data.shape_keys.key_blocks[0].data.foreach_get('co', co)
        o.data.vertices.foreach_set('co', co)
        o.data.update()
    H = float(allP[:, 2].max() - allP[:, 2].min())
    log(f'키 {H:.3f} m · 몸 삼각형 {sum(len(p.vertices) - 2 for p in body.data.polygons)}')

    if a.tex:
        os.makedirs(a.tex, exist_ok=True)
        fm.bake_camo(clothes, a.tex, 1024)
        av._cycles(64)
        ao = av._bake_target(body, 'body_ao', 1024, True)
        for o in bpy.context.scene.objects:
            o.hide_render = o not in outs
        av._select(body, [])
        if not bpy.context.scene.world:
            bpy.context.scene.world = bpy.data.worlds.new('w')
        bpy.ops.object.bake(type='AO')
        ao.filepath_raw = os.path.join(a.tex, 'body_ao.png')
        ao.file_format = 'PNG'
        ao.save()
        log('AO', ao.filepath_raw)

    for o in outs:
        o.data.materials.clear()
    if a.preview:
        av.preview(outs, a.preview)
    for o in bpy.context.scene.objects:
        o.select_set(o in outs)
    bpy.context.view_layer.objects.active = body
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(a.out), export_format='GLB', use_selection=True,
        export_apply=False, export_skins=False, export_animations=False,
        export_morph=True, export_morph_normal=True, export_materials='NONE',
        export_texcoords=bool(a.tex), export_vertex_color='NONE', export_yup=True, export_cameras=False, export_lights=False,
    )
    log('완료', a.out)


if __name__ == '__main__':
    main()
