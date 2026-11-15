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

# ── 체형 축(2026-11-15) — 체지방 · 근육 2축으로 못 그리는 몸(뱃살형 · 하체형 · 어깨 넓은 몸 · 고도 비만).
# 남성 조각 모델의 scripts/avatar-shape-axes.py 와 같은 이름 · 같은 뜻. 앱에서의 쓰임은 morph.ts 의 Shape.
# 세기는 줄자(볼록 껍질 둘레, 키 height_cm 환산)로 재서 맞춘다 — 빌드 로그에 표로 찍힌다.
#   belly 배 집중 · lower 하체 집중 · mus_bias 근육 분포(+상체형 / -하체형) · shoulder 어깨 너비 · pelvis 골반 너비 · fat_xl fat_up 너머
AXES = {
    'f': {
        'height_cm': 162.0, 'z_waist': 0.62, 'z_hip': 0.48,
        'belly': {'cm': 11.0, 'targets': [('stomach/stomach-pregnant-incr', 0.3), ('measure/measure-waist-circ-incr', 0.7), ('torso/torso-scale-depth-incr', 0.3),
                                          ('stomach/stomach-navel-in', 0.2)]},
        'lower': {'cm': 8.0, 'targets': [('measure/measure-hips-circ-incr', 0.3), ('buttocks/buttocks-volume-incr', 0.4),
                                         ('armslegs/{s}-upperleg-fat-incr', 0.6), ('measure/measure-thigh-circ-incr', 0.6)]},
        'shoulder': {'cm': 1.8, 'targets': [('measure/measure-shoulder-dist-incr', 1.0)]},
        'pelvis': {'cm': 1.5, 'targets': [('hip/hip-scale-horiz-incr', 1.0)]},
        'mus_bias': 0.6,
        # fat_up 1 + fat_xl 1 = 체지방 약 48% (허리 약 116cm — RFM 76 − 20·키/허리)
        # 배만 공처럼 나오지 않게(fat_up 이 이미 아랫배를 많이 민다) 아랫배 타깃은 덜고 몸통 · 골반 통을 키운다
        'fat_xl': {'cm': 30.0, 'more': 1.0, 'smooth': 14,
                   'targets': [('stomach/stomach-pregnant-incr', -0.2), ('measure/measure-waist-circ-incr', 0.9), ('torso/torso-scale-depth-incr', 0.6),
                               ('torso/torso-scale-horiz-incr', 0.3), ('hip/hip-scale-depth-incr', 0.45), ('hip/hip-scale-horiz-incr', 0.2),
                               ('buttocks/buttocks-volume-incr', 0.3), ('neck/neck-double-incr', 0.5), ('measure/measure-bust-circ-incr', 0.3),
                               ('armslegs/{s}-upperarm-fat-incr', 0.5), ('armslegs/{s}-upperleg-fat-incr', 0.2), ('armslegs/{s}-lowerleg-fat-incr', 0.3)]},
    },
}
XKEYS = ('belly', 'lower', 'mus_bias', 'shoulder', 'pelvis', 'fat_xl')
ARM.update({'belly': 11.0, 'lower': 11.0, 'mus_bias': 9.0, 'shoulder': 9.0, 'pelvis': 10.0, 'fat_xl': 17.0})


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


def _hull(P2):
    p = sorted(set(map(tuple, np.round(P2, 5))))
    if len(p) < 3:
        return 0.0
    cr = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for q in p:
        while len(lo) >= 2 and cr(lo[-2], lo[-1], q) <= 0:
            lo.pop()
        lo.append(q)
    for q in reversed(p):
        while len(up) >= 2 and cr(up[-2], up[-1], q) <= 0:
            up.pop()
        up.append(q)
    h = np.array(lo[:-1] + up[:-1])
    return float(np.linalg.norm(h - np.roll(h, -1, 0), axis=1).sum())


