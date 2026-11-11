// 프롬프트 예시 질문이 평가 문항과 글자 그대로 겹치는지 — 겹치면 그 문항은 외운 답으로 채점된다.  node scripts/coach-eval/dup-check.cjs
const fs = require('fs');
const path = require('path');
const cases = require('./cases.json');
const src = fs.readFileSync(path.join(__dirname, '../../functions/src/coach/prompt.ts'), 'utf8');
const norm = (s) => s.replace(/[\s?.!,·]/g, '');
const qs = [...src.matchAll(/<question>(.*?)<\/question>\n\{/g)].map((m) => m[1]);
let dup = 0;
for (const q of qs) {
  const hit = cases.filter((c) => norm(c.q) === norm(q) || (c.history ?? []).some((h) => norm(h.content) === norm(q)));
  if (hit.length) dup++;
  console.log(`${hit.length ? '✗ 겹침' : '✓'} ${q}${hit.length ? `  ← ${hit.map((c) => c.id).join(', ')}` : ''}`);
}
console.log(`예시 ${qs.length}개 · 겹침 ${dup}개`);
process.exit(dup ? 1 : 0);
