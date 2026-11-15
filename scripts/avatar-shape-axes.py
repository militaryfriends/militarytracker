"""남성 아바타 체형 축 추가 — 체지방 · 근육 2축으로 못 그리는 몸(뱃살형 · 하체형 · 어깨 넓은 몸 · 고도 비만)을 위한 셰이프 키.
usage: cd /tmp && ~/.venv-bpy/bin/python <저장소>/scripts/avatar-shape-axes.py IN.blend OUT.blend
IN = avatar-mf-keys.py 를 거친 .blend(v20 — fat_up · fat_down · mus_up · mus_down · soft). 기존 키는 건드리지 않고 아래 키를 더한다.
build-avatar-3d.py 는 이 키들이 몸에 있으면 같이 내보낸다. 앱에서의 쓰임은 src/components/body/avatar3d/morph.ts 의 Shape.

  belly     배 집중 — 팔다리는 그대로 두고 배 · 옆구리만 나온다. 1.0 = 허리 +12cm(키 176 환산)
  lower     하체 집중 — 엉덩이 · 허벅지에만 살. 1.0 = 엉덩이 +8cm
  mus_bias  근육 분포 — +1 상체형(상체 근육 ↑ 하체 ↓), -1 하체형. mus_up 을 위아래로 나눈 차이
  shoulder  어깨 너비 — 1.0 = 좌우 +2cm 씩(팔은 통째로 따라간다). 음수면 좁게
  pelvis    골반 너비 — 1.0 = 좌우 +1.5cm 씩(다리는 통째로 따라간다)
  fat_xl    고도 체지방 — fat_up 1.0(체지방 28%) 너머. fat_up 1 + fat_xl 1 = 체지방 약 37%(허리 약 131cm), 팔이 몸통에서 벌어진다

값은 전부 줄자(볼록 껍질 둘레)로 재서 맞춘다 — 마지막에 표로 찍는다. 축을 고치면 scripts/avatar-measure.py 로 다시 잰다.
"""
import bpy, sys, numpy as np
a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
src, out = a[0], a[1]
BELLY_CM, HIP_CM, XL_WAIST_CM, SH_CM, PV_CM, XL_ARM_DEG = 12.0, 8.0, 32.0, 2.0, 1.5, 9.0
bpy.ops.wm.open_mainfile(filepath=src)
ob = bpy.data.objects['Text.009']; me = ob.data; kb = me.shape_keys.key_blocks
rig = next(m.object for m in ob.modifiers if m.type == 'ARMATURE')
n = len(me.vertices)
def co(k):
    x = np.empty(n * 3, np.float32); k.data.foreach_get('co', x); return x.reshape(n, 3).astype(np.float64)
basis = co(kb['Basis']); rest = co(kb['Key 1'])     # Key 1 = 1.0 이 쉬는 몸
d = {k: co(kb[k]) - basis for k in ('fat_up', 'fat_down', 'mus_up', 'mus_down')}
R = np.array(ob.matrix_world)[:3, :3]; T0 = np.array(ob.matrix_world)[:3, 3]
world = lambda P: P @ R.T + T0                        # 위 = +Z, 앞 = -Y, 레스트 = T 포즈(팔이 ±X 로 뻗음)
to_local = lambda D: D @ R                            # 월드 변위 → 키(로컬) 변위 (R 은 회전만)
W = world(rest); zlo = W[:, 2].min(); H = W[:, 2].max() - zlo; zr = (W[:, 2] - zlo) / H
CM = H / 176.0                                         # 키 176cm 환산 1cm
E = np.empty(len(me.edges) * 2, np.int32); me.edges.foreach_get('vertices', E); E = E.reshape(-1, 2)
deg = np.zeros(n); np.add.at(deg, E[:, 0], 1); np.add.at(deg, E[:, 1], 1); deg = np.maximum(deg, 1)
def avg(x, it=1):
    for _ in range(int(it)):
        s = np.zeros_like(x); np.add.at(s, E[:, 0], x[E[:, 1]]); np.add.at(s, E[:, 1], x[E[:, 0]])
        x = s / (deg[:, None] if x.ndim == 2 else deg)
    return x
