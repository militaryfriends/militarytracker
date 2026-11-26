// 밤사이 전수 점검(2026-11-27) — 남녀 × 나이 × 키 × 체중(BMI) × 허리 × 인바디 × 경력 × 주 일수 × 장소 · 기구 × 목표.
// 계산 · 카드 4장 · 내 목표 · 다음 몸 · 식단 숫자 · 자동 루틴을 전부 돌려 이상한 값을 모은다.
//   npx -y esbuild@0.24.0 scripts/overnight-check.ts --bundle --platform=node --outfile=.cache/overnight.cjs --loader:.json=json && node .cache/overnight.cjs
import { analyzeBody, type AnalysisInput } from '../src/utils/bodyAnalysis';
import { profileFromAnalysis } from '../src/components/body/format';
import { calcBodyStats } from '../src/utils/body';
import { buildLocalPlan } from '../src/utils/planner';
import { kitOf, canDo } from '../src/data/equipment';
import { exById } from '../src/data/exercises';
import { planTarget, buildCards, STRATEGY, KEEP_MONTHS, MIN_CARD_MONTHS } from '../src/utils/projection';
import { GRID, nffmiOf, parseCell } from '../src/utils/bodyComp';
import type { UserProfile } from '../src/types';
import { writeFileSync } from 'node:fs';

type Issue = { kind: string; detail: string; input: string };
const issues: Issue[] = [];
const counts: Record<string, number> = {};
const sample: Record<string, string[]> = {};
function bad(kind: string, detail: string, input: AnalysisInput | string) {
  counts[kind] = (counts[kind] ?? 0) + 1;
  const s = typeof input === 'string' ? input : JSON.stringify(input);
  if (!sample[kind]) sample[kind] = [];
  if (sample[kind].length < 6) sample[kind].push(`${detail} :: ${s}`);
  if (issues.length < 20000) issues.push({ kind, detail, input: s });
}
const fin = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

const SEXES = ['male', 'female'] as const;
const AGES = [14, 18, 25, 40, 60, 75];
const HEIGHTS = { male: [155, 165, 172, 180, 190, 200], female: [145, 152, 160, 168, 176, 185] };
const BMIS = [14, 16, 18.5, 21, 23, 25, 27.5, 30, 33, 37, 42, 48];
const WAIST_R = [null, 0.38, 0.42, 0.46, 0.5, 0.55, 0.62, 0.72, 0.84];
const LEVELS = [1, 2, 3] as const;
const DAYS = [2, 3, 4, 5, 6];
const ENVS: { env: 'gym' | 'home'; equip?: string[] }[] = [
  { env: 'gym' }, { env: 'gym', equip: ['bb', 'db', 'mc', 'cb', 'sm'] }, { env: 'gym', equip: ['db', 'mc'] },
  { env: 'home' }, { env: 'home', equip: [] }, { env: 'home', equip: ['db'] }, { env: 'home', equip: ['band'] },
  { env: 'home', equip: ['bar'] }, { env: 'home', equip: ['db', 'band', 'bar', 'bench'] },
];

let n = 0;
let analyses = 0;
const bfDist: number[] = [];
const cellCount: Record<string, number> = {};
const monthsSeen: Record<string, Record<number, number>> = {};
const t0 = Date.now();

