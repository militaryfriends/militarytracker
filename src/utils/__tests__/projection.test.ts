/**
 * 명세 3-6 검산 예시 A~E — 참조 구현(engine.py)으로 돌린 값. TS 구현이 소수 1자리까지 같아야 통과.
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateBodyComp, toCell, roundTo, ENGINE_VERSION, type BodyInput } from '../bodyComp';
import { buildProjects, type GoalSpec, type Level } from '../projection';
import { archetypeById, cellLabel } from '../../data/archetypes';

const r1 = (v: number) => roundTo(v, 1);
const r2 = (v: number) => roundTo(v, 2);

interface Expect {
  bf: number; nffmi: number; cell: string; T: number;
  p1: { months: number; w: number; bf: number; cell: string; reached?: boolean };
  p2: { months: number; w: number; bf: number; cell: string; reached?: boolean; pct?: number };
}

function run(input: BodyInput, level: Level, days: number, goalId: string, e: Expect) {
  const comp = estimateBodyComp(input);
  assert.equal(r1(comp.bfPct), e.bf, 'bf');
  assert.equal(r2(comp.nffmi), e.nffmi, 'nffmi');
  assert.equal(toCell(input.sex, comp.bfPct, comp.nffmi), e.cell, 'cell');
  const a = archetypeById(goalId)!;
  const goal: GoalSpec = { archetypeId: a.id, name: a.name, cell: a.cell, bfPct: a.bfPct, nffmi: a.nffmi };
  const out = buildProjects(
    { sex: input.sex, age: input.age, heightCm: input.heightCm, level, days, start: comp, waistCm: input.waistCm },
    goal, (c) => cellLabel(input.sex, c),
  );
  assert.equal(out.reachedAt, e.T, 'T');
  const [p1, p2] = out.projects;
  for (const [p, x, n] of [[p1, e.p1, 'p1'], [p2, e.p2, 'p2']] as const) {
    assert.equal(p.months, x.months, `${n} months`);
    assert.equal(r1(p.end.weightKg), x.w, `${n} weight`);
    assert.equal(r1(p.end.bfPct), x.bf, `${n} bf`);
    assert.equal(p.end.cell, x.cell, `${n} cell`);
    if (x.reached !== undefined) assert.equal(p.reachesGoal, x.reached, `${n} reached`);
    if ('pct' in x && x.pct !== undefined) assert.equal(Math.round(p.progressPct), x.pct, `${n} pct`);
  }
  return out;
}

test('engine version', () => assert.equal(ENGINE_VERSION, 'body-1.0.0'));

test('표시 반올림은 참조 구현과 같다 (딱 절반이면 짝수 쪽)', () => {
  assert.equal(roundTo(35.25), 35.2);
  assert.equal(roundTo(35.35), 35.4);
  assert.equal(roundTo(71.94), 71.9);
  assert.equal(roundTo(-0.25), -0.2);
});

test('A 남 25·175·82·허리92·입문 → 린 머슬', () => {
  const out = run({ sex: 'male', age: 25, heightCm: 175, weightKg: 82, waistCm: 92 }, 1, 4, 'm_lean', {
    bf: 26.0, nffmi: 20.13, cell: 'F5M3', T: 11,
    p1: { months: 6, w: 71.9, bf: 13.5, cell: 'F2M3' },
    p2: { months: 12, w: 74.1, bf: 13.0, cell: 'F2M4', reached: true },
  });
  // 실천 조건 · 허리 참고치 (목업 숫자)
  assert.equal(out.projects[1].nutrition.kcal, 2330);
  assert.equal(out.projects[1].nutrition.proteinG, 164);
  assert.equal(Math.round(out.projects[0].end.waistCm!), 83);
});

test('B 남 22·172·60·허리72·입문 → 린 머슬 (18개월 · 목표의 83%)', () => {
  run({ sex: 'male', age: 22, heightCm: 172, weightKg: 60, waistCm: 72 }, 1, 3, 'm_lean', {
    bf: 16.2, nffmi: 17.48, cell: 'F3M1', T: 21,
    p1: { months: 6, w: 61.8, bf: 13.0, cell: 'F2M2' },
    p2: { months: 18, w: 69.3, bf: 13.3, cell: 'F2M4', reached: false, pct: 83 },
  });
});

test('C 여 27·163·62·허리80·입문 → 탄탄 라인', () => {
  run({ sex: 'female', age: 27, heightCm: 163, weightKg: 62, waistCm: 80 }, 1, 3, 'f_toned', {
    bf: 35.2, nffmi: 16.15, cell: 'F5M3', T: 7,
    p1: { months: 6, w: 54.3, bf: 24.6, cell: 'F3M3' },
    p2: { months: 9, w: 52.7, bf: 22.0, cell: 'F2M3', reached: true },
  });
});

test('D 남 30·178·75·인바디15%·중급 → 선명한 복근 (다음 목표 F1M4)', () => {
  const out = run(
    { sex: 'male', age: 30, heightCm: 178, weightKg: 75, inbody: { bfPct: 15, smmKg: 36, date: '2026-10-01' } }, 2, 4, 'm_abs', {
      bf: 15.0, nffmi: 20.24, cell: 'F2M3', T: 3,
      p1: { months: 3, w: 70.2, bf: 9.2, cell: 'F1M3', reached: true },
      p2: { months: 18, w: 73.4, bf: 9.0, cell: 'F1M4', reached: true },
    });
  assert.equal(out.projects[1].kind, 'next');
  assert.equal(out.projects[0].recommended, true);
});

test('E 남 24·180·95·허리102·입문 → 슬림 탄탄 (근육은 목표보다 많음)', () => {
  run({ sex: 'male', age: 24, heightCm: 180, weightKg: 95, waistCm: 102 }, 1, 3, 'm_slim', {
    bf: 28.7, nffmi: 20.90, cell: 'F5M4', T: 9,
    p1: { months: 6, w: 83.3, bf: 18.7, cell: 'F3M4' },
    p2: { months: 9, w: 78.0, bf: 13.1, cell: 'F2M4', reached: true },
  });
});

// ─── QA 엣지 (명세 9장) ──────────────────────────────────────────────────────
import { cellWithHysteresis, GRID } from '../bodyComp';
import { autoGoalCell, clampGoal, simulate } from '../projection';

test('이미 목표 칸(T=0) → 1번 3개월 완성, 2번 다음 목표(근육 +1칸)', () => {
  const comp = estimateBodyComp({ sex: 'male', age: 28, heightCm: 175, weightKg: 70, inbody: { bfPct: 13, smmKg: 34, date: '2026-10-01' } });
  const a = archetypeById('m_slim')!;
  // 근육도 목표 이상인지 확인용
  assert.ok(comp.nffmi >= a.nffmi - 0.3);
  const out = buildProjects(
    { sex: 'male', age: 28, heightCm: 175, level: 1, days: 3, start: comp },
    { archetypeId: a.id, name: a.name, cell: a.cell, bfPct: a.bfPct, nffmi: a.nffmi }, (c) => cellLabel('male', c),
  );
  assert.equal(out.reachedAt, 0);
  assert.equal(out.projects[0].months, 3);
  assert.equal(out.projects[0].kind, 'complete');
  assert.equal(out.projects[1].kind, 'next');
  assert.equal(out.projects[1].goal.cell, 'F2M3');
});

test('인바디 극단값 3% · 60% 는 받아들이고, 목표는 체지방 하한 아래로 잡지 않는다', () => {
  const lo = estimateBodyComp({ sex: 'male', age: 25, heightCm: 175, weightKg: 70, inbody: { bfPct: 3, smmKg: 38, date: '2026-10-01' } });
  const hi = estimateBodyComp({ sex: 'female', age: 40, heightCm: 160, weightKg: 90, inbody: { bfPct: 60, smmKg: 20, date: '2026-10-01' } });
  assert.equal(lo.bfPct, 3);
  assert.equal(hi.bfPct, 60);
  assert.equal(clampGoal('male', { bfPct: 5, nffmi: 20 }).bfPct, GRID.male.bfMin);
  assert.equal(clampGoal('female', { bfPct: 10, nffmi: 16 }).bfPct, GRID.female.bfMin);
  // 3% 인 사람은 감량 단계가 나오지 않는다
  const s = simulate('male', 175, 1, lo, { bfPct: 13, nffmi: 21.5 });
  assert.ok(s.track.every((p) => p.phase !== 'cut'));
});

test('추천받기(auto) = 현재 칸에서 체지방 한 칸↓ · 근육 한 칸↑', () => {
  const comp = estimateBodyComp({ sex: 'male', age: 25, heightCm: 175, weightKg: 82, waistCm: 92 });
  assert.equal(autoGoalCell('male', comp), 'F4M4');
});

test('칸 경계 ±0.1 에서 왕복해도 아바타 칸이 바뀌지 않는다 (히스테리시스 0.15)', () => {
  // 남성 체지방 F2(13)↔F3(17) 경계 = 15%. 연속 좌표 2.5 ± 0.1 → 14.6% / 15.4%
  const nf = 20;
  assert.equal(cellWithHysteresis('male', 15.4, nf, 'F2M3'), 'F2M3');
  assert.equal(cellWithHysteresis('male', 14.6, nf, 'F3M3'), 'F3M3');
  // 경계를 0.15 넘게(좌표 2.7 = 15.8%) 넘으면 바뀐다
  assert.equal(cellWithHysteresis('male', 15.8, nf, 'F2M3'), 'F3M3');
  assert.equal(cellWithHysteresis('male', 15.4, nf, null), 'F3M3');
});

// ─── 분석 한 번 (O6 가 보여 주는 값) ─────────────────────────────────────────
import { analyzeBody } from '../bodyAnalysis';

test('analyzeBody(A) — 목표까지 체지방 11.6kg 감량 + 제지방 4.2kg 증가, 감량 먼저', () => {
  const a = analyzeBody(
    { sex: 'male', age: 25, heightCm: 175, weightKg: 82, waistCm: 92, level: 1, days: 4, env: 'gym', food: 'convenience' },
    { mode: 'pick', archetypeId: 'm_lean' },
  );
  assert.equal(roundTo(a.gap.fatKg), -11.6);
  assert.equal(roundTo(a.gap.leanKg), 4.2);
  assert.equal(roundTo(a.goal.weightKg), 74.6);
  assert.equal(a.order, '감량 먼저 → 근육 채우기 순서가 가장 빠릅니다');
  assert.equal(a.legacyGoal, 'cut');
  assert.equal(a.projects[1].name, '린 머슬 완성');
});

test('analyzeBody(E) — 근육이 목표보다 많으면 근육은 빼지 않는다', () => {
  const a = analyzeBody(
    { sex: 'male', age: 24, heightCm: 180, weightKg: 95, waistCm: 102, level: 1, days: 3, env: 'gym', food: 'out' },
    { mode: 'pick', archetypeId: 'm_slim' },
  );
  assert.equal(a.gap.muscleAhead, true);
  assert.equal(a.gap.leanKg, 0);
});

test('analyzeBody — 다른 성별 카드나 추천받기는 auto 목표', () => {
  const a = analyzeBody(
    { sex: 'female', age: 27, heightCm: 163, weightKg: 62, waistCm: 80, level: 1, days: 3, env: 'home', food: 'self' },
    { mode: 'pick', archetypeId: 'm_lean' },
  );
  assert.equal(a.goal.mode, 'auto');
  assert.equal(a.goal.cell, 'F4M4');
});

// ─── 체크인 ───────────────────────────────────────────────────────────────
import { updateComp } from '../bodyComp';
import { checkinStatus, recalcFrom } from '../projection';

test('체중만 입력 — 감소분의 85% 가 체지방, 증가분의 29% 가 체지방', () => {
  const start = estimateBodyComp({ sex: 'male', age: 25, heightCm: 175, weightKg: 82, waistCm: 92 });
  const down = updateComp(start, 175, 80);
  assert.equal(roundTo(start.fmKg - down.fmKg, 2), 1.7);
  const up = updateComp(start, 175, 83.4);
  assert.equal(roundTo(up.fmKg - start.fmKg, 2), 0.4);
  // 인바디가 있으면 그 값
  assert.equal(updateComp(start, 175, 80, 20).bfPct, 20);
});

test('상태 판정 ±10%p · 두 번 뒤처지면 재계산이 늦어진 개월 수를 알려준다', () => {
  assert.equal(checkinStatus(50, 38), 'ahead');
  assert.equal(checkinStatus(40, 38), 'on');
  assert.equal(checkinStatus(20, 38), 'behind');
  // 예시 A 가 2개월 동안 체중이 그대로 → 12개월 예정이 늦어진다
  const start = estimateBodyComp({ sex: 'male', age: 25, heightCm: 175, weightKg: 82, waistCm: 92 });
  const a = archetypeById('m_lean')!;
  const r = recalcFrom('male', 175, 1, start, a, 2, 12);
  assert.ok(r.months !== null && r.months > 12);
  assert.equal(r.delayMonths, r.months! - 12);
});