def wpre(prefixes, skip=()):
    w = np.zeros(n); ids = {g.index for g in ob.vertex_groups if any(g.name.startswith(p) for p in prefixes) and g.name not in skip}
    for v in me.vertices:
        for g in v.groups:
            if g.group in ids: w[v.index] += g.weight
    return np.minimum(w, 1)
w_arm = wpre(('DEF-upper_arm', 'DEF-forearm', 'DEF-hand', 'DEF-f_', 'DEF-thumb', 'DEF-palm'))
w_leg = wpre(('DEF-thigh', 'DEF-shin', 'DEF-foot', 'DEF-toe'))
w_head = wpre(('DEF-spine.004', 'DEF-spine.005', 'DEF-spine.006'))
w_face = 1 - np.minimum(1, wpre(('DEF-spine', 'DEF-pelvis', 'DEF-breast', 'DEF-shoulder', 'DEF-upper_arm', 'DEF-forearm', 'DEF-hand', 'DEF-f_', 'DEF-thumb', 'DEF-palm', 'DEF-thigh', 'DEF-shin', 'DEF-foot', 'DEF-toe')))
w_head = np.minimum(1, w_head + w_face)                # 목 · 머리 · 얼굴
torso = np.clip(1 - w_arm - w_head, 0, 1)                  # 몸통 + 다리(높이 마스크와 같이 쓴다)
clip = np.clip
gauss = lambda z, c, s: np.exp(-0.5 * ((z - c) / s) ** 2)

# ── 줄자: 높이 zr0 띠의 몸통 정점 볼록 껍질 둘레 (T 포즈라 팔은 |x| 로 걸러진다)
def hull(P2):
    p = sorted(set(map(tuple, np.round(P2, 5))))
    if len(p) < 3: return 0.0
    cr = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo = []
    for q in p:
        while len(lo) >= 2 and cr(lo[-2], lo[-1], q) <= 0: lo.pop()
        lo.append(q)
    up = []
    for q in reversed(p):
        while len(up) >= 2 and cr(up[-2], up[-1], q) <= 0: up.pop()
        up.append(q)
    h = np.array(lo[:-1] + up[:-1]); return float(np.linalg.norm(h - np.roll(h, -1, 0), axis=1).sum())
def girth(delta_local, z0, half=0.004, leg=False):
    P = world(rest + delta_local); band = np.abs(zr - z0) < half
    sel = band & ((W[:, 0] > 0.005) if leg else (np.abs(W[:, 0]) < 0.3 * H * 0.5)) & (w_arm < 0.3)
    return hull(P[sel][:, :2]) / CM
ZW, ZH, ZT = 0.59, 0.50, 0.42
zero = np.zeros((n, 3))
def scale_to(delta, measure, target_cm):
    """delta 의 세기를 measure 가 target_cm 만큼 늘도록 맞춘다(둘레는 거의 선형이라 두 번이면 충분)"""
    k = 1.0
    for _ in range(4):
        got = measure(delta * k) - measure(zero)
        k *= target_cm / max(got, 1e-6)
    return delta * k

# ── belly: fat_up 의 배 부분 + 앞으로 내미는 힘. 허리 띠를 넓게(갈비 아래 ~ 골반 위), 앞 · 옆 위주
front = clip((0.02 - W[:, 1]) / 0.10, 0, 1)            # 앞(−Y)일수록 1
mb = gauss(zr, 0.585, 0.06) * torso * (0.35 + 0.65 * front)
mb = avg(mb, 8)
push = np.zeros((n, 3)); push[:, 1] = -1.0             # 월드 −Y = 앞
belly = d['fat_up'] * mb[:, None] + to_local(push * (mb * front)[:, None] * 0.02 * H)
belly = scale_to(avg(belly, 6), lambda dl: girth(dl, ZW), BELLY_CM)

# ── lower: fat_up 의 엉덩이 · 허벅지 부분
ml = clip((0.60 - zr) / 0.05, 0, 1) * clip((zr - 0.27) / 0.06, 0, 1) * (1 - w_arm)
ml = avg(ml, 8)
lower = scale_to(avg(d['fat_up'] * ml[:, None], 4), lambda dl: girth(dl, ZH), HIP_CM)

