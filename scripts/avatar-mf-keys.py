"""밀프 원본 셰이프 키 보강 — mus_down 이 근육 부피를 줄이고, 근육 결을 지우는 'soft' 키를 더한다.
usage: cd /tmp && ~/.venv-bpy/bin/python <저장소>/scripts/avatar-mf-keys.py IN.blend OUT.blend [mus_k detail_m deflate fat_detail iters]
2026-11-10 앱에 넣은 값: 1.25 0 0.3 0 160 (원본 키는 건드리지 않고 mus_down 만 세게 + soft 키 추가).
soft = 몸통 · 팔 · 다리 근육 결을 Taubin 으로 편 차이(머리 제외, 목 0.15). 세기는 morph.ts softFor() 가 정한다(체지방↑ · 근육↓ 에서 1)."""
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
def put(name, delta):
    v = (basis + delta).astype(np.float32).ravel(); kb[name].data.foreach_set('co', v)
put('mus_down', new_md); put('fat_up', new_fu)
# soft — 근육 결 · 복근 칸을 지운 몸(체지방이 오르거나 근육이 줄 때 앱이 좌표로 세기를 정한다)
if 'soft' not in kb:
    ob.shape_key_add(name='soft', from_mix=False)
put('soft', detail)
kb['soft'].value = 0.0
me.update()
bpy.ops.wm.save_as_mainfile(filepath=out)
print('saved', out, MUS_K, DET_M, DEFL, DET_F, ITERS)
