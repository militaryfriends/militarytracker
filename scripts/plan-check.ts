// 자동 루틴 규칙 검사 — 모든 장소 × 주 N일 × 레벨 × 재구성 seed: 위험 종목 0 · 허리 부하 하루 1개 · 데드/랙풀 주 1회 · 장소 · 중복 · 종목 수
// npm run check:plans
import { buildLocalPlan } from '../src/utils/planner';
import { exById } from '../src/data/exercises';
import { DANGER, LUMBAR, WEEKLY_ONCE } from '../src/data/planTemplates';
let bad = 0, n = 0;
for (const env of ['gym','home']) for (const days of [2,3,4,5,6]) for (const level of [1,2,3]) for (const goal of ['muscle','habit']) for (const seed of [undefined, 1, 2, 3, 99, 12345]) {
  const p = buildLocalPlan({ env, days, level, goal } as any, seed as any); n++;
  if (p.days.length !== Math.min(6, Math.max(2, days))) { bad++; console.log('days', env, days, p.days.length); }
  const wk = new Map<string, number>();
  for (const d of p.days) {
    if (d.ids.length < (goal === 'habit' ? 3 : 5)) { bad++; console.log('short', env, days, level, d.name, d.ids); }
    if (d.ids.filter((i) => LUMBAR.has(i)).length > 1) { bad++; console.log('lumbar', d.ids); }
    for (const i of d.ids) { if (DANGER.has(i)) { bad++; console.log('danger', i); } if (!exById(i)!.pl.includes(env as any)) { bad++; console.log('place', i); } if (WEEKLY_ONCE.has(i)) wk.set(i, (wk.get(i) ?? 0) + 1); }
    if (new Set(d.ids).size !== d.ids.length) { bad++; console.log('dup', d.ids); }
  }
  for (const [i, c] of wk) if (c > 1) { bad++; console.log('weekly', i, c); }
}
console.log('plans', n, 'problems', bad);