# ── mus_bias: mus_up 을 상체(+) · 하체(−)로
mu = np.maximum(clip((zr - 0.56) / 0.06, 0, 1), w_arm)
mu = avg(mu, 8)
mus_bias = d['mus_up'] * (2 * mu - 1)[:, None] * 0.6

# ── shoulder: 어깨 관절까지는 가슴이 비례해서 늘고, 팔은 통째로 밖으로
sx = abs(float((rig.matrix_world @ rig.data.bones['DEF-upper_arm.L'].head_local).x))
ramp = clip(np.abs(W[:, 0]) / sx, 0, 1) ** 1.5 * clip((zr - 0.70) / 0.07, 0, 1) * (1 - w_head)
wsh = avg(np.maximum(w_arm, ramp), 10)
shoulder = np.zeros((n, 3)); shoulder[:, 0] = np.sign(W[:, 0]) * wsh * SH_CM * CM
shoulder = to_local(shoulder)

# ── pelvis: 골반 폭, 다리는 통째로 밖으로
hx = abs(float((rig.matrix_world @ rig.data.bones['DEF-thigh.L'].head_local).x))
rp = clip(np.abs(W[:, 0]) / hx, 0, 1) * gauss(zr, 0.50, 0.05) * (1 - w_arm)
wpv = avg(np.maximum(w_leg * clip((0.56 - zr) / 0.05, 0, 1), rp), 10)
pelvis = np.zeros((n, 3)); pelvis[:, 0] = np.sign(W[:, 0]) * wpv * PV_CM * CM
pelvis = to_local(pelvis)

# ── fat_xl: fat_up 을 더 밀되(결은 펴서) 배를 더 내밀고, 팔을 몸통에서 벌린다(T 포즈에서 팔을 살짝 드는 회전 = 내린 자세에서 벌어짐)
wide = avg(gauss(zr, 0.575, 0.11) * torso, 8)
xl = avg(d['fat_up'], 10) * (1.0 + 0.9 * wide)[:, None] + belly * 0.5
xl = scale_to(avg(xl, 4), lambda dl: girth(dl, ZW), XL_WAIST_CM)
th = np.radians(XL_ARM_DEG); arm = np.zeros((n, 3))
for side in (1, -1):
    c = np.array(rig.matrix_world @ rig.data.bones['DEF-upper_arm.L' if side > 0 else 'DEF-upper_arm.R'].head_local)
    v = W - c; s = np.sin(th) * side
    rot = np.stack([v[:, 0] * np.cos(th) - v[:, 2] * s, v[:, 1], v[:, 0] * s + v[:, 2] * np.cos(th)], 1)   # Y 축 회전: 팔 끝이 위로
    sel = (W[:, 0] * side > 0)
    arm[sel] = ((rot - v) * w_arm[:, None])[sel]
xl = xl + to_local(avg(arm, 3))

NEW = {'belly': belly, 'lower': lower, 'mus_bias': mus_bias, 'shoulder': shoulder, 'pelvis': pelvis, 'fat_xl': xl}
for name, delta in NEW.items():
    if name not in kb: ob.shape_key_add(name=name, from_mix=False)
    kb[name].data.foreach_set('co', (basis + delta).astype(np.float32).ravel()); kb[name].value = 0.0
    kb[name].slider_min = -1.0
me.update()
print('\n체형 축 (키 176cm 환산, 레스트 T 포즈에서 잰 값 — 근사)')
print(f'  기본 몸        허리 {girth(zero, ZW):6.1f}  엉덩이 {girth(zero, ZH):6.1f}  허벅지 {girth(zero, ZT, leg=True):5.1f}')
for name, delta in list(NEW.items()) + [('fat_up', d['fat_up']), ('fat_up+fat_xl', d['fat_up'] + xl), ('fat_up+belly', d['fat_up'] + belly)]:
    print(f'  {name:14s} 허리 {girth(delta, ZW):6.1f}  엉덩이 {girth(delta, ZH):6.1f}  허벅지 {girth(delta, ZT, leg=True):5.1f}  최대 변위 {np.abs(delta).max() / CM:5.1f}cm')
bpy.ops.wm.save_as_mainfile(filepath=out)
print('saved', out)
