// 출시 전 고정 시나리오 4개(대표 피드백 10/31 8절 5) — 계산 · 카드 4장 · 하루 칼로리(카드 = 식단 = 코치) · 자동 루틴을 한 번에 본다.
// npm run check:scenarios
import { analyzeBody, type AnalysisInput } from '../src/utils/bodyAnalysis';
import { profileFromAnalysis } from '../src/components/body/format';
import { calcBodyStats } from '../src/utils/body';
import { buildLocalPlan } from '../src/utils/planner';
import { exById } from '../src/data/exercises';
import { prescription, rxText } from '../src/utils/prescription';
import type { UserProfile } from '../src/types';

const S: { name: string; input: AnalysisInput; focus?: UserProfile['focus'] }[] = [
  { name: '남 · 체지방 높음 · 감량', input: { sex: 'male', age: 32, heightCm: 174, weightKg: 88, waistCm: 98, level: 2, days: 4, env: 'gym', food: 'out' } },
  { name: '남 · 마름 · 벌크업', input: { sex: 'male', age: 22, heightCm: 180, weightKg: 60, waistCm: 68, level: 1, days: 3, env: 'gym', food: 'self' } },
  { name: '여 · 근육 유지 감량', input: { sex: 'female', age: 28, heightCm: 163, weightKg: 60, waistCm: 76, level: 2, days: 4, env: 'gym', food: 'family' }, focus: ['legs'] },
  { name: '입문 · 홈트 · 주 3일', input: { sex: 'male', age: 26, heightCm: 172, weightKg: 70, level: 1, days: 3, env: 'home', food: 'convenience' } },
  { name: '10/31 테스트 입력(남 24 · 176 · 68 · 허리 84 · 상급 · 주 5)', input: { sex: 'male', age: 24, heightCm: 176, weightKg: 68, waistCm: 84, level: 3, days: 5, env: 'gym', food: 'self' } },
];

let bad = 0;
for (const sc of S) {
  const core = analyzeBody(sc.input);
  const rec = core.projects.find((p) => p.recommended)!;
  console.log(`\n■ ${sc.name}`);
  console.log(`  지금: 체지방 ${core.comp.bfPct.toFixed(1)}% · 칸 ${core.cell} · 정확도 ${core.comp.accuracy}`);
  for (const p of core.projects) {
    console.log(`  ${p.recommended ? '★' : ' '} ${p.name.padEnd(8)} ${String(p.months).padStart(2)}개월 → ${p.end.weightKg.toFixed(1)}kg · 체지방 ${p.end.bfPct.toFixed(1)}% · 하루 ${p.nutrition.kcal}kcal · 단백질 ${p.nutrition.proteinG}g${p.fit.ok ? '' : `  (흐리게: ${p.fit.reason})`}`);
    // 카드 숫자 = 그 카드를 프로필에 넣었을 때 식단 탭 숫자
    const prof = profileFromAnalysis(core, { allergy: '', focus: sc.focus } as UserProfile, p.strategy);
    const st = calcBodyStats(prof, []);
    if (!st || st.kcal !== p.nutrition.kcal || st.protein !== p.nutrition.proteinG) {
      bad++; console.log(`    ✗ 식단 탭 ${st?.kcal}kcal · ${st?.protein}g ≠ 카드`);
    }
    if (p.fit.ok === false && p.recommended) { bad++; console.log('    ✗ 추천 카드가 흐리게'); }
    // 감량 카드가 끝에서 체지방이 다시 오르면 안 된다(10/31 7-10)
    if (p.strategy.startsWith('cut') && p.track.slice(0, p.months + 1).some((pt, i, a) => i > 0 && pt.bfPct > a[i - 1].bfPct + 0.05)) {
      bad++; console.log('    ✗ 감량 중 체지방 재상승');
    }
  }
  const prof = profileFromAnalysis(core, { allergy: '', focus: sc.focus } as UserProfile, rec.strategy);
  if (sc.focus && !prof.focus) { bad++; console.log('  ✗ 신경 쓰이는 부위가 프로필에서 빠짐'); }
  const plan = buildLocalPlan(prof);
  console.log(`  루틴: ${plan.planReason}`);
  for (const d of plan.days) {
    console.log(`    ${d.name}: ${d.ids.map((id) => { const e = exById(id)!; return `${e.n}(${rxText(prescription(e, sc.input.level as 1 | 2 | 3))})`; }).join(' → ')}`);
  }
}
console.log(`\n문제 ${bad}건`);
process.exit(bad ? 1 : 0);
