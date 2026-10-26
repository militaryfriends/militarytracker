"""
여성 3D 아바타(.glb) — MakeHuman(CC0) 기본 메시 + 매크로 타깃으로 만든다(손으로 조각한 .blend 가 없어서).

    # 재료 (한 번): MakeHuman 1.3 휠의 targets.npz + 기본 메시 base.obj — 둘 다 CC0
    pip download makehuman==1.3.2 --no-deps -d ~/mh && (cd ~/mh && unzip -o -q makehuman-*.whl 'makehuman/data/targets.npz')
    curl -o ~/mh/base.obj https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/3dobjs/base.obj
    PY=~/.venv-bpy/bin/python
    $PY scripts/build-avatar-female.py -- --mh ~/mh --out /tmp/avatar_f.raw.glb --tex /tmp/avatar_f_tex --preview /tmp/avatar_f_prev

남성 모델과 같은 약속:
  · 메시 이름 body · clothes, 모프 4개 fat_up · fat_down · mus_up · mus_down (morph.ts BASE female = f 2.0 · m 3.0)
  · A-포즈(팔과 몸통 --arm-angle 도), 얼굴 없는 마네킹 머리(얼굴 · 귀를 매끈하게), 정면 -Y, 발바닥 z = 0
  · 옷 = 스포츠 브라 + 반바지(위장무늬). 모프마다 MakeHuman 이 옷 자리(helper-tights)도 같이 움직여 옷이 몸을 따라간다.
모프는 진짜 체형 타깃이다(체중 · 근육 매크로) — 남성처럼 부풀린 임시 모프가 아니다.
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
_spec = importlib.util.spec_from_file_location('avatar3d', os.path.join(HERE, 'build-avatar-3d.py'))
av = importlib.util.module_from_spec(_spec)
sys.argv_saved = sys.argv
_spec.loader.exec_module(av)

KEYS = av.KEYS
# (근육, 체중) — MakeHuman 매크로 값 0~1, 0.5 = 평균
BASE_MW = (0.55, 0.38)
TARGETS = {
    'fat_up': (0.55, 1.0),     # F5 — 체지방 많음
    'fat_down': (0.55, 0.05),  # F1 — 아주 마름
    'mus_up': (1.0, 0.38),     # M5
    'mus_down': (0.0, 0.38),   # M1
}
FAT_UP_GAIN = 1.35
SCALE = 0.1  # MakeHuman 단위(데시미터) → m


def log(*a):
    print('[avatar-f]', *a, flush=True)


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--mh', required=True, help='base.obj 와 makehuman/data/targets.npz 가 있는 폴더')
    p.add_argument('--out', required=True)
    p.add_argument('--tex', default='', help='텍스처(body_ao.png · cloth_c.png)를 구울 폴더')
    p.add_argument('--preview', default='')
    p.add_argument('--arm-angle', type=float, default=17.0)
    return p.parse_args(argv)


# ── MakeHuman ────────────────────────────────────────────────────────────

class MH:
    def __init__(self, folder):
        self.npz = np.load(os.path.join(folder, 'makehuman', 'data', 'targets.npz'))
        V, VT, faces = [], [], []
        g = None
        for line in open(os.path.join(folder, 'base.obj')):
            if line.startswith('v '):
                V.append([float(x) for x in line.split()[1:4]])
            elif line.startswith('vt '):
                VT.append([float(x) for x in line.split()[1:3]])
            elif line.startswith('g '):
                g = line.split()[1]
            elif line.startswith('f '):
                idx = [p.split('/') for p in line.split()[1:]]
                faces.append((g, [int(a[0]) - 1 for a in idx], [int(a[1]) - 1 if len(a) > 1 and a[1] else -1 for a in idx]))
        self.V0, self.VT, self.faces = np.array(V), np.array(VT), faces

    def _add(self, V, name, w):
        k = f'targets/{name}'
        if not w or f'{k}.index' not in self.npz:
            return
        V[self.npz[f'{k}.index']] += w * self.npz[f'{k}.vector'].astype(np.float64) * 1e-3

    @staticmethod
    def _tri(x):
        if x < 0.5:
            return {'min': (0.5 - x) * 2, 'average': 1 - (0.5 - x) * 2, 'max': 0.0}
        return {'min': 0.0, 'average': 1 - (x - 0.5) * 2, 'max': (x - 0.5) * 2}

    def shape(self, muscle, weight):
        V = self.V0.copy()
        for mk, mv in self._tri(muscle).items():
            for wk, wv in self._tri(weight).items():
                f = mv * wv
                self._add(V, f'macrodetails/universal-female-young-{mk}muscle-{wk}weight', f)
                self._add(V, f'macrodetails/proportions/female-young-{mk}muscle-{wk}weight-idealproportions', f * 0.5)
        for race in ('african', 'asian', 'caucasian'):
            self._add(V, f'macrodetails/{race}-female-young', 1 / 3)
        return V

    def group(self, name):
        return sorted({i for g, f, _ in self.faces if g == name for i in f})

    def joint(self, V, name):
        return V[self.group(name)].mean(0)


def to_blender(V):
    """MakeHuman Y-up · 정면 +Z → Blender Z-up · 정면 -Y, m 단위"""
    return np.stack([V[:, 0], -V[:, 2], V[:, 1]], 1) * SCALE


# ── 메시 ─────────────────────────────────────────────────────────────────

def build_mesh(name, P, faces, uv_src=None):
    """faces: [(원본 정점 인덱스 목록, uv 인덱스 목록)] — 쓰인 정점만 새로 번호를 매긴다"""
    used = sorted({i for f, _ in faces for i in f})
    remap = {o: n for n, o in enumerate(used)}
    me = bpy.data.meshes.new(name)
    me.from_pydata(P[used].tolist(), [], [[remap[i] for i in f] for f, _ in faces])
    me.update()
    if uv_src is not None:
        uv = me.uv_layers.new(name='UVMap')
        for poly, (_, t) in zip(me.polygons, faces):
            for li, ti in zip(poly.loop_indices, t):
                uv.data[li].uv = uv_src[ti] if ti >= 0 else (0.0, 0.0)
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o, used


def add_shape_keys(obj, shapes):
    """shapes: {이름: (n,3) 절대 위치} — Basis 는 지금 메시"""
    obj.shape_key_add(name='Basis', from_mix=False)
    for k, P in shapes.items():
        kb = obj.shape_key_add(name=k, from_mix=False)
        kb.data.foreach_set('co', P.astype(np.float32).ravel())
        kb.value = 0.0


def edges_from_faces(faces_local):
    e = set()
    for f in faces_local:
        for a, b in zip(f, f[1:] + f[:1]):
            e.add((min(a, b), max(a, b)))
    return np.array(sorted(e))


def head_holes(faces, P, y_neck):
    """머리의 열린 구멍(눈 · 입) 둘레 — 마네킹 머리를 만들기 전에 면으로 막는다. faces: 원본 인덱스, P: MakeHuman 좌표"""
    from collections import Counter, defaultdict
    cnt = Counter()
    for f in faces:
        for x, y in zip(f, f[1:] + f[:1]):
            cnt[(min(x, y), max(x, y))] += 1
    adj = defaultdict(list)
    for (x, y), c in cnt.items():
        if c == 1:
            adj[x].append(y)
            adj[y].append(x)
    seen, loops = set(), []
    for start in adj:
        if start in seen:
            continue
        loop, prev, cur = [start], None, start
        seen.add(start)
        while True:
            nxt = [v for v in adj[cur] if v != prev and (v not in seen or (v == start and len(loop) > 2))]
            if not nxt or nxt[0] == start:
                break
            prev, cur = cur, nxt[0]
            loop.append(cur)
            seen.add(cur)
        if len(loop) >= 3 and P[loop, 1].mean() > y_neck:
            loops.append(loop)
    return loops


def mannequin_head(P, edges, z_neck, z_top):
    """얼굴 · 귀 · 코를 지운 달걀형 마네킹 머리(아래가 좁은 달걀 = 턱). 머리 정점을 달걀 표면으로 옮기고,
    눈구멍 · 입 안쪽처럼 접힌 정점은 표면 위에서 고르게 편다. 목 쪽은 원래 모양과 부드럽게 섞는다."""
    n = len(P)
    span = z_top - z_neck
    t = np.clip((P[:, 2] - z_neck) / (0.16 * span), 0, 1)
    w = t * t * (3 - 2 * t)
    hd = P[:, 2] > z_neck + 0.25 * span
    H = P[hd]
    mid = H[(H[:, 2] > z_neck + 0.45 * span) & (H[:, 2] < z_neck + 0.75 * span)]
    c = np.array([np.median(H[:, 0]), (np.percentile(mid[:, 1], 99) + np.percentile(mid[:, 1], 1)) / 2, 0.0])
    ax = np.percentile(np.abs(mid[:, 0] - c[0]), 90)             # 귀는 빼고 옆 너비
    ay = (np.percentile(mid[:, 1], 99) - np.percentile(mid[:, 1], 1)) / 2 * 1.03
    az = (z_top - (z_neck + 0.06 * span)) / 2
    c[2] = z_top - az

    def egg(U):
        lo = ((1 - U[:, 2]) / 2) ** 2           # 아래쪽일수록 좁게(턱) — 매끈하게 이어지게 제곱
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
    # 표면 위에서 고르게: 펴고 → 다시 달걀 위로 (접힌 눈구멍 · 입술 정점이 풀린다)
    full = w > 0.98
    for _ in range(200):
        m = av.neighbor_mean(out, edges, n)
        out = out + (0.5 * w)[:, None] * (m - out)
        out[full] = project(out[full])
    band = (w > 0.02) & (w < 0.98)
    for _ in range(10):
        m = av.neighbor_mean(out, edges, n)
        out[band] = out[band] + 0.5 * (m[band] - out[band])
    return out


def smooth_spots(P, edges, centers, radius, it=40):
    """centers 둘레 radius 안을 매끈하게 (마네킹엔 유두가 없다)"""
    n = len(P)
    w = np.zeros(n)
    for c in centers:
        d = np.linalg.norm(P - c, axis=1)
        w = np.maximum(w, np.clip(1 - d / radius, 0, 1))
    w = w * w * (3 - 2 * w)
    Q = P.copy()
    for _ in range(it):
        Q = Q + (0.5 * w)[:, None] * (av.neighbor_mean(Q, edges, n) - Q)
    return Q


def flatten_hems(P, faces_local):
    """옷 가장자리(열린 둘레)를 고리마다 같은 높이로 — 면을 골라 만든 옷이라 끝이 톱니 모양이 된다"""
    from collections import Counter, defaultdict
    cnt = Counter()
    for f in faces_local:
        for x, y in zip(f, f[1:] + f[:1]):
            cnt[(min(x, y), max(x, y))] += 1
    adj = defaultdict(set)
    for (x, y), c in cnt.items():
        if c == 1:
            adj[x].add(y)
            adj[y].add(x)
    seen = set()
    Q = P.copy()
    for s0 in list(adj):
        if s0 in seen:
            continue
        comp, stack = [], [s0]
        while stack:
            v = stack.pop()
            if v in seen:
                continue
            seen.add(v)
            comp.append(v)
            stack.extend(adj[v] - seen)
        z = P[comp, 2]
        if z.max() - z.min() < 0.05:   # 가로 둘레만 (어깨끈 가장자리처럼 세로로 긴 둘레는 그대로)
            Q[comp, 2] = np.median(z)
    return Q


def normals_of(P, faces_local):
    N = np.zeros_like(P)
    for f in faces_local:
        a, b, c = P[f[0]], P[f[1]], P[f[2]]
        nrm = np.cross(b - a, c - a)
        for i in f:
            N[i] += nrm
    N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
    # 감는 방향이 안쪽이면 뒤집는다 (몸통 축에서 바깥을 보게)
    axis = np.array([P[:, 0].mean(), P[:, 1].mean(), 0.0])
    out = P - axis
    out[:, 2] = 0
    if (N * out).sum() < 0:
        N = -N
    return N


def cut_piece(src, name, planes, keep):
    """src(셰이프 키 포함)를 복사해 평면들로 자르고, 면 가운데가 keep 을 만족하는 면만 남긴다(기본 모양 기준).
    bmesh 의 자르기는 새 정점의 셰이프 키 값도 보간한다."""
    import bmesh
    from mathutils import Vector
    me = src.data.copy()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    bm = bmesh.new()
    bm.from_mesh(me)
    for v, axis in planes:
        no = Vector((1, 0, 0)) if axis == 'x' else Vector((0, 0, 1))
        co = no * v
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no)
    kill = [f for f in bm.faces if not keep(f.calc_center_median())]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(me)
    bm.free()
    me.update()
    return o


def offset_piece(o, dist, smooth=25):
    """모든 셰이프 키에서: 천처럼 오목한 곳(가슴 사이 · 사타구니)을 건너 펴고, 몸보다 안으로는 안 들어가게 한 뒤
    그 모양의 법선으로 dist 만큼 바깥으로"""
    polys = [list(p.vertices) for p in o.data.polygons]
    E = edges_from_faces(polys)
    n = len(o.data.vertices)
    from collections import Counter
    cnt = Counter((min(a, b), max(a, b)) for f in polys for a, b in zip(f, f[1:] + f[:1]))
    edge = np.zeros(n, bool)
    for (a, b), c in cnt.items():
        if c == 1:
            edge[a] = edge[b] = True
    move = (~edge).astype(float)[:, None]   # 가장자리는 고정 — 펴다가 끝이 줄어들지 않게
    for kb in o.data.shape_keys.key_blocks:
        co = np.empty(len(kb.data) * 3)
        kb.data.foreach_get('co', co)
        P = co.reshape(-1, 3)
        N = normals_of(P, polys)
        Q = P.copy()
        for _ in range(smooth):
            Q = Q + 0.5 * move * (av.neighbor_mean(Q, E, n) - Q)
            inside = ((P - Q) * N).sum(1)
            Q = Q + N * np.maximum(inside, 0)[:, None]
        P = Q + normals_of(Q, polys) * dist
        kb.data.foreach_set('co', P.astype(np.float32).ravel())
        if kb.name == 'Basis':
            o.data.vertices.foreach_set('co', P.astype(np.float32).ravel())
    o.data.update()


# ── 포즈(A-포즈) ──────────────────────────────────────────────────────────

def make_rig(J):
    arm = bpy.data.armatures.new('rig')
    rig = bpy.data.objects.new('rig', arm)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    with bpy.context.temp_override(active_object=rig, object=rig):
        bpy.ops.object.mode_set(mode='EDIT')
        def bone(name, h, t, parent=None):
            b = arm.edit_bones.new(name)
            b.head, b.tail = h.tolist(), t.tolist()
            if parent:
                b.parent = arm.edit_bones[parent]
            return b
        bone('spine', J['pelvis'], J['neck'])
        bone('head', J['neck'], J['head2'], 'spine')
        for s in ('l', 'r'):
            bone(f'shoulder.{s}', J['neck'] * 0.7 + J[f'shoulder.{s}'] * 0.3, J[f'shoulder.{s}'], 'spine')
            bone(f'upper_arm.{s}', J[f'shoulder.{s}'], J[f'elbow.{s}'], f'shoulder.{s}')
            bone(f'forearm.{s}', J[f'elbow.{s}'], J[f'hand.{s}'], f'upper_arm.{s}')
            bone(f'hand.{s}', J[f'hand.{s}'], J[f'hand.{s}'] + (J[f'hand.{s}'] - J[f'elbow.{s}']) * 0.4, f'forearm.{s}')
            bone(f'thigh.{s}', J[f'leg.{s}'], J[f'knee.{s}'], 'spine')
            bone(f'shin.{s}', J[f'knee.{s}'], J[f'ankle.{s}'], f'thigh.{s}')
        bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def bind(obj, rig):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    obj.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    with bpy.context.temp_override(active_object=rig, object=rig, selected_objects=[obj, rig],
                                   selected_editable_objects=[obj, rig]):
        bpy.ops.object.parent_set(type='ARMATURE_AUTO')


def pose_arms(rig, J, angle):
    for s, sign in (('l', 1), ('r', -1)):
        d = J[f'elbow.{s}'] - J[f'shoulder.{s}']
        cur = math.degrees(math.atan2(abs(d[0]), -d[2]))  # 수직 아래 기준 팔 각도
        pb = rig.pose.bones[f'upper_arm.{s}']
        pb.rotation_mode = 'XYZ'
        # 정면(-Y) 축으로 돌려 팔을 몸 쪽으로 내린다 — 월드 축을 본 공간으로 바꿔 쓴다
        rot = math.radians(cur - angle) * sign
        from mathutils import Quaternion, Vector
        mw = rig.matrix_world @ pb.bone.matrix_local
        axis_local = mw.to_3x3().inverted() @ Vector((0.0, 1.0, 0.0))
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = Quaternion(axis_local, rot)
        # 팔꿈치는 살짝만 펴진 채로 (아래팔도 같은 만큼 덜 꺾이게)
        log(f'팔 {s}: {cur:.1f}° → {angle}°')
    bpy.context.view_layer.update()


def evaluated_positions(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = ev.to_mesh()
    P = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', P)
    ev.to_mesh_clear()
    return P.reshape(-1, 3)


# ── 위장무늬 ─────────────────────────────────────────────────────────────

def camo_material():
    """남성 반바지와 같은 회색 위장무늬(4톤) — 노이즈 두 겹을 계단 램프로"""
    m = bpy.data.materials.new('camo')
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    coord = nt.nodes.new('ShaderNodeTexCoord')
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 7.0
    noise.inputs['Detail'].default_value = 3.0
    noise.inputs['Roughness'].default_value = 0.45
    noise.inputs['Distortion'].default_value = 0.6
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'CONSTANT'
    els = ramp.color_ramp.elements
    tones = [(0.0, 0.035), (0.42, 0.075), (0.53, 0.16), (0.64, 0.26)]
    els[0].position, els[0].color = tones[0][0], (tones[0][1],) * 3 + (1,)
    els[1].position, els[1].color = tones[1][0], (tones[1][1],) * 3 + (1,)
    for pos, v in tones[2:]:
        e = els.new(pos)
        e.color = (v, v, v, 1)
    nt.links.new(coord.outputs['Object'], noise.inputs['Vector'])
    nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    return m


def bake_camo(cl, folder, size):
    src = cl.copy()
    src.data = cl.data.copy()
    src.name = '_camo_src'
    bpy.context.scene.collection.objects.link(src)
    src.data.materials.clear()
    src.data.materials.append(camo_material())
    av.bake_cloth([src], cl, folder, size)
    bpy.data.objects.remove(src)


# ── main ─────────────────────────────────────────────────────────────────

def main():
    a = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mh = MH(a.mh)
    shapes = {'base': mh.shape(*BASE_MW), **{k: mh.shape(*mw) for k, mw in TARGETS.items()}}
    B = {k: to_blender(V) for k, V in shapes.items()}
    # MakeHuman 최대 체중은 체지방 F5(여 약 38%)보다 덜 무겁다 — 살 모프만 조금 더 민다
    B['fat_up'] = B['base'] + (B['fat_up'] - B['base']) * FAT_UP_GAIN
    base_mh = shapes['base']

    # 몸 · 옷 면
    body_f = [(f, t) for g, f, t in mh.faces if g == 'body']
    y = lambda name: mh.joint(base_mh, name)[1]
    waist_y = y('joint-spine-3') + 0.05
    thigh_y = (y('joint-l-upper-leg') + y('joint-l-knee')) / 2 + 0.25
    sh_x = mh.joint(base_mh, 'joint-l-shoulder')[0]
    bust_lo = y('joint-spine-1') - 0.95
    bust_hi = y('joint-spine-1') + 0.25
    neck_y = y('joint-neck')

    log(f'몸 면 {len(body_f)}')
    holes = head_holes([f for f, _ in body_f], base_mh, y('joint-neck') + 0.3)
    log(f'머리 구멍 {len(holes)}개 막음 ({[len(h) for h in holes]})')
    body_f = body_f + [(h, [-1] * len(h)) for h in holes]
    body, used_b = build_mesh('body', B['base'], body_f, mh.VT)
    # 얼굴 없는 머리 — 모든 모양에 같은 처리
    remap = {o: n for n, o in enumerate(used_b)}
    faces_local = [[remap[i] for i in f] for f, _ in body_f]
    E = edges_from_faces(faces_local)
    z_neck = to_blender(mh.joint(base_mh, 'joint-neck')[None])[0, 2] + 0.02
    z_top = B['base'][used_b, 2].max()
    head = {k: mannequin_head(P[used_b], E, z_neck, z_top) for k, P in B.items()}
    # 유두 자리: 가슴 높이에서 좌우 각각 가장 앞으로 나온 점 (기본 몸) — 모든 모양에 같은 정점을 편다
    Pb0 = head['base']
    zc = float(to_blender(mh.joint(base_mh, 'joint-spine-1')[None])[0, 2])
    tips = []
    for sgn in (1, -1):
        m = (np.abs(Pb0[:, 2] - (zc - 0.06)) < 0.06) & (Pb0[:, 0] * sgn > 0.03) & (Pb0[:, 0] * sgn < 0.14)
        idx = np.where(m)[0]
        tips.append(int(idx[np.argmin(Pb0[idx, 1])]))
    for k in head:
        head[k] = smooth_spots(head[k], E, [head[k][i] for i in tips], 0.03)
    body.data.vertices.foreach_set('co', head['base'].astype(np.float32).ravel())
    add_shape_keys(body, {k: head[k] for k in KEYS})

    # 옷: 몸 껍질을 평면으로 잘라(가장자리가 곧게) 바깥으로 띄운다 — 모프마다 몸을 그대로 따라간다
    zb = lambda yy: float(to_blender(np.array([[0.0, yy, 0.0]]))[0, 2])
    xb = lambda xx: float(xx * SCALE)
    sh = cut_piece(body, '_shorts', [(zb(thigh_y), 'z'), (zb(waist_y), 'z')],
                   lambda c: zb(thigh_y) < c.z < zb(waist_y) and abs(c.x) < xb(sh_x * 1.35))
    br = cut_piece(body, '_bra', [(zb(bust_lo), 'z'), (zb(bust_hi), 'z'), (zb(neck_y - 0.12), 'z'),
                                  (xb(sh_x * 0.36), 'x'), (-xb(sh_x * 0.36), 'x'), (xb(sh_x * 0.64), 'x'), (-xb(sh_x * 0.64), 'x'),
                                  (xb(sh_x * 0.9), 'x'), (-xb(sh_x * 0.9), 'x')],
                   lambda c: (zb(bust_lo) < c.z < zb(bust_hi) and abs(c.x) < xb(sh_x * 0.9))
                   or (zb(bust_hi) - 0.001 < c.z < zb(neck_y - 0.12) and xb(sh_x * 0.36) < abs(c.x) < xb(sh_x * 0.64)))
    offset_piece(sh, 0.006)
    offset_piece(br, 0.005)
    log(f'반바지 정점 {len(sh.data.vertices)} · 브라 {len(br.data.vertices)}')

    # A-포즈 — 기본 몸의 관절로 리그를 세우고 자동 가중치로 붙인다
    J = {}
    jb = lambda n: to_blender(mh.joint(base_mh, n)[None])[0]
    J['pelvis'], J['neck'], J['head2'] = jb('joint-pelvis'), jb('joint-neck'), jb('joint-head-2')
    for s in ('l', 'r'):
        J[f'shoulder.{s}'] = jb(f'joint-{s}-shoulder')
        J[f'elbow.{s}'] = jb(f'joint-{s}-elbow')
        J[f'hand.{s}'] = jb(f'joint-{s}-hand')
        J[f'leg.{s}'] = jb(f'joint-{s}-upper-leg')
        J[f'knee.{s}'] = jb(f'joint-{s}-knee')
        J[f'ankle.{s}'] = jb(f'joint-{s}-ankle')
    rig = make_rig(J)
    # 옷은 팔에 닿지 않는다 — 몸만 리그에 붙인다(옷에 팔 가중치가 섞이면 팔을 내릴 때 옷이 끌려간다)
    # 자동 가중치(열 확산)는 머리를 고친 메시에서 실패할 수 있다(접힌 면) — 원래 MakeHuman 모양의 복사본에
    # 붙여 가중치를 받고, 정점 번호가 같은 몸에 옮겨 담는다
    tmp, _ = build_mesh('_bind', B['base'], body_f)
    bind(tmp, rig)
    nv = len(tmp.data.vertices)
    for vg in tmp.vertex_groups:
        g = body.vertex_groups.new(name=vg.name)
        for i in range(nv):
            try:
                w = vg.weight(i)
            except RuntimeError:
                continue
            if w > 0:
                g.add([i], w, 'REPLACE')
    log('가중치 그룹', len(tmp.vertex_groups))
    bpy.data.objects.remove(tmp)
    mod = body.modifiers.new('rig', 'ARMATURE')
    mod.object = rig
    rig.data.pose_position = 'POSE'
    with bpy.context.temp_override(active_object=rig, object=rig):
        bpy.ops.object.mode_set(mode='POSE')
        pose_arms(rig, J, a.arm_angle)
        bpy.ops.object.mode_set(mode='OBJECT')

    # 포즈를 적용한 모양을 키마다 굳혀 새 메시로
    final = {}
    for o in (body, sh, br):
        sk = o.data.shape_keys.key_blocks
        res = {}
        for k in ['base'] + list(KEYS):
            for kb in sk[1:]:
                kb.value = 1.0 if kb.name == k else 0.0
            bpy.context.view_layer.update()
            res[k] = evaluated_positions(o)
        final[o.name] = res
    polys = {o.name: [list(p.vertices) for p in o.data.polygons] for o in (body, sh, br)}
    uvs = {}
    uvl = body.data.uv_layers.get('UVMap')
    if uvl:
        uvs = [tuple(uvl.data[i].uv) for i in range(len(uvl.data))]
    for o in (body, sh, br, rig):
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
        add_shape_keys(o, {k: res[k] for k in KEYS})
        return o

    body = rebuild('body', final['body'], polys['body'], uvs)
    # 옷 하나로 (반바지 + 브라)
    off = len(final['_shorts']['base'])
    cres = {k: np.concatenate([final['_shorts'][k], final['_bra'][k]]) for k in final['_shorts']}
    cfaces = polys['_shorts'] + [[i + off for i in f] for f in polys['_bra']]
    clothes = rebuild('clothes', cres, cfaces)
    outs = [body, clothes]

    # 발바닥 0 · 가운데 0
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
    log(f'키 {H:.3f} m · 몸 삼각형 {sum(len(p.vertices) - 2 for p in body.data.polygons)} · 옷 {sum(len(p.vertices) - 2 for p in clothes.data.polygons)}')

    if a.tex:
        os.makedirs(a.tex, exist_ok=True)
        bake_camo(clothes, a.tex, 1024)
        # AO 만 (MakeHuman 몸은 매끈해서 노멀맵을 따로 굽지 않는다)
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