for (const sex of SEXES) {
  const g = GRID[sex];
  for (const age of AGES) for (const h of HEIGHTS[sex]) for (const bmi of BMIS) for (const wr of WAIST_R) for (const level of LEVELS) {
    const w = Math.round(bmi * (h / 100) ** 2 * 10) / 10;
    const input: AnalysisInput = {
      sex, age, heightCm: h, weightKg: w, ...(wr ? { waistCm: Math.round(h * wr) } : {}),
      level, days: 4, env: 'gym', food: 'self',
    };
    let core;
    try {
      core = analyzeBody(input);
    } catch (e) {
      bad('계산 실패(throw)', String(e), input); continue;
    }
    analyses++;
    const c = core.comp;
    if (![c.bfPct, c.fmKg, c.ffmKg, c.nffmi].every(fin)) { bad('체성분 숫자 NaN', JSON.stringify(c), input); continue; }
    bfDist.push(c.bfPct);
    cellCount[`${sex}:${core.cell}`] = (cellCount[`${sex}:${core.cell}`] ?? 0) + 1;
    if (c.bfPct < 3 || c.bfPct > 60) bad('체지방 범위 밖(3~60%)', `${c.bfPct.toFixed(1)}%`, input);
    const lowBf = sex === 'male' ? 8 : 15;
    if (c.bfPct < lowBf && !wr) bad('허리 없이 비현실 저체지방', `${c.bfPct.toFixed(1)}%`, input);
    // 근육 칸: BMI 14 마른 몸이 M4~M5 로 나오면 이상
    const { m, f } = parseCell(core.cell);
    if (bmi <= 18.5 && m >= 4) bad('마른 몸이 근육질 칸(M4+)', `${core.cell} bf ${c.bfPct.toFixed(1)}`, input);
    if (bmi >= 33 && f <= 2) bad('비만 BMI 가 저체지방 칸(F1~2)', `${core.cell} bf ${c.bfPct.toFixed(1)}`, input);
    if (!wr && sex === 'female' && bmi <= 25 && m >= 5) bad('여 · 허리 없음 · 보통 체격이 M5', `${core.cell} bf ${c.bfPct.toFixed(1)} nffmi ${c.nffmi.toFixed(1)}`, input);

    // 카드 4장
    const cards = core.projects;
    if (cards.length !== 4) bad('카드 수 ≠ 4', String(cards.length), input);
    if (cards.filter((p) => p.recommended).length !== 1) bad('추천 카드 수 ≠ 1', String(cards.filter((p) => p.recommended).length), input);
    for (const p of cards) {
      const st = STRATEGY[p.strategy];
      monthsSeen[p.strategy] = monthsSeen[p.strategy] ?? {};
      monthsSeen[p.strategy][p.months] = (monthsSeen[p.strategy][p.months] ?? 0) + 1;
      if (![p.end.weightKg, p.end.bfPct, p.nutrition.kcal, p.nutrition.proteinG, p.firstMonthKg].every(fin)) { bad('카드 숫자 NaN', p.strategy, input); continue; }
      if (p.recommended && !p.fit.ok) bad('추천 카드가 흐리게', p.strategy, input);
      if (st.phase === 'cut') {
        if (p.months < MIN_CARD_MONTHS || p.months > 15) bad('감량 카드 기간 범위 밖', `${p.strategy} ${p.months}`, input);
        if (p.keepMonths !== KEEP_MONTHS || p.cutMonths + p.keepMonths !== p.months) bad('감량+고정 ≠ 전체', `${p.cutMonths}+${p.keepMonths}≠${p.months}`, input);
        if (p.end.weightKg > w + 0.05) bad('감량 카드인데 끝 체중 증가', `${p.strategy} ${w}→${p.end.weightKg.toFixed(1)}`, input);
        if (p.end.bfPct < g.bfMin + 0.5 && c.bfPct >= g.bfMin + 0.5) bad('감량 끝 체지방이 하한 아래', `${p.end.bfPct.toFixed(1)}`, input);
        if (p.firstMonthKg > 0) bad('감량 첫 달 + 표시', `${p.firstMonthKg}`, input);
        const tr = p.track.slice(0, p.months + 1);
        if (tr.some((pt, i) => i > 0 && pt.bfPct > tr[i - 1].bfPct + 0.05)) bad('감량 중 체지방 재상승', p.strategy, input);
        const keep = tr.slice(p.cutMonths);
        if (keep.some((pt) => Math.abs(pt.weightKg - keep[0].weightKg) > 0.3)) bad('고정 기간 체중 변동', p.strategy, input);
        if (p.nutrition.kcal < (sex === 'male' ? 1500 : 1200)) bad('감량 칼로리 하한 밑', `${p.nutrition.kcal}`, input);
        const wk = (-p.firstMonthKg / w) * 100 / 4.345;
        if (wk > 1.25) bad('감량 속도 주 1.25% 초과', `${wk.toFixed(2)}%/주`, input);
      } else {
        if (p.months < MIN_CARD_MONTHS || p.months > 12) bad('증량 카드 기간 범위 밖', `${p.strategy} ${p.months}`, input);
        if (p.end.weightKg < w - 0.05) bad('증량 카드인데 끝 체중 감소', `${p.strategy}`, input);
        if (p.firstMonthKg < 0) bad('증량 첫 달 − 표시', `${p.firstMonthKg}`, input);
        const perMonth = (p.end.weightKg - w) / p.months;
        if (perMonth > 1.6) bad('증량 속도 월 1.6kg 초과', `${perMonth.toFixed(2)}kg/월 ${p.strategy}`, input);
      }
      if (p.nutrition.kcal > 5500) bad('하루 칼로리 5,500 초과', `${p.nutrition.kcal}`, input);
      if (p.nutrition.proteinG > 300) bad('단백질 300g 초과', `${p.nutrition.proteinG}`, input);
      if ((p.how ?? '').length > 18) bad('카드 설명 18자 초과', p.how, input);
      if (!/^F[1-5]M[1-5]$/.test(p.end.cell)) bad('끝 칸 형식 이상', p.end.cell, input);
      // 카드 = 식단 탭
      const prof = profileFromAnalysis(core, { allergy: '' } as UserProfile, p.strategy);
      const bs = calcBodyStats(prof, []);
      if (!bs || bs.kcal !== p.nutrition.kcal || bs.protein !== p.nutrition.proteinG) bad('카드 ≠ 식단 탭 숫자', `${p.strategy} ${bs?.kcal}/${p.nutrition.kcal}`, input);
      // 다음 몸 — 카드 끝 몸에서 다시 계산
      const ew = p.end.weightKg; const ebf = p.end.bfPct; const efm = (ew * ebf) / 100;
      const nextCards = buildCards({ sex, age, heightCm: h, level, days: 4, start: { bfPct: ebf, fmKg: efm, ffmKg: ew - efm, nffmi: nffmiOf(ew - efm, h), src: c.src, accuracy: c.accuracy } });
      // 다음 몸(NextBody): 감량 뒤엔 증량 카드 중 맞는 것, 없으면(아직 체지방이 높으면) 추천 카드 — 그것도 흐리면 문제
      const gainOk = nextCards.filter((x) => STRATEGY[x.strategy].phase === 'gain' && x.fit.ok);
      const nxt = (st.phase === 'cut' && gainOk.length ? gainOk : nextCards.filter((x) => x.fit.ok))[0];
      if (!nxt) bad('다음 몸 후보 없음(전부 흐림)', `${p.strategy} 끝 ${p.end.cell}`, input);
    }

    // 내 목표
    const ctx = { sex, age, heightCm: h, level, days: 4, start: c, waistCm: input.waistCm };
    for (const ask of [{ kg: w - 3 }, { kg: w - 10 }, { kg: w - 25 }, { kg: w + 3 }, { kg: w + 10 }, { months: 3 }, { months: 6 }, { months: 12 }, { kg: w - 10, months: 3 }]) {
      let tp;
      try { tp = planTarget(ctx, ask); } catch (e) { bad('내 목표 계산 실패(throw)', `${JSON.stringify(ask)} ${e}`, input); continue; }
      if (!tp) { if (!('kg' in ask) || Math.abs((ask.kg ?? 0) - w) >= 0.5) bad('내 목표 null', JSON.stringify(ask), input); continue; }
      const cd = tp.card;
      if (![cd.end.weightKg, cd.end.bfPct, cd.nutrition.kcal, tp.reachKg].every(fin)) { bad('내 목표 숫자 NaN', JSON.stringify(ask), input); continue; }
      if (cd.months < MIN_CARD_MONTHS || cd.months > 24) bad('내 목표 기간 범위 밖(6~24)', `${cd.months} ${JSON.stringify(ask)}`, input);
      if (tp.dir === 'cut' && cd.cutMonths + cd.keepMonths !== cd.months) bad('내 목표 감량+고정 ≠ 전체', `${cd.cutMonths}+${cd.keepMonths}≠${cd.months}`, input);
      if (tp.dir === 'cut' && cd.keepMonths < KEEP_MONTHS && cd.months < 24) bad('내 목표 감량인데 고정 3개월 없음', `${cd.how}`, input);
      // 고정 구간은 체중 그대로여야 한다
      if (tp.dir === 'cut') {
        const tr = cd.track.slice(cd.cutMonths, cd.months + 1);
        if (tr.some((pt) => Math.abs(pt.weightKg - tr[0].weightKg) > 0.05)) bad('내 목표 고정 구간 체중 변함', JSON.stringify(ask), input);
      }
      if (tp.dir === 'cut' && cd.end.bfPct < g.bfMin + 0.5 && c.bfPct >= g.bfMin + 0.5) bad('내 목표 감량 끝 체지방이 하한 아래', `${cd.end.bfPct.toFixed(1)}`, input);
      if (tp.dir === 'cut' && 'kg' in ask && !tp.capped && Math.abs(tp.reachKg - (ask.kg ?? 0)) > 0.6) bad('내 목표 도달 체중 ≠ 요청', `${tp.reachKg} vs ${ask.kg}`, input);
      if (tp.capped && !tp.capReason) bad('내 목표 깎았는데 이유 없음', JSON.stringify(ask), input);
      if (cd.name.length > 14) bad('내 목표 이름 14자 초과', cd.name, input);
      if ((cd.how ?? '').length > 18) bad('내 목표 설명 18자 초과', cd.how, input);
      if (tp.dir === 'gain' && 'kg' in ask && !tp.capped && cd.end.weightKg < (ask.kg ?? 0) - 0.6) bad('내 목표 증량 끝 < 요청', `${cd.end.weightKg.toFixed(1)} vs ${ask.kg}`, input);
    }
    n++;
  }
}

