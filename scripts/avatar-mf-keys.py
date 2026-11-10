"""밀프 원본 셰이프 키 보강 — mus_down 이 근육 부피를 줄이고, 근육 결을 지우는 'soft' 키를 더한다.
usage: cd /tmp && ~/.venv-bpy/bin/python <저장소>/scripts/avatar-mf-keys.py IN.blend OUT.blend [mus_k detail_m deflate fat_detail iters neck_keep armpit_it chin_it waist_cut leg_mus arm_mus]
앱에 넣은 값(2026-11-11 v20): 1.25 0 0.3 0 160 0.6 25 200 0.47 0.47 0.7
  · mus_down 1.25배 + 근육 부피 축소, soft = 근육 결을 Taubin 으로 편 차이(세기는 morph.ts softFor())
  · 목: 마른 몸에서 목이 가늘고 길어 보이지 않게 목 부위 fat_down · mus_down 을 60% 덜
  · 겨드랑이: 팔 · 몸통 경계에서 줄어드는 양을 넓게 펴고 덜 줄여 M1 의 주름 · 깨진 면을 없앰
  · 실측 보정: 허리 띠의 fat_up 47% 덜(배만 커지던 것), 하체 mus_down 47% · 팔 70% 만(M1 허벅지 · 엉덩이가 너무 가늘던 것)
  · 턱 밑: 머리 아랫면과 목이 꺾이는 곳을 목 쪽에서 둥글게 메워 검은 띠를 얇게(얼굴은 그대로, 모든 키에 같이 옮김)"""
import bpy, sys, numpy as np
a = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else sys.argv[1:]
src, out = a[0], a[1]
MUS_K, DET_M, DEFL, DET_F, ITERS = (float(x) for x in (a[2:7] if len(a) >= 7 else (1.3, 0.7, 0.45, 0.6, 30)))
bpy.ops.wm.open_mainfile(filepath=src)
ob = bpy.data.objects['Text.009']; me = ob.data; kb = me.shape_keys.key_blocks
n = len(me.vertices)
def co(k):
    x = np.empty(n*3, np.float32); k.data.foreach_get('co', x); return x.reshape(n, 3)
basis = co(kb['Basis']); k1 = co(kb['Key 1'])
rest = k1.copy()  # Key 1 = 1.0 이 쉬는 몸 (Basis + Key1)
d = {k: co(kb[k]) - basis for k in ('fat_up', 'fat_down', 'mus_up', 'mus_down')}

# 부위 마스크 (몸통 · 팔 1.0, 다리 0.7, 목 0.5, 머리 · 손 · 발 0)
W = {}
def gw(prefixes, f):
    idx = {g.index: f for g in ob.vertex_groups if any(g.name.startswith(p) for p in prefixes)}
    return idx
groups = {}
groups.update(gw(['DEF-thigh', 'DEF-shin'], 0.7))
groups.update(gw(['DEF-spine', 'DEF-pelvis', 'DEF-breast', 'DEF-shoulder', 'DEF-upper_arm', 'DEF-forearm'], 1.0))
head = {g.index for g in ob.vertex_groups if g.name in ('DEF-spine.006',)}
neck = {g.index for g in ob.vertex_groups if g.name in ('DEF-spine.004', 'DEF-spine.005')}
mask = np.zeros(n, np.float32)
for v in me.vertices:
    s = 0.0
    for g in v.groups:
        if g.group in head: continue
        f = 0.15 if g.group in neck else groups.get(g.group, 0.0)
        s += g.weight * f
    mask[v.index] = min(1.0, s)
# 손 · 발 · 얼굴 경계 부드럽게
E = np.empty(len(me.edges)*2, np.int32); me.edges.foreach_get('vertices', E); E = E.reshape(-1, 2)
deg = np.zeros(n); np.add.at(deg, E[:, 0], 1); np.add.at(deg, E[:, 1], 1); deg = np.maximum(deg, 1)
def avg(x):
    s = np.zeros_like(x); np.add.at(s, E[:, 0], x[E[:, 1]]); np.add.at(s, E[:, 1], x[E[:, 0]])
    return s / deg[:, None] if x.ndim == 2 else s / deg
