// 의도 분류 정확도 — 규칙만이라 API 키 없이 돈다: node scripts/coach-eval/route-check.cjs (functions 빌드 뒤)
const { routeTurn } = require('../../functions/lib/coach/intent');
const cases = require('./cases.json');
let ok = 0;
const bad = [];
for (const c of cases) {
  const got = routeTurn(c.q, (c.history ?? []).filter((m) => m.role === 'user').map((m) => m.content)).intent;
  if (c.intent.split('|').includes(got)) ok++;
  else bad.push(`${c.id} [${c.intent} → ${got}] ${c.q}`);
}
console.log(`의도 분류 ${ok}/${cases.length} (${Math.round(ok / cases.length * 100)}%)`);
bad.forEach((b) => console.log('  ✗', b));
process.exit(bad.length / cases.length > 0.05 ? 1 : 0);
