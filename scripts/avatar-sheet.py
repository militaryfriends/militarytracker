#!/usr/bin/env python3
"""
아바타 5×5 컨택트 시트 (확인 · 승인용)

  python3 scripts/avatar-sheet.py <렌더 폴더>                 # m · f 있는 대로
  python3 scripts/avatar-sheet.py <렌더 폴더> --sex m --bg '#F4F4F5' --out sheet_m.png
  필요: pip install pillow  (안 되면 pip install --break-system-packages pillow)

배치: 왼쪽 → 오른쪽 = 체지방 F1 → F5, 아래 → 위 = 근육 M1 → M5 (앱 그리드와 같은 방향)
입력: avatar_{m|f}_F{1-5}M{1-5}.png (없으면 .webp). 빈 칸은 회색 테두리로 표시
출력: <렌더 폴더>/contact_{m|f}.png
"""
import argparse
import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit('Pillow 가 필요합니다: pip install pillow  (또는 pip install --break-system-packages pillow)')

FONTS = [  # 한글이 되는 글꼴 (맥 · 리눅스 · 윈도)
    ('/System/Library/Fonts/AppleSDGothicNeo.ttc', 0),
    ('/System/Library/Fonts/Supplemental/AppleGothic.ttf', 0),
    ('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 1),
    ('/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc', 1),
    ('/usr/share/fonts/truetype/nanum/NanumGothic.ttf', 0),
    ('C:/Windows/Fonts/malgun.ttf', 0),
]
SEX = {'m': '남성', 'f': '여성'}


def font(size):
    for path, idx in FONTS:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size, index=idx), True
            except OSError:
                continue
    return ImageFont.load_default(), False


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def load(d, sex, f, m):
    for ext in ('png', 'webp'):
        p = os.path.join(d, f'avatar_{sex}_F{f}M{m}.{ext}')
        if os.path.exists(p):
            return Image.open(p).convert('RGBA')
    return None


def sheet(d, sex, out, cell_w, bg):
    cells = {(f, m): load(d, sex, f, m) for f in range(1, 6) for m in range(1, 6)}
    n = sum(1 for v in cells.values() if v)
    if not n:
        return None
    cw, ch = cell_w, round(cell_w * 1.5)  # 2:3
    pad, left, top, cap = 16, 96, 140, 28
    W = left + 5 * (cw + pad) + pad
    H = top + 5 * (ch + cap + pad) + 70
    bgc = hex_rgb(bg)
    dark = sum(bgc) < 384
    ink, sub, line = ((236, 236, 238), (150, 150, 156), (60, 60, 66)) if dark else ((24, 24, 27), (110, 110, 118), (210, 210, 214))
    img = Image.new('RGBA', (W, H), bgc + (255,))
    dr = ImageDraw.Draw(img)
    f_big, ko = font(30)
    f_mid, _ = font(22)
    f_small, _ = font(16)
    t = lambda ko_s, en_s: ko_s if ko else en_s  # 한글 글꼴이 없으면 영어
    dr.text((pad, 20), t(f'{SEX[sex]} 아바타 5×5', f'{"Male" if sex == "m" else "Female"} avatars 5x5') + f'  ({n}/25)', font=f_big, fill=ink)
    dr.text((pad, 62), os.path.abspath(d), font=f_small, fill=sub)
    for f in range(1, 6):  # 열 = 체지방
        x = left + pad + (f - 1) * (cw + pad)
        dr.text((x + cw // 2, top - 14), f'F{f}', font=f_mid, fill=ink, anchor='ms')
    for m in range(1, 6):  # 행 = 근육 (아래가 M1)
        y = top + (5 - m) * (ch + cap + pad)
        dr.text((left - 16, y + ch // 2), f'M{m}', font=f_mid, fill=ink, anchor='rm')
        for f in range(1, 6):
            x = left + pad + (f - 1) * (cw + pad)
            im = cells[(f, m)]
            if im:
                im = im.resize((cw, ch), Image.LANCZOS)
                img.alpha_composite(im, (x, y))
            else:
                dr.rectangle([x, y, x + cw - 1, y + ch - 1], outline=line, width=2)
                dr.text((x + cw // 2, y + ch // 2), t('없음', 'missing'), font=f_small, fill=sub, anchor='mm')
            dr.text((x + cw // 2, y + ch + 20), f'F{f}M{m}', font=f_small, fill=sub, anchor='ms')
    by = H - 36
    dr.text((left + pad, by), t('체지방 →  (F1 가장 마름 · F5 가장 지방 많음)', 'body fat →  (F1 leanest · F5 most fat)'), font=f_mid, fill=ink)
    dr.text((pad, top - 14), t('근육 ↑', 'muscle ↑'), font=f_mid, fill=ink, anchor='ls')
    img.convert('RGB').save(out)
    return out, n


def main():
    p = argparse.ArgumentParser(description='아바타 5×5 컨택트 시트')
    p.add_argument('dir', help='render-avatars.py 출력 폴더')
    p.add_argument('--sex', choices=['m', 'f'], help='한 성별만 (기본: 있는 대로)')
    p.add_argument('--out', help='출력 파일 (한 성별일 때만)')
    p.add_argument('--cell', type=int, default=240, help='칸 너비 px (기본 240 → 칸 240×360)')
    p.add_argument('--bg', default='#18181B', help="바탕색 (기본 다크. 라이트 확인은 '#F4F4F5')")
    a = p.parse_args()
    made = 0
    for sex in ([a.sex] if a.sex else ['m', 'f']):
        out = a.out if (a.out and a.sex) else os.path.join(a.dir, f'contact_{sex}.png')
        r = sheet(a.dir, sex, out, a.cell, a.bg)
        if r:
            print(f'{r[0]}  ({r[1]}/25칸)')
            made += 1
    if not made:
        sys.exit(f'{a.dir} 에 avatar_m_F?M?.png / avatar_f_F?M?.png 가 없습니다')


if __name__ == '__main__':
    main()
