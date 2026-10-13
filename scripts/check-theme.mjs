#!/usr/bin/env node
/**
 * 테마 대비 검사 — src/theme/palette.json 의 두 모드를 같은 기준으로 잰다 (WCAG 대비).
 *   npm run check:theme
 * 기준을 못 넘으면 종료 코드 1. 색을 바꾸면 돌린다.
 * 반투명(rgba) 토큰은 바탕 위에 섞어서 잰다.
 */
import { readFileSync } from 'node:fs';

const palette = JSON.parse(readFileSync(new URL('../src/theme/palette.json', import.meta.url), 'utf8'));

function parse(c) {
  const h = /^#([0-9a-f]{6})$/i.exec(c);
  if (h) { const n = parseInt(h[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255, 1]; }
  const r = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/i.exec(c);
  if (r) return [+r[1], +r[2], +r[3], +r[4]];
  throw new Error(`색을 읽을 수 없음: ${c}`);
}
/** fg 를 bg 위에 얹은 색 */
function over(fg, bg) {
  const [r, g, b, a] = parse(fg); const [R, G, B] = parse(bg);
  return [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)];
}
function lum([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(fg, bg, base) {
  const B = over(bg, base); const F = over(fg, `rgba(${B.map(Math.round).join(',')},1)`);
  const a = lum(F), b = lum(B);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// [글자, 바탕, 최소] — 바탕은 bg 위에 얹어서
const PAIRS = [
  ['ink', 'bg', 7], ['ink', 'panel', 7], ['ink', 'panel3', 7],
  ['mid', 'bg', 4.5], ['mid', 'panel', 4.5], ['mid', 'panel2', 4.5],
  ['muted', 'bg', 4.5], ['muted', 'panel', 4.5], ['muted', 'panel2', 4.5],
  ['onAccent', 'accent', 4.5], ['onAccentSub', 'accent', 3],
  ['good', 'panel', 4.5], ['good', 'goodBg', 4.5],
  ['wrong', 'panel', 4.5], ['wrong', 'wrongBg', 4.5],
  ['pr', 'panel', 4.5], ['pr', 'prBg', 4.5],
  ['onMedia', 'mediaBadge', 4.5],
];

let failed = 0;
for (const mode of ['dark', 'light']) {
  const p = palette[mode];
  const missing = Object.keys(palette.dark).filter((k) => !(k in p));
  if (missing.length) { console.log(`✗ ${mode}: 빠진 토큰 ${missing.join(', ')}`); failed++; }
  for (const [fg, bg, min] of PAIRS) {
    const r = ratio(p[fg], p[bg], p.bg);
    const ok = r >= min;
    if (!ok) failed++;
    console.log(`${ok ? '✓' : '✗'} ${mode.padEnd(5)} ${fg.padEnd(11)} / ${bg.padEnd(10)} ${r.toFixed(2).padStart(5)}  (≥ ${min})`);
  }
}
if (failed) { console.log(`\n${failed}건 미달`); process.exit(1); }
console.log('\n모두 통과');
