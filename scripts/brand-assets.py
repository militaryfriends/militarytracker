#!/usr/bin/env python3
"""
로고 원본 2개 → 앱에서 쓰는 브랜드 이미지 전부 (로그인 모션 · 앱 아이콘 · 스플래시 · 파비콘)

  python3 scripts/brand-assets.py
  필요: pip install numpy opencv-python-headless pillow

원본 (media/brand/)
  logo-flat.png     흰 M + 고리, 검정 바탕 (2000²) — 선명한 마크
  logo-texture.png  연기 낀 질감 M + 녹색 네온 고리 (512²) — 다크톤으로 바꿔 연기 층으로 쓴다

만드는 것
  assets/brand/m-mark.png       흰 M 만 (고리 뺌, 투명) — 고리는 앱이 선으로 그린다(BrandMark, 그려지는 모션)
  assets/brand/m-texture.png    질감 M 을 무채색으로 · 배경은 투명 · 고리 위치를 m-mark 에 맞춤
  assets/brand/grain.png        필름 그레인 타일
  assets/icon.png · android-icon-foreground.png · android-icon-monochrome.png · splash-icon(-light).png · favicon.png

고리 위치(아래 출력)는 src/components/brand/geometry.ts 와 같아야 한다. 로고를 바꾸면 다시 돌리고 그 파일을 맞출 것.
"""
import os
import cv2
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'media', 'brand')
OUT = os.path.join(ROOT, 'assets', 'brand')
os.makedirs(OUT, exist_ok=True)
BG = (9, 9, 10)          # palette dark.bg #09090A
INK = (244, 244, 245)    # palette dark.ink #F4F4F5
S = 768                  # 앱 마크 · 질감 크기 (240pt × 3배 화면)


def p(*a):
    return os.path.join(*a)


# ── 1. 흰 M 과 고리 나누기 ─────────────────────────────────────────────
flat = cv2.imread(p(SRC, 'logo-flat.png'), cv2.IMREAD_GRAYSCALE)
H = flat.shape[0]
_, bw = cv2.threshold(flat, 128, 255, cv2.THRESH_BINARY)
body = cv2.morphologyEx(bw, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41)))
far = cv2.dilate(body, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (61, 61)))
ring_far = cv2.bitwise_and(bw, cv2.bitwise_not(far))
n, lab, stats, _ = cv2.connectedComponentsWithStats(ring_far)
keep = np.zeros_like(ring_far)
for i in range(1, n):
    if stats[i, cv2.CC_STAT_AREA] > 2000:
        keep[lab == i] = 255
ys, xs = np.nonzero(keep)
(ex, ey), (ax1, ax2), ang = cv2.fitEllipse(np.c_[xs, ys].astype(np.float32))
dt = cv2.distanceTransform(keep, cv2.DIST_L2, 5)
stroke = float(np.percentile(dt[dt > 0], 99)) * 2
r = (ax1 + ax2) / 4
band = np.zeros_like(bw)
cv2.ellipse(band, ((ex, ey), (ax1, ax2), ang), 255, int(round(stroke)) + 10)
ring_px = cv2.bitwise_and(bw, band)
ring_px = cv2.bitwise_and(ring_px, cv2.bitwise_not(cv2.erode(body, np.ones((5, 5), np.uint8))))
m_only = cv2.bitwise_and(bw, cv2.bitwise_not(ring_px))
m_alpha = np.where(cv2.dilate(m_only, np.ones((5, 5), np.uint8)) > 0, flat, 0).astype(np.uint8)


def rgba(alpha, rgb=INK):
    return np.dstack([np.full_like(alpha, rgb[0]), np.full_like(alpha, rgb[1]), np.full_like(alpha, rgb[2]), alpha])


Image.fromarray(rgba(m_alpha), 'RGBA').resize((S, S), Image.LANCZOS).save(p(OUT, 'm-mark.png'), optimize=True)

# 고리 위치 (1024 좌표 — BrandMark 의 viewBox)
k = 1024 / H
cx, cy, R, SW = ex * k, ey * k, r * k, stroke * k
# 고리 끝은 M 다리 안쪽에 숨긴다 (원본도 아래쪽은 다리 뒤로 사라진다)
lx, rx = 560 * k * H / 2000, 1400 * k * H / 2000
ly = cy + np.sqrt(R ** 2 - (lx - cx) ** 2)
ry = cy + np.sqrt(R ** 2 - (rx - cx) ** 2)
print(f'RING cx={cx:.2f} cy={cy:.2f} r={R:.2f} stroke={SW:.2f}  arcL→({lx:.1f},{ly:.1f})  arcR→({rx:.1f},{ry:.1f})')