for _ in range(4): mask = avg(mask)
# Taubin 스무딩(부피 유지) — 근육 결 · 복근 칸을 지운 몸
x = rest.copy()
for _ in range(int(ITERS)):
    x = x + 0.5 * (avg(x) - x)
    x = x - 0.53 * (avg(x) - x)
detail = (x - rest) * mask[:, None]
print('detail max', float(np.abs(detail).max()), 'mask mean', float(mask.mean()))
defl = -d['mus_up'] * DEFL * mask[:, None]
for _ in range(12): defl = avg(defl)          # 겨드랑이 · 팔 옆 주름이 생기지 않게 부피 감소를 부드럽게
md = d['mus_down'] * MUS_K
for _ in range(3): md = avg(md)
new_md = md + defl + detail * DET_M  # DET_M=0 이면 결 지우기는 soft 키가 맡는다
new_fu = d['fat_up'] + detail * DET_F
# ── 남은 흠 고치기 ──
def wsum(names):
    w = np.zeros(n, np.float32); ids = {g.index for g in ob.vertex_groups if g.name in names}
    for v in me.vertices:
        for g in v.groups:
            if g.group in ids: w[v.index] += g.weight
    return np.minimum(w, 1)
def wpre(prefixes):
    w = np.zeros(n, np.float32); ids = {g.index for g in ob.vertex_groups if any(g.name.startswith(p) for p in prefixes)}
    for v in me.vertices:
        for g in v.groups:
            if g.group in ids: w[v.index] += g.weight
    return np.minimum(w, 1)
NECK_KEEP, ARMPIT_IT, CHIN_IT = (float(x) for x in (a[7:10] if len(a) >= 10 else (0.5, 25, 40)))
# ① 마른 몸에서 목이 가늘고 길어 보이지 않게 — 목 부위는 줄어드는 양을 덜
Mw = np.array(ob.matrix_world); Wp = rest @ Mw[:3, :3].T + Mw[:3, 3]   # 위 = +Z, 앞 = -Y (키 2.0)
wn = np.clip(1 - np.abs(Wp[:, 2] - 1.93) / 0.11, 0, 1) * np.clip((0.13 - np.abs(Wp[:, 0])) / 0.04, 0, 1)
for _ in range(6): wn = avg(wn)
keepn = (1 - NECK_KEEP * np.clip(wn * 1.3, 0, 1))[:, None]
fd = d['fat_down'] * keepn
new_md = new_md * keepn
# ② 겨드랑이 — 팔과 몸통이 만나는 곳에서 줄어드는 양을 넓게 펴서 주름이 안 접히게
wa = wpre(('DEF-upper_arm',)); wt = wpre(('DEF-spine', 'DEF-breast', 'DEF-shoulder'))
ap = np.minimum(wa, wt) * 2
for _ in range(8): ap = avg(ap)
ap = np.clip(ap * 2.5, 0, 1)[:, None]
def localsmooth(delta, it):
    x = delta.copy()
    for _ in range(int(it)): x = avg(x)
    return delta * (1 - ap) + x * ap
