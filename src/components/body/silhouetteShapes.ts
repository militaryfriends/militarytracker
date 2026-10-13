/**
 * 실루엣 도형 계산 — React Native 를 import 하지 않는 순수 함수(미리보기 스크립트 · 테스트에서도 돈다).
 * 그리는 쪽은 Silhouette.tsx. 규칙은 그 파일 머리말 참고.
 */
import type { Sex } from '../../utils/bodyComp';

type Pt = [number, number];

/** 점들을 지나는 매끈한 곡선 (Catmull-Rom → 베지어) */
function smooth(pts: Pt[], closed: boolean): string {
  const n = pts.length;
  const at = (i: number): Pt => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return closed ? `${d} Z` : d;
}

/** 왼쪽 반쪽 윤곽(위→아래)을 오른쪽으로 접어 닫힌 도형으로 */
const mirror = (half: Pt[]): Pt[] => [...half, ...half.slice().reverse().map(([x, y]): Pt => [200 - x, y])];

/** 팔 하나 — 어깨 관절에서 A 포즈(몸에서 15°)로, 길이를 따라 반폭을 바꾼다 */
function arm(sx: number, sy: number, side: 1 | -1, widths: [number, number][], len: number): string {
  const a = (15 * Math.PI) / 180;
  const dx = Math.sin(a) * side, dy = Math.cos(a);
  const nx = dy * side, ny = -dx * side;
  const outer: Pt[] = [];
  const inner: Pt[] = [];
  for (const [t, w] of widths) {
    const cx = sx + dx * len * t, cy = sy + dy * len * t;
    outer.push([cx + nx * w, cy + ny * w]);
    inner.push([cx - nx * w, cy - ny * w]);
  }
  return smooth([...outer, ...inner.reverse()], true);
}

export function silhouetteShapes(sex: Sex, f: number, m: number) {
  const F = Math.max(0, Math.min(1, (f - 1) / 4));
  const M = Math.max(0, Math.min(1, (m - 1) / 4));
  const fem = sex === 'female';
  // 반폭(가운데 x=100 에서). 남녀 비율만 다르고 축 방향은 같다
  const neck = 6.8 + 3.4 * M + 2.6 * F - (fem ? 1.4 : 0);
  const sho = (fem ? 29 : 33) + (fem ? 8 : 15) * M + 2.5 * F;
  const chest = (fem ? 26 : 28.5) + (fem ? 5 : 10) * M + 6.5 * F;
  const bust = fem ? 2.5 + 3.5 * F : 0;
  // 허리는 지방이 가장 크게, 근육은 조금만 (근육이 늘면 역삼각형이 된다)
  const waist = (fem ? 19.5 : 22.5) + (fem ? 15 : 18) * F + 1.8 * M;
  const hip = (fem ? 30 : 26.5) + (fem ? 12 : 9.5) * F + 2.5 * M;
  const thigh = 12.5 + 5.5 * F + 5 * M + (fem ? 1.2 : 0);
  const knee = 7.6 + 1.8 * F + 1.6 * M;
  const calf = 8.6 + 2 * F + 3 * M;
  const ankle = 5 + 0.7 * F;
  const legX = 12 + 4 * F + 2 * M + (fem ? 1.5 : 0);

  const torso = smooth(mirror([
    [100 - neck, 46], [100 - neck - 1, 55],
    [100 - sho + 6, 60], [100 - sho, 69],
    [100 - chest - bust * 0.4, 88], [100 - chest + 2 - bust, 102],
    [100 - waist, 122], [100 - hip, 148], [100 - hip + 2, 166],
  ]), true);

  const leg = (side: 1 | -1): string => {
    const cx = 100 + side * legX;
    const out = (w: number) => cx + side * w;
    const inn = (w: number) => cx - side * w;
    return smooth([
      [out(thigh + 1.5), 152], [out(thigh), 176], [out(knee + 1), 224], [out(calf), 246], [out(ankle), 279],
      [out(ankle + 3), 287], [inn(ankle + 1), 288], [inn(ankle), 279], [inn(calf * 0.85), 246],
      [inn(knee), 224], [inn(thigh * 0.9), 182], [100 + side * 1.5, 168],
    ], true);
  };

  const sx = 100 - sho + 7;
  const up = 5.8 + 5.4 * M + 2.8 * F - (fem ? 1.4 : 0);
  const fore = 5 + 3.2 * M + 1.6 * F - (fem ? 0.8 : 0);
  const armW: [number, number][] = [[0, up + 1.5], [0.22, up + 0.6], [0.45, up * 0.82], [0.52, fore + 0.6], [0.72, fore], [0.93, 3.6 + 0.6 * M], [1, 3.9 + 0.5 * M]];
  const armL = arm(sx, 68, -1, armW, 104);
  const armR = arm(200 - sx, 68, 1, armW, 104);

  // 반바지(남) · 스포츠 브라 + 반바지(여) — 몸보다 한 톤 어둡게
  const shorts = smooth(mirror([
    [100 - hip - 0.5, 140], [100 - hip - 1, 160], [100 - legX - thigh - 2.5, 196], [100 - legX + thigh * 0.6, 199], [99, 174],
  ]), true);
  const bra = fem ? smooth(mirror([[100 - chest + 4, 81], [100 - chest + 1 - bust * 0.6, 92], [100 - chest + 3 - bust * 0.6, 104], [97, 107]]), true) : null;
  return { torso, legL: leg(-1), legR: leg(1), armL, armR, shorts, bra, headRx: 14.5 + 1.6 * F + (fem ? -0.8 : 0) };
}