# ── 2. 질감 M → 다크톤, 고리 위치 맞춤 ───────────────────────────────
tex = cv2.imread(p(SRC, 'logo-texture.png')).astype(np.float32) / 255
b, g, rr = tex[..., 0], tex[..., 1], tex[..., 2]
neon = (g * 255 > 170) & ((g - rr) * 255 > 70) & ((g - b) * 255 > 40)
ny, nx = np.nonzero(neon)
sel = (nx < 128) | (nx > 392) | (ny > 402) | (ny < 112)   # M 바깥의 네온 고리만
nx, ny = nx[sel], ny[sel]
for _ in range(4):
    A = np.c_[2 * nx, 2 * ny, np.ones(len(nx))]
    bcx, bcy, c = np.linalg.lstsq(A, nx ** 2 + ny ** 2, rcond=None)[0]
    br = np.sqrt(c + bcx ** 2 + bcy ** 2)
    d = np.sqrt((nx - bcx) ** 2 + (ny - bcy) ** 2)
    m = np.abs(d - br) < 6
    nx, ny = nx[m], ny[m]
L = 0.2126 * rr + 0.7152 * g + 0.0722 * b
Ln = np.clip((L - 0.10) / 0.68, 0, 1) ** 1.25           # 보라 어둠 → 0, 네온 → 1
yy, xx = np.mgrid[0:L.shape[0], 0:L.shape[1]]
dist = np.sqrt((xx - bcx) ** 2 + (yy - bcy) ** 2) / (L.shape[0] / 2)
a = np.clip(Ln * np.clip(1 - (dist - 0.78) / 0.3, 0, 1) ** 1.5, 0, 1)
ks = S / 1024
sc = (R * ks) / br
M = np.float32([[sc, 0, cx * ks - bcx * sc], [0, sc, cy * ks - bcy * sc]])
aw = cv2.warpAffine((a * 255).astype(np.uint8), M, (S, S), flags=cv2.INTER_CUBIC, borderValue=0)
Image.fromarray(rgba(aw), 'RGBA').save(p(OUT, 'm-texture.png'), optimize=True)

# ── 3. 그레인 ────────────────────────────────────────────────────────
rng = np.random.default_rng(7)
noise = rng.integers(0, 255, (160, 160)).astype(np.uint8)
Image.fromarray(np.dstack([noise, noise, noise, np.full_like(noise, 24)]), 'RGBA').save(p(OUT, 'grain.png'), optimize=True)


# ── 4. 아이콘 · 스플래시 — 작은 크기에서도 보이게 고리를 굵게 다시 그린다 ──
def logo_layer(size, scale, ring_mul, rgb=INK):
    """size² 투명 캔버스 가운데에 로고(고리 + M). scale = 로고 원본 2000px 이 차지할 비율"""
    big = 2048
    ring = np.zeros((big, big), np.uint8)
    f = big / H
    w = max(1, int(round(stroke * f * ring_mul)))
    # 위쪽 호만 (원본처럼 아래 끝은 다리 뒤에 숨는다): 각도는 화면 좌표(아래가 +)
    a0 = np.degrees(np.arctan2(ly / k - ey, lx / k - ex))
    a1 = np.degrees(np.arctan2(ry / k - ey, rx / k - ex))
    cv2.ellipse(ring, (int(ex * f), int(ey * f)), (int(r * f), int(r * f)), 0, a0, 360 + a1, 255, w, cv2.LINE_AA)
    mm = cv2.resize(m_alpha, (big, big), interpolation=cv2.INTER_AREA)
    alpha = np.maximum(ring, mm)
    # 로고 상자 가운데로
    ys2, xs2 = np.nonzero(alpha > 8)
    x0, x1, y0, y1 = xs2.min(), xs2.max(), ys2.min(), ys2.max()
    crop = alpha[y0:y1 + 1, x0:x1 + 1]
    side = int(round(size * scale))
    hgt, wid = crop.shape
    f2 = side / max(hgt, wid)
    crop = cv2.resize(crop, (max(1, int(wid * f2)), max(1, int(hgt * f2))), interpolation=cv2.INTER_AREA)
    canvas = np.zeros((size, size), np.uint8)
    oy, ox = (size - crop.shape[0]) // 2, (size - crop.shape[1]) // 2
    canvas[oy:oy + crop.shape[0], ox:ox + crop.shape[1]] = crop
    return rgba(canvas, rgb)


def on_bg(layer, bg=BG):
    a = layer[..., 3:4].astype(np.float32) / 255
    out = np.array(bg, np.float32) * (1 - a) + layer[..., :3].astype(np.float32) * a
    return Image.fromarray(out.astype(np.uint8), 'RGB')


on_bg(logo_layer(1024, 0.62, 2.2)).save(p(ROOT, 'assets', 'icon.png'), optimize=True)
Image.fromarray(logo_layer(1024, 0.44, 2.2), 'RGBA').save(p(ROOT, 'assets', 'android-icon-foreground.png'), optimize=True)
Image.fromarray(logo_layer(432, 0.44, 2.2, (255, 255, 255)), 'RGBA').save(p(ROOT, 'assets', 'android-icon-monochrome.png'), optimize=True)
Image.fromarray(logo_layer(1024, 0.86, 1.4), 'RGBA').save(p(ROOT, 'assets', 'splash-icon.png'), optimize=True)
Image.fromarray(logo_layer(1024, 0.86, 1.4, BG), 'RGBA').save(p(ROOT, 'assets', 'splash-icon-light.png'), optimize=True)
on_bg(logo_layer(192, 0.7, 3.0)).resize((48, 48), Image.LANCZOS).save(p(ROOT, 'assets', 'favicon.png'), optimize=True)
print('done')