def add_axes(mh, S, B, sex):
    """체형 축 모양을 B 에 더하고 이름 목록을 돌려준다 (AXES 에 그 성별이 없으면 빈 목록 — 기존 4키만)."""
    AX = AXES.get(sex)
    if not AX:
        return []
    base = B['base']
    bf = [f for g, f, _ in mh.faces if g == 'body']
    E = np.array(sorted({(min(a, b), max(a, b)) for f in bf for a, b in zip(f, f[1:] + f[:1])}))
    bv = np.unique(E)
    z0 = base[bv, 2].min()
    H = base[bv, 2].max() - z0
    CM = H / AX['height_cm']
    zr = (base[:, 2] - z0) / H
    step = lambda x, a, b: np.clip((x - a) / (b - a), 0, 1) ** 2 * (3 - 2 * np.clip((x - a) / (b - a), 0, 1))
    base_mh = mh.shape(*S['base'])
    shape = lambda targets: fm.to_blender(mh.shape(*S['base'], targets)) - base

    def girth(P, z_ratio):
        """높이 z_ratio 에서 몸통을 자른 단면의 볼록 껍질 둘레(cm). 레스트 자세라 팔은 |x| 로 걸러진다(z 0.64 까지)."""
        z = z0 + z_ratio * H
        a, b = P[E[:, 0]], P[E[:, 1]]
        c = (a[:, 2] - z) * (b[:, 2] - z) < 0
        a, b = a[c], b[c]
        Q = a + (b - a) * ((z - a[:, 2]) / (b[:, 2] - a[:, 2]))[:, None]
        return _hull(Q[np.abs(Q[:, 0]) < 0.19 * H][:, :2]) / CM

    def joint_x(D, name):
        g = mh.group(name)
        return float((base[g] + D[g]).mean(0)[0] - base[g].mean(0)[0]) / CM

    def scale_to(D, measure, cm):
        k = 1.0
        for _ in range(4):
            k *= cm / max(measure(D * k), 1e-6)
        return D * k

    waist = lambda D: girth(base + D, AX['z_waist']) - girth(base, AX['z_waist'])
    hip = lambda D: girth(base + D, AX['z_hip']) - girth(base, AX['z_hip'])
    X = {}
    X['belly'] = scale_to(shape(AX['belly']['targets']), waist, AX['belly']['cm'])
    X['lower'] = scale_to(shape(AX['lower']['targets']), hip, AX['lower']['cm'])
    # 근육 분포: mus_up 을 위아래로 나눈 차이 — 팔(|x| 큼)은 상체
    upper = np.maximum(step(zr, 0.50, 0.60), step(np.abs(base[:, 0]), 0.22, 0.26))
    X['mus_bias'] = (B['mus_up'] - base) * (2 * upper - 1)[:, None] * AX['mus_bias']
    X['shoulder'] = scale_to(shape(AX['shoulder']['targets']), lambda D: joint_x(D, 'joint-l-shoulder'), AX['shoulder']['cm'])
    # 골반: 타깃이 허리까지 넓히므로 허리 위로는 지운다(뼈대만 넓게, 허리둘레는 belly · 체지방의 몫)
    pv = shape(AX['pelvis']['targets']) * (1 - step(zr, 0.56, 0.62))[:, None]
    X['pelvis'] = scale_to(pv, lambda D: joint_x(D, 'joint-l-upper-leg'), AX['pelvis']['cm'])
    xl = AX['fat_xl']
    d = (B['fat_up'] - base) * xl['more'] + shape(xl['targets'])
    deg = np.zeros(len(base))
    np.add.at(deg, E[:, 0], 1)
    np.add.at(deg, E[:, 1], 1)
    for _ in range(xl.get('smooth', 0)):      # 타깃을 범위 밖으로 겹쳐 생기는 접힌 자국을 편다(몸 정점만)
        acc = np.zeros_like(d)
        np.add.at(acc, E[:, 0], d[E[:, 1]])
        np.add.at(acc, E[:, 1], d[E[:, 0]])
        d[bv] = 0.5 * d[bv] + 0.5 * acc[bv] / deg[bv, None]
    X['fat_xl'] = scale_to(d, waist, xl['cm'])
    for k in XKEYS:
        B[k] = base + X[k]
    f5 = B['fat_up'] - base
    rows = [('기본', 0), ('F5', f5), ('belly 1', X['belly']), ('lower 1', X['lower']), ('pelvis 1', X['pelvis']),
            ('F5 + xl 0.5', f5 + X['fat_xl'] * 0.5), ('F5 + xl 1', f5 + X['fat_xl'])]
    log(f'체형 축 — 키 {AX["height_cm"]:.0f}cm 환산 (허리 z {AX["z_waist"]} · 엉덩이 z {AX["z_hip"]})')
    for name, D in rows:
        P = base + D
        log(f'  {name:12s} 허리 {girth(P, AX["z_waist"]):6.1f}  엉덩이 {girth(P, AX["z_hip"]):6.1f}')
    log(f'  shoulder 1: 어깨 관절 {joint_x(X["shoulder"], "joint-l-shoulder"):+.2f}cm · pelvis 1: 다리 관절 {joint_x(X["pelvis"], "joint-l-upper-leg"):+.2f}cm')
    return list(XKEYS)


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
    ALLK = list(KEYS) + add_axes(mh, S, B, a.sex)
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
    fm.add_shape_keys(body, {k: head[k] for k in ALLK})

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
    for k in ['base'] + ALLK:
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
        fm.add_shape_keys(o, {k: res[k] for k in ALLK})
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