// 자동 루틴 — 장소 · 기구 · 주 일수 · 경력 · 목표
let plans = 0;
for (const sex of SEXES) for (const e of ENVS) for (const days of DAYS) for (const level of LEVELS) for (const goal of ['cut', 'muscle'] as const) {
  const prof = {
    sex, age: 25, heightCm: sex === 'male' ? 175 : 162, weight: sex === 'male' ? 72 : 58, level, days, env: e.env, goal,
    ...(e.equip ? { equip: e.equip } : {}), allergy: '',
  } as unknown as UserProfile;
  const tag = `${sex} ${e.env} ${JSON.stringify(e.equip ?? 'legacy')} 주${days} L${level} ${goal}`;
  let plan;
  try { plan = buildLocalPlan(prof, 1); } catch (er) { bad('루틴 생성 실패(throw)', String(er), tag); continue; }
  plans++;
  const kit = kitOf(prof);
  if (plan.days.length !== days) bad('루틴 일수 ≠ 주 일수', `${plan.days.length} vs ${days}`, tag);
  for (const d of plan.days) {
    const ids = d.ids;
    if (ids.length < 3) bad('하루 종목 3개 미만', `${d.name} ${ids.length}`, tag);
    if (new Set(ids).size !== ids.length) bad('같은 날 종목 중복', d.name, tag);
    for (const id of ids) {
      if (!exById(id)) bad('없는 종목 id', id, tag);
      else if (!canDo(id, kit)) bad('없는 기구 종목이 루틴에', `${id}`, tag);
    }
  }
}

const out = {
  ranAt: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000),
  analysisCombos: analyses, plans, issueKinds: counts, sample, monthsSeen,
  bf: { min: Math.min(...bfDist), max: Math.max(...bfDist) }, cells: cellCount,
};
writeFileSync('.cache/overnight-result.json', JSON.stringify(out, null, 2));
console.log(`조합 ${analyses}개 계산 · 루틴 ${plans}개 · ${out.seconds}초`);
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`✗ ${k}: ${v}건`);
  for (const s of sample[k]) console.log(`    ${s.slice(0, 260)}`);
}
console.log('기간 분포', JSON.stringify(monthsSeen));