fd = localsmooth(fd, ARMPIT_IT); new_md = localsmooth(new_md, ARMPIT_IT)
d_soft = localsmooth(detail, ARMPIT_IT) * (1 - ap)
new_md = new_md * (1 - 0.5 * ap)
fd = fd * (1 - 0.3 * ap)
# ③ 턱 밑 — 머리 아랫면이 목 위로 튀어나와 생기는 그늘: 머리 · 목 경계를 둥글게 이어 모든 키에 같이 옮긴다
# 월드 좌표(물체가 X 로 121° 돌아 있다): 위 = +Z(키 2.0, 턱 밑 z≈2.0), 앞 = -Y. 턱 아랫면 · 목 앞 · 옆 고리를 고른다
Mw = np.array(ob.matrix_world); Wp = rest @ Mw[:3, :3].T + Mw[:3, 3]
ZJ = 2.0
band = (np.clip((ZJ + 0.012 - Wp[:, 2]) / 0.012, 0, 1) * np.clip(1 - (ZJ - Wp[:, 2]) / 0.06, 0, 1)   # 얼굴은 두고 목 윗부분만
        * np.clip((0.07 - Wp[:, 1]) / 0.08, 0, 1)
        * np.clip((0.17 - np.abs(Wp[:, 0])) / 0.05, 0, 1))
for _ in range(4): band = avg(band)
x = rest.copy()
for _ in range(int(CHIN_IT)):
    x = x + 0.5 * (avg(x) - x) * band[:, None]
chin = (x - rest)
print('chin max', float(np.abs(chin).max()), 'band n', int((band > 0.1).sum()), 'armpit n', int((ap[:, 0] > 0.1).sum()))
if CHIN_IT > 0:
    for k in kb:
        c = co(k) + chin; k.data.foreach_set('co', c.astype(np.float32).ravel())
    basis = basis + chin
put_fd = fd
# ── 실측 보정 (2026-11-11) — 25칸을 둘레로 재서 실제 체형 범위에 맞춘다(scripts/avatar-measure.py)
#  ① fat_up 이 배(허리 띠)에만 너무 몰려 F3~F5 허리가 실제보다 9~17cm 큼 → 허리 띠의 fat_up 을 줄인다
#  ② mus_down 이 엉덩이 · 허벅지를 너무 줄여 M1 이 허리=엉덩이, 허벅지 35cm(키 176 기준) → 하체는 덜, 팔은 조금 덜
WAIST_CUT, LEG_MUS, ARM_MUS = (float(x) for x in (a[10:13] if len(a) >= 13 else (0.0, 1.0, 1.0)))
Wr = rest @ Mw[:3, :3].T + Mw[:3, 3]
zlo, zhi = Wr[:, 2].min(), Wr[:, 2].max(); Hh = zhi - zlo; zr = (Wr[:, 2] - zlo) / Hh
torso_x = np.clip((0.3 * Hh - np.abs(Wr[:, 0])) / (0.05 * Hh), 0, 1)
waist_m = np.exp(-0.5 * ((zr - 0.6) / 0.045) ** 2) * torso_x
for _ in range(6): waist_m = avg(waist_m)
new_fu = new_fu * (1 - WAIST_CUT * waist_m)[:, None]
leg_m = np.clip((0.57 - zr) / 0.05, 0, 1)
arm_m = np.clip(wpre(('DEF-upper_arm', 'DEF-forearm', 'DEF-hand')) * 1.5, 0, 1)
for _ in range(6): leg_m = avg(leg_m); arm_m = avg(arm_m)
mscale = 1 - (1 - LEG_MUS) * leg_m - (1 - ARM_MUS) * arm_m * (1 - leg_m)
new_md = new_md * mscale[:, None]
print('calib', WAIST_CUT, LEG_MUS, ARM_MUS)
def put(name, delta):
    v = (basis + delta).astype(np.float32).ravel(); kb[name].data.foreach_set('co', v)
put('mus_down', new_md); put('fat_up', new_fu); put('fat_down', put_fd)
# soft — 근육 결 · 복근 칸을 지운 몸(체지방이 오르거나 근육이 줄 때 앱이 좌표로 세기를 정한다)
if 'soft' not in kb:
    ob.shape_key_add(name='soft', from_mix=False)
put('soft', d_soft)
kb['soft'].value = 0.0
me.update()
bpy.ops.wm.save_as_mainfile(filepath=out)
print('saved', out, MUS_K, DET_M, DEFL, DET_F, ITERS)
