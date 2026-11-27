/**
 * 체성분 계산 엔진 (2/2) — 매달 몸이 지도 위 어디로 움직일지, 그리고 프로젝트 2개.
 *
 * 매달 현재 상태를 보고 감량(cut) · 린매스업(gain) · 유지(keep) 중 하나를 고른다.
 * 속도는 근거 범위의 하단 × 보수계수 0.8 — 말한 것보다 빨리 좋아지는 건 괜찮지만, 느리면 신뢰를 잃는다.
 * 숫자는 표시할 때만 반올림한다(계산 중간에 반올림하면 검산 예시와 어긋난다).
 *
 * functions/src/engine/ 에 같은 내용으로 복사돼 있다 — bodyComp.ts 머리말 참고.
 */
import {
  GRID, MUSCLE_LABEL, cellCenter, cellName, nffmiOf, parseCell, targetBody, toCell, toCoord,
  type BodyComp, type Sex,
} from './bodyComp';

export type Level = 1 | 2 | 3;
export type Phase = 'cut' | 'gain' | 'keep';

/** 월 근육 증가 한도 기본값(kg) — 입문/중급/상급, 여성은 절반 */
const GAIN = { male: { 1: 0.9, 2: 0.45, 3: 0.2 }, female: { 1: 0.45, 2: 0.225, 3: 0.1 } } as const;
/** 감량 중 근육 증가 비율 */
const RECOMP = { 1: 0.5, 2: 0.25, 3: 0 } as const;
/** 보수계수 */
const K = 0.8;
/** 감량 속도 — 체중의 0.5%/주 (근거 범위 0.5~1% 의 하단) */
const CUT_RATE = 0.005;
const WEEKS = 4.345;

export interface MonthPoint {
  m: number;
  weightKg: number;
  bfPct: number;
  nffmi: number;
  cell: string;
  phase: Phase;
}

export interface Goal {
  bfPct: number;
  nffmi: number;
}

export interface SimResult {
  /** 0~months 개월, months+1 개 */
  track: MonthPoint[];
  /** 처음으로 도달 판정을 만족한 달 (못 가면 null) */
  reachedAt: number | null;
}

/** 도달 판정: 체지방률 ±1.5%p 이내 그리고 근육이 목표 −0.3 이상 */
export const isReached = (bf: number, nf: number, goal: Goal): boolean =>
  Math.abs(bf - goal.bfPct) <= 1.5 && nf >= goal.nffmi - 0.3;

export function simulate(sex: Sex, heightCm: number, level: Level, start: BodyComp, goal: Goal, months = 24): SimResult {
  const g = GRID[sex];
  let fm = start.fmKg;
  let ffm = start.ffmKg;
  let reachedAt: number | null = null;
  const track: MonthPoint[] = [];
  for (let m = 0; m <= months; m++) {
    const W = fm + ffm;
    const BF = (fm / W) * 100;
    const NF = nffmiOf(ffm, heightCm);
    if (reachedAt === null && isReached(BF, NF, goal)) reachedAt = m;
    // 근육이 많을수록 더 더디게 는다 (base 이하는 1, ceil 에서 0)
    const dim = NF <= g.base ? 1 : Math.max(0, (g.ceil - NF) / (g.ceil - g.base));
    const gain = GAIN[sex][level] * K * dim;
    let dF = 0;
    let dL = 0;
    let phase: Phase = 'keep';
    if (BF > goal.bfPct + 1.5 || (NF >= goal.nffmi - 0.3 && BF > goal.bfPct + 0.5)) {
      phase = 'cut';
      const dW = -W * CUT_RATE * WEEKS;
      dL = NF < goal.nffmi ? gain * RECOMP[level] : 0;
      dF = dW - dL;
      // 목표 체지방률 아래로는 내려가지 않는다
      const minF = ((goal.bfPct / 100) * (ffm + dL)) / (1 - goal.bfPct / 100);
      if (fm + dF < minF) dF = minF - fm;
    } else if (NF < goal.nffmi - 0.3) {
      phase = 'gain';
      dL = gain;
      dF = 0.4 * gain;
    }
    track.push({ m, weightKg: W, bfPct: BF, nffmi: NF, cell: toCell(sex, BF, NF), phase });
    fm += dF;
    ffm += dL;
  }
  return { track, reachedAt };
}

// ─── 진행률 ────────────────────────────────────────────────────────────────
/**
 * 목표까지 얼마나 왔는지 (0~100). 연속 좌표 기준 유클리드 거리:
 * 1 − (끝 ↔ 목표) ÷ (시작 ↔ 목표). 시작이 이미 목표면 100.
 */
export function progressPct(sex: Sex, from: Goal, to: Goal, goal: Goal): number {
  const a = toCoord(sex, from.bfPct, from.nffmi);
  const b = toCoord(sex, to.bfPct, to.nffmi);
  const t = toCoord(sex, goal.bfPct, goal.nffmi);
  const d0 = Math.hypot(a.f - t.f, a.m - t.m);
  if (d0 < 1e-9) return 100;
  const d1 = Math.hypot(b.f - t.f, b.m - t.m);
  return Math.max(0, Math.min(100, (1 - d1 / d0) * 100));
}

// ─── 단계별 칼로리 ─────────────────────────────────────────────────────────
/** 감량 하한 (src/utils/body.ts 의 KCAL_FLOOR 와 같은 값) */
const KCAL_FLOOR = { male: 1500, female: 1200 } as const;

/** 주 운동 일수 → 활동계수 (src/utils/body.ts activityFactor 와 같은 값) */
export const activityFactorOf = (days: number): number => (days <= 2 ? 1.375 : days <= 4 ? 1.55 : 1.725);

export interface NutritionCtx {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  days: number;
  level: Level;
}

export interface Nutrition {
  phase: Phase;
  /** 10kcal 단위로 반올림 */
  kcal: number;
  proteinG: number;
  tdee: number;
}

/**
 * Mifflin-St Jeor × 활동계수 — 앱의 모든 하루 칼로리(식단 탭 · 내 정보 · 코치 · 프로젝트 카드)가 이 함수 하나에서 나온다.
 * strategy 를 주면 그 카드의 속도: 감량 주 체중의 1% · 0.5%, 증량은 gainSurplus(성별 · 경력에 따른 근육 속도에서 계산).
 * strategy 가 없으면 예전 값(감량 0.5%, 증량 +250/+150) — 명세 예시 A~E 와 기존 프로젝트가 그대로 나오게.
 */
export function phaseNutrition(phase: Phase, c: NutritionCtx, strategy?: Strategy): Nutrition {
  const bmr = 10 * c.weightKg + 6.25 * c.heightCm - 5 * c.age + (c.sex === 'male' ? 5 : -161);
  const tdee = Math.round(bmr * activityFactorOf(c.days));
  let kcal = tdee;
  // 단백질은 체중 × 1.8~2.0 — 단, BMI 27 을 넘는 몸무게는 지방이라 그 위로는 늘리지 않는다(11/27 전수 점검: 155kg → 311g)
  const proteinKg = Math.min(c.weightKg, 27 * (c.heightCm / 100) ** 2);
  let protein = proteinKg * 1.8;
  const st = strategy ? STRATEGY[strategy] : null;
  if (phase === 'cut') {
    kcal = tdee - (c.weightKg * (st?.cutRate ?? CUT_RATE) * 7700) / 7;
    kcal = Math.max(kcal, KCAL_FLOOR[c.sex], Math.round(bmr));
    protein = proteinKg * 2.0;
  } else if (phase === 'gain') {
    kcal = tdee + (strategy && st?.phase === 'gain' ? gainSurplus(c.sex, c.level as Level, strategy) : (c.level === 1 ? 250 : 150));
  }
  return { phase, kcal: Math.round(kcal / 10) * 10, proteinG: Math.round(protein), tdee };
}

/**
 * 칼로리 바닥(기초대사량 · 남 1,500 · 여 1,200)에 걸리면 낼 수 있는 감량 속도(주 체중 비율)는 원하는 속도보다 느리다.
 * 예: 남 30 · 175 · 95kg · 주 3일 — 최대 감량(주 1%)이면 하루 1,566kcal 인데 기초대사량 1,899 에서 막혀
 * 실제 적자는 하루 약 710kcal → 주 0.68%. 카드가 주 1%로 그리면 칼로리와 몸이 안 맞는다(11/27 점검).
 * 몸무게가 줄면 TDEE · 기초대사량이 같이 줄어 비율은 거의 그대로라, 시작 몸의 비율을 끝까지 쓴다.
 */
export function achievableCutRate(c: NutritionCtx, strategy: Strategy): number {
  const want = STRATEGY[strategy].cutRate ?? CUT_RATE;
  const bmr = 10 * c.weightKg + 6.25 * c.heightCm - 5 * c.age + (c.sex === 'male' ? 5 : -161);
  const tdee = Math.round(bmr * activityFactorOf(c.days));
  const floorKcal = Math.max(KCAL_FLOOR[c.sex], Math.round(bmr));
  const can = (Math.max(0, tdee - floorKcal) * 7) / 7700 / c.weightKg;
  return Math.min(want, can);
}

/** 트랙에서 단계가 바뀌는 구간 — "1~6개월 감량, 7~12개월 린매스업" (AI 플랜 입력 · 순서 문구) */
export interface PhaseSpan {
  phase: Phase;
  /** 시작 달(1부터) */
  from: number;
  to: number;
}

export function phaseSpans(track: MonthPoint[], months: number): PhaseSpan[] {
  const spans: PhaseSpan[] = [];
  // track[m].phase = m 개월째 상태에서 다음 한 달 동안 할 일 → (m+1) 번째 달
  for (let m = 0; m < Math.min(months, track.length - 1); m++) {
    const ph = track[m].phase;
    const last = spans[spans.length - 1];
    if (last && last.phase === ph) last.to = m + 1;
    else spans.push({ phase: ph, from: m + 1, to: m + 1 });
  }
  return spans;
}

// ─── 프로젝트 ──────────────────────────────────────────────────────────────
export interface GoalSpec extends Goal {
  /** 'm_lean' 또는 'auto' */
  archetypeId: string;
  name: string;
  cell: string;
}

export interface ProjectEnd {
  weightKg: number;
  bfPct: number;
  nffmi: number;
  cell: string;
  /** 허리 입력한 경우만 — 참고치 */
  waistCm?: number;
}

export type ProjectKind = 'milestone' | 'complete' | 'next';

export interface Project {
  id: string;
  name: string;
  months: number;
  kind: ProjectKind;
  /** 이 프로젝트가 향하는 목표 (next 는 다음 목표) */
  goal: GoalSpec;
  end: ProjectEnd;
  /** 기간 안에 도달 판정을 만족하는지 */
  reachesGoal: boolean;
  /** 목표의 N% 지점 (0~100, 소수 그대로) */
  progressPct: number;
  recommended: boolean;
  /** 첫 달 단계의 하루 칼로리 · 단백질 */
  nutrition: Nutrition;
  phases: PhaseSpan[];
  /** 이 프로젝트 목표로 계산한 트랙(0~24개월) — next 는 따로 계산된다 */
  track: MonthPoint[];
  reachedAt: number | null;
}

export interface ProjectCtx {
  sex: Sex;
  age: number;
  heightCm: number;
  level: Level;
  days: number;
  start: BodyComp;
  waistCm?: number;
}

/** 기간은 3개월 단위로 올림 — 18개월을 넘으면 null */
export const bucketOf = (T: number): number | null => [3, 6, 9, 12, 15, 18].find((b) => b >= T) ?? null;

/** 허리 참고치: 최초 허리 + 0.8cm × 체지방량 변화(kg) */
const waistAt = (ctx: ProjectCtx, pt: MonthPoint): number | undefined =>
  ctx.waistCm ? ctx.waistCm + 0.8 * ((pt.weightKg * pt.bfPct) / 100 - ctx.start.fmKg) : undefined;

const endOf = (ctx: ProjectCtx, pt: MonthPoint): ProjectEnd => {
  const w = waistAt(ctx, pt);
  return { weightKg: pt.weightKg, bfPct: pt.bfPct, nffmi: pt.nffmi, cell: pt.cell, ...(w ? { waistCm: w } : {}) };
};

/** 목표 칸에서 체지방은 그대로, 근육 한 칸 위 — M5 면 없음 */
export function nextGoal(sex: Sex, goal: GoalSpec, nameFor: (cell: string) => string): GoalSpec | null {
  const { f, m } = parseCell(goal.cell);
  if (m >= 5) return null;
  const cell = cellName(f, m + 1);
  const c = cellCenter(sex, cell);
  return { archetypeId: `next:${cell}`, name: nameFor(cell), cell, bfPct: goal.bfPct, nffmi: c.nffmi };
}

export function buildProjects(ctx: ProjectCtx, goal: GoalSpec, nameFor: (cell: string) => string): {
  projects: [Project, Project];
  track: MonthPoint[];
  reachedAt: number | null;
} {
  const sim = simulate(ctx.sex, ctx.heightCm, ctx.level, ctx.start, goal);
  const T = sim.reachedAt;
  const b = T === null ? null : bucketOf(T);
  const startPt = { bfPct: ctx.start.bfPct, nffmi: ctx.start.nffmi };

  const make = (id: string, name: string, months: number, kind: ProjectKind, g: GoalSpec, s: SimResult, recommended: boolean): Project => {
    const pt = s.track[months];
    const first = s.track[0];
    return {
      id, name, months, kind, goal: g,
      end: endOf(ctx, pt),
      reachesGoal: s.reachedAt !== null && s.reachedAt <= months,
      progressPct: s.reachedAt !== null && s.reachedAt <= months ? 100 : progressPct(ctx.sex, startPt, pt, g),
      recommended,
      nutrition: phaseNutrition(first.phase, {
        sex: ctx.sex, age: ctx.age, heightCm: ctx.heightCm, weightKg: first.weightKg, days: ctx.days, level: ctx.level,
      }),
      phases: phaseSpans(s.track, months),
      track: s.track,
      reachedAt: s.reachedAt,
    };
  };

  let projects: [Project, Project];
  if (b === null) {
    // 18개월 안에 못 간다 — 솔직하게 "목표의 N% 지점"
    projects = [
      make('p1', `${goal.name} 1단계`, 6, 'milestone', goal, sim, false),
      make('p2', `${goal.name} 도전`, 18, 'complete', goal, sim, true),
    ];
  } else if (b >= 9) {
    projects = [
      make('p1', `${goal.name} 1단계`, 6, 'milestone', goal, sim, false),
      make('p2', `${goal.name} 완성`, b, 'complete', goal, sim, true),
    ];
  } else if (b === 6) {
    projects = [
      make('p1', `${goal.name} 1단계`, 3, 'milestone', goal, sim, false),
      make('p2', `${goal.name} 완성`, 6, 'complete', goal, sim, true),
    ];
  } else {
    // 3개월 안 또는 이미 도달 — 2번은 다음 목표(같은 체지방, 근육 +1칸)
    const p1 = make('p1', `${goal.name} 완성`, 3, 'complete', goal, sim, true);
    const ng = nextGoal(ctx.sex, goal, nameFor);
    if (ng) {
      const s2 = simulate(ctx.sex, ctx.heightCm, ctx.level, ctx.start, ng);
      const b2 = s2.reachedAt === null ? null : bucketOf(Math.max(s2.reachedAt, 3));
      projects = [p1, make('p2', `${ng.name} 도전`, b2 ?? 18, 'next', ng, s2, false)];
    } else {
      projects = [p1, make('p2', `${goal.name} 유지`, 6, 'next', goal, sim, false)];
    }
  }
  return { projects, track: sim.track, reachedAt: T };
}

// ─── 프로젝트 카드 4장 (2026-11-01, 대표 피드백 10/31 2절) ─────────────────────
// 지금 몸을 계산한 뒤 엔진이 갈 수 있는 몸 4개를 만든다. 카드마다 한 가지 방식(감량 1% · 0.5% · 린매스업 · 벌크업)으로
// 시뮬레이션해 "그 방식으로 몇 개월 뒤 실제로 도달하는 몸"을 보여 준다 — 도달할 수 없는 목표는 만들지 않는다.

export type Strategy = 'cut_fast' | 'cut' | 'leanmass' | 'bulk';
export const STRATEGIES: readonly Strategy[] = ['cut_fast', 'cut', 'leanmass', 'bulk'];

export interface StrategySpec {
  phase: Phase;
  name: string;
  /** 카드 아래 한 줄 — 속도 · 칼로리 */
  how: string;
  /** 감량: 주 체중의 비율 */
  cutRate?: number;
  /** 증량: 근육 1kg 이 붙을 때 같이 붙는 지방 kg — 잉여 칼로리는 여기서 거꾸로 계산한다(gainSurplus) */
  fatRatio?: number;
  /** 증량: 근육 증가 한도 중 실제로 붙는 비율 (잉여가 작을수록 덜 붙는다) */
  leanShare?: number;
  /** 감량 중 근육 증가(재구성) 계수 — 빠른 감량은 절반 */
  recompShare?: number;
}

export const STRATEGY: Record<Strategy, StrategySpec> = {
  cut_fast: { phase: 'cut', name: '최대 감량', how: '주 체중의 약 1% 감량', cutRate: 0.01, recompShare: 0.5 },
  cut: { phase: 'cut', name: '근육 유지 감량', how: '주 체중의 약 0.5% 감량', cutRate: CUT_RATE, recompShare: 1 },
  // 증량은 "현실적인 근육 증가 한도"에서 출발한다(11/7 대표 피드백 — 여성 45kg → 12개월 57.6kg 은 대부분 지방이라 목표 몸이 뱃살처럼 보였다).
  // 근육이 붙는 속도(GAIN: 성별 · 경력) × 지방 비율로 체중 증가를 정하고, 잉여 칼로리도 그 값에서 거꾸로 계산한다.
  leanmass: { phase: 'gain', name: '린매스업', how: '천천히 증량 · 지방 적게', fatRatio: 0.4, leanShare: 0.9 },
  bulk: { phase: 'gain', name: '벌크업', how: '빠르게 증량 · 지방도 붙음', fatRatio: 1.0, leanShare: 1 },
};

/** 증량 잉여 칼로리 중 몸에 저장되는 비율(나머지는 활동 · 열로 소모 — 보수적), 근육 1kg 을 만드는 데 드는 kcal */
const SURPLUS_STORED = 0.5;
const LEAN_KCAL = 4000;
const DAYS_PER_MONTH = 30.44;

/**
 * 증량 카드의 하루 잉여 칼로리 — 한 달에 붙는 근육(GAIN · 성별 · 경력) + 지방(fatRatio)을 만드는 데 드는 kcal 을
 * 저장 비율(SURPLUS_STORED)로 나눈 값. 150~600kcal, 10 단위. 시뮬레이션과 같은 근육 속도라 카드 숫자와 몸이 맞는다.
 */
export function gainSurplus(sex: Sex, level: Level, strategy: Strategy): number {
  const st = STRATEGY[strategy];
  const lean = GAIN[sex][level] * K * (st.leanShare ?? 1);
  const kcalPerMonth = lean * LEAN_KCAL + lean * (st.fatRatio ?? 0.5) * 7700;
  const perDay = kcalPerMonth / DAYS_PER_MONTH / SURPLUS_STORED;
  // 하한: 린매스업 150 · 벌크업 250 — 근육 속도가 느린 몸(여 중급 · 상급, 남 상급)은 둘 다 150 에 걸려
  // '천천히'와 '빠르게' 카드가 같은 칼로리로 보였다(11/27 밤 점검, 여 160/58 중급: 둘 다 2,160kcal)
  const floor = strategy === 'bulk' ? 250 : 150;
  return Math.round(Math.min(600, Math.max(floor, perDay)) / 10) * 10;
}

/** 한 가지 방식으로만 months 개월 — 감량은 stopBf(기본: 체지방 하한 + 1)에 닿으면 멈추고 유지 */
export function simulateStrategy(
  sex: Sex, heightCm: number, level: Level, start: BodyComp, strategy: Strategy, months = 18, stopBf?: number,
  /** 감량 속도(주 체중 비율) — 칼로리 바닥에 걸리면 achievableCutRate 로 낮춘 값. 없으면 방식 기본값 */
  cutRate?: number,
): MonthPoint[] {
  const g = GRID[sex];
  const st = STRATEGY[strategy];
  const floor = Math.max(g.bfMin + 1, stopBf ?? 0);
  let fm = start.fmKg;
  let ffm = start.ffmKg;
  const track: MonthPoint[] = [];
  for (let m = 0; m <= months; m++) {
    const W = fm + ffm;
    const BF = (fm / W) * 100;
    const NF = nffmiOf(ffm, heightCm);
    const dim = NF <= g.base ? 1 : Math.max(0, (g.ceil - NF) / (g.ceil - g.base));
    const gain = GAIN[sex][level] * K * dim;
    let dF = 0;
    let dL = 0;
    let phase: Phase = st.phase;
    if (st.phase === 'cut') {
      if (BF <= floor + 0.05) {
        phase = 'keep';
      } else {
        const dW = -W * (cutRate ?? st.cutRate ?? CUT_RATE) * WEEKS;
        // 감량하면 제지방도 일부 빠진다 — Forbes: 줄어든 체중 중 제지방 몫 = 10.4 / (10.4 + 체지방kg).
        // 근력운동 + 고단백(2.0g/kg)이면 그 절반으로 본다(LEAN_LOSS_SHARE). 입문자의 근육 증가(recomp)와 상쇄된다.
        // 살이 많은 몸일수록 몫이 작고(비만한 몸의 체중은 대부분 지방), 마른 몸일수록 크다(11/27 대표 승인 — 근육 후하게 나오던 문제).
        const recomp = gain * RECOMP[level] * (st.recompShare ?? 1);
        const pLean = LEAN_LOSS_SHARE * (10.4 / (10.4 + fm));
        dL = recomp + pLean * dW;
        dF = dW - dL;
        const minF = ((floor / 100) * (ffm + dL)) / (1 - floor / 100);
        if (fm + dF < minF) {
          // 하한에 닿는 달 — 빠지는 양이 줄면 제지방 손실도 같은 비율로 준다
          const k = dF < 0 ? Math.min(1, Math.max(0, (fm - minF) / -dF)) : 0;
          dL = recomp + pLean * dW * k;
          dF = ((floor / 100) * (ffm + dL)) / (1 - floor / 100) - fm;
        }
      }
    } else {
      dL = gain * (st.leanShare ?? 1);
      dF = dL * (st.fatRatio ?? 0.5);
    }
    track.push({ m, weightKg: W, bfPct: BF, nffmi: NF, cell: toCell(sex, BF, NF), phase });
    fm += dF;
    ffm += dL;
  }
  return track;
}

/** 목표에 처음 닿는 달을 3개월 단위로 올림, 최소 3 · 최대 12 */
const cardMonths = (hit: number | null): number => (hit === null ? 12 : Math.min(12, Math.max(3, Math.ceil(hit / 3) * 3)));
/**
 * 감량이 끝난 뒤 '고정' 기간(2026-11-27 대표 결정) — 감량 직후가 요요가 가장 많이 오는 구간이라
 * 칼로리를 유지 수준으로 천천히 올리며 체중을 붙잡는다. 감량 카드 = 감량 n개월 + 고정 3개월(최소 6개월).
 */
export const KEEP_MONTHS = 3;
/** 모든 카드의 최소 기간 — 증량도 근육 한 단계는 6개월 아래로는 안 보인다 */
export const MIN_CARD_MONTHS = 6;

/** m 개월째 몸에서 멈춘다 — 그 뒤 달은 같은 몸 · 'keep'(고정). 감량 목표에 다 못 가도 정한 달에서 감량을 끝내고 붙잡는다 */
export function freezeAfter(track: MonthPoint[], m: number): MonthPoint[] {
  if (m < 0 || m >= track.length - 1) return track;
  const at = track[m];
  return track.map((pt, i) => (i <= m ? pt : { ...at, m: i, phase: 'keep' as Phase }));
}

export interface CardFit {
  /** 지금 몸에 맞는지 — 아니면 흐리게 + 이유 (숨기지 않는다) */
  ok: boolean;
  reason?: string;
}

/** 지금 칸 → 추천 카드 (남녀 같은 칸 기준) — F4 · F5 최대 감량, F3 근육 유지 감량, F2 · (F1 + M4 이상) 린매스업, F1 + M1~3 벌크업 */
export function recommendedStrategy(sex: Sex, start: BodyComp): Strategy {
  const { f, m } = parseCell(toCell(sex, start.bfPct, start.nffmi));
  if (f >= 5) return 'cut_fast';
  // F4 인데 근육이 적은 몸(M1~M2, 이른바 마른 비만)은 주 1% 감량이면 근손실이 커서 마른 몸으로 끝난다 → 근육 유지 감량
  if (f === 4) return m <= 2 ? 'cut' : 'cut_fast';
  if (f === 3) return 'cut';
  if (f === 2 || m >= 4) return 'leanmass';
  return 'bulk';
}

export function strategyFit(sex: Sex, start: BodyComp, s: Strategy): CardFit {
  const { f, m } = parseCell(toCell(sex, start.bfPct, start.nffmi));
  if (s === 'cut_fast' && f <= 2) return { ok: false, reason: '체지방이 이미 낮아 빠른 감량은 근손실 위험이 커요' };
  // 마른 몸(F2 · 근육 M1~M2)이 더 빼면 더 마른 몸이 된다
  if (s === 'cut' && (f <= 1 || (f === 2 && m <= 2))) return { ok: false, reason: '지금 체지방이 충분히 낮아요 — 근육을 채울 때예요' };
  if (s === 'leanmass' && f >= 4) return { ok: false, reason: '지금은 감량 먼저가 빠릅니다' };
  if (s === 'bulk' && f >= 3) return { ok: false, reason: '지금은 살이 더 붙기 쉬워요. 감량이나 린매스업을 권해요' };
  return { ok: true };
}

export interface CardProject extends Project {
  strategy: Strategy;
  fit: CardFit;
  /** 카드 아래 한 줄 — 감량: "감량 3개월 → 고정 3개월", 증량: "천천히 증량 · 지방 적게" */
  how: string;
  /** 감량 카드만 — 감량 · 고정 개월 수 (증량은 0 · 0) */
  cutMonths: number;
  keepMonths: number;
  /** 첫 달 체중 변화(kg, 감량은 음수) — "첫 달 −2.1kg" */
  firstMonthKg: number;
}

const nutCtxOf = (ctx: ProjectCtx): NutritionCtx => ({
  sex: ctx.sex, age: ctx.age, heightCm: ctx.heightCm, weightKg: ctx.start.fmKg + ctx.start.ffmKg, days: ctx.days, level: ctx.level,
});

/**
 * 카드 4장. 감량 카드의 목표 = F2 칸 가운데(남 13% · 여 22%; 이미 F2 면 F1, F1 이면 하한 + 1) — 닿으면 거기서 멈춘다,
 * 증량 카드의 목표 = 근육 한 단계 위 칸 가운데(M5 면 +0.5). 그 목표에 처음 닿는 달(3개월 단위, 최대 12개월)의 몸이 카드의 예상 몸이다.
 * 감량 카드는 그 뒤에 고정 3개월이 붙고(체중 그대로), 증량 카드는 최소 6개월이다.
 */
export function buildCards(ctx: ProjectCtx, nameFor?: (cell: string) => string): CardProject[] {
  const g = GRID[ctx.sex];
  const cur = parseCell(toCell(ctx.sex, ctx.start.bfPct, ctx.start.nffmi));
  const rec = recommendedStrategy(ctx.sex, ctx.start);
  const cutTarget = cur.f >= 3 ? g.fat[1] : cur.f === 2 ? g.fat[0] : g.bfMin + 1;
  const musTarget = cur.m < 5 ? g.mus[cur.m] : ctx.start.nffmi + 0.5;
  const nctx = nutCtxOf(ctx);
  const rateOf = (s: Strategy) => achievableCutRate(nctx, s);
  // 칼로리 바닥 때문에 최대 감량이 근육 유지 감량보다 빨리 못 빼면 두 카드는 같은 카드다 → 최대 감량을 흐리게, 추천은 근육 유지 감량으로
  // (10% 안쪽 차이는 칼로리 표시가 10kcal 단위라 같은 숫자로 보인다 → 같은 카드로 본다)
  const fastSame = rateOf('cut_fast') <= rateOf('cut') * 1.1 + 1e-9;
  // 칼로리를 더 줄일 여유가 거의 없는 몸(주 0.1% 미만) — 감량 카드 둘 다 의미가 없다
  const noRoom = rateOf('cut') < 0.001;
  const recEff: Strategy = noRoom && STRATEGY[rec].phase === 'cut' ? 'leanmass' : fastSame && rec === 'cut_fast' ? 'cut' : rec;
  return STRATEGIES.map((sId) => {
    const st = STRATEGY[sId];
    const raw = simulateStrategy(ctx.sex, ctx.heightCm, ctx.level, ctx.start, sId, 18, st.phase === 'cut' ? cutTarget : undefined,
      st.phase === 'cut' ? rateOf(sId) : undefined);
    const hitIdx = raw.findIndex((pt) => (st.phase === 'cut' ? pt.bfPct <= Math.max(cutTarget, g.bfMin + 1) + 0.3 : pt.nffmi >= musTarget - 0.05));
    const reach = cardMonths(hitIdx < 0 ? null : hitIdx);
    const isCut = st.phase === 'cut';
    // 감량 카드: 감량 n개월 뒤는 고정(체중 그대로) — 목표 근처에서 조금씩 더 빠지거나, 목표에 못 가 계속 빠지는 일이 없게
    const track = isCut ? freezeAfter(raw, reach) : raw;
    const months = isCut ? reach + KEEP_MONTHS : Math.max(MIN_CARD_MONTHS, reach);
    const pt = track[months];
    const first = track[0];
    const goal: GoalSpec = {
      archetypeId: `card:${sId}`,
      name: nameFor ? nameFor(pt.cell) : st.name,
      cell: pt.cell, bfPct: pt.bfPct, nffmi: pt.nffmi,
    };
    return {
      id: sId,
      strategy: sId,
      name: st.name,
      how: isCut ? `감량 ${reach}개월 → 고정 ${KEEP_MONTHS}개월` : st.how,
      cutMonths: isCut ? reach : 0,
      keepMonths: isCut ? KEEP_MONTHS : 0,
      firstMonthKg: Math.round((track[1].weightKg - first.weightKg) * 10) / 10,
      months,
      kind: 'complete' as ProjectKind,
      goal,
      end: endOf(ctx, pt),
      reachesGoal: true,
      progressPct: 100,
      recommended: sId === recEff,
      fit: isCut && noRoom
        ? { ok: false, reason: '하루 칼로리를 더 줄일 여유가 없어요(기초대사량 아래)' }
        // 뺄 여유가 없는 몸은 '감량 먼저'가 거짓이 된다 — 체중은 두고 근육을 채우는 린매스업이 맞는 카드
        : sId === 'leanmass' && noRoom
          ? { ok: true }
        : sId === 'cut_fast' && fastSame && strategyFit(ctx.sex, ctx.start, sId).ok
          ? { ok: false, reason: '하루 칼로리를 더 줄이면 기초대사량 아래라, 근육 유지 감량과 같은 속도예요' }
          : strategyFit(ctx.sex, ctx.start, sId),
      nutrition: phaseNutrition(st.phase, {
        sex: ctx.sex, age: ctx.age, heightCm: ctx.heightCm, weightKg: first.weightKg, days: ctx.days, level: ctx.level,
      }, sId),
      phases: phaseSpans(track, months),
      track,
      reachedAt: hitIdx < 0 ? null : hitIdx,
    };
  });
}

// ─── 내 목표로 (2026-11-27) ─────────────────────────────────────────────────
/**
 * "10kg 빼고 싶어요" · "결혼식(날짜)까지" — 사용자가 도착점을 정하면 엔진이 현실적인 길을 낸다.
 * 무리한 목표는 깎아서 정직하게 말한다: 감량은 체지방 하한(남 9% · 여 17%) 밑으로, 증량은 24개월 안에 못 가는 무게는 잡지 않는다.
 * 감량은 무게 목표든 날짜 목표든 끝에 고정 3개월이 붙는다(요요 구간 — "결혼식 끝나고 요요"까지 막는다).
 * 증량은 최소 6개월(카드와 같은 규칙). → 어떤 목표도 6개월보다 짧은 프로젝트가 되지 않는다(날짜 칩은 3개월부터).
 */
export interface TargetAsk {
  /** 목표 체중(kg) — 무게 목표 */
  kg?: number;
  /** 남은 개월(1~24) — 날짜 목표. 둘 다 있으면 날짜 안에서 무게까지 */
  months?: number;
}

export interface TargetPlan {
  dir: 'cut' | 'gain' | 'same';
  /** 이 목표에 쓰는 방식(감량은 지금 몸에 맞는 감량 카드 방식, 증량은 린매스업) */
  strategy: Strategy;
  /** 사용자가 원한 체중 (날짜만 고르면 null) */
  askKg: number | null;
  /** 실제로 닿는 체중 */
  reachKg: number;
  /** 원한 만큼 못 가면 true — 이유는 capReason */
  capped: boolean;
  capReason?: string;
  /** 목표 체중에 닿는 달(1~24) — 못 닿으면 null */
  hitMonth: number | null;
  card: CardProject;
}

export const TARGET_MAX_MONTHS = 24;
/** 감량 중 제지방 손실 — Forbes 몫의 절반(근력운동 · 고단백 가정) */
export const LEAN_LOSS_SHARE = 0.5;
/** 감량 n개월 뒤 고정 기간 — 최소 3개월, 감량이 짧으면 합쳐서 6개월이 되게 늘린다("3kg 빼기" = 감량 1개월 → 고정 5개월) */
export const keepFor = (cutM: number): number => Math.max(KEEP_MONTHS, MIN_CARD_MONTHS - cutM);

export function planTarget(ctx: ProjectCtx, ask: TargetAsk): TargetPlan | null {
  const g = GRID[ctx.sex];
  const w0 = ctx.start.fmKg + ctx.start.ffmKg;
  const limitM = ask.months ? Math.max(1, Math.min(TARGET_MAX_MONTHS, Math.round(ask.months))) : TARGET_MAX_MONTHS;
  const askKg = typeof ask.kg === 'number' && ask.kg > 0 ? ask.kg : null;
  const rec = recommendedStrategy(ctx.sex, ctx.start);
  // 방향: 무게를 줬으면 무게로, 날짜만이면 지금 몸의 추천 방향
  const dir: 'cut' | 'gain' | 'same' = askKg !== null
    ? (Math.abs(askKg - w0) < 0.5 ? 'same' : askKg < w0 ? 'cut' : 'gain')
    : (STRATEGY[rec].phase === 'cut' ? 'cut' : 'gain');
  if (dir === 'same') return null;
  // 무게를 정했으면 체지방 하한까지 갈 수 있다. 날짜만 정했으면 '최대 감량' 카드와 같은 목표(F2 칸 가운데, 남 13% · 여 22%)에서 멈춘다
  // — 날짜만으로 하한(남 9%)까지 내려가면 비만 입문자가 6개월 만에 대회 직전 몸이 되는 숫자가 나왔다(11/27 밤 점검)
  const cur = parseCell(toCell(ctx.sex, ctx.start.bfPct, ctx.start.nffmi));
  const cardCut = cur.f >= 3 ? g.fat[1] : cur.f === 2 ? g.fat[0] : g.bfMin + 1;
  const floorBf = askKg !== null ? g.bfMin + 1 : Math.max(g.bfMin + 1, cardCut);
  const nctx = nutCtxOf(ctx);
  const sim = (s: Strategy, stop?: number) => simulateStrategy(ctx.sex, ctx.heightCm, ctx.level, ctx.start, s, TARGET_MAX_MONTHS, stop,
    STRATEGY[s].phase === 'cut' ? achievableCutRate(nctx, s) : undefined);
  let strategy: Strategy = dir === 'cut' ? (STRATEGY[rec].phase === 'cut' ? rec : 'cut') : (rec === 'bulk' ? 'bulk' : 'leanmass');
  // 날짜가 넉넉하면 천천히 — 근육 유지 감량으로도 그날까지 닿으면 그쪽(덜 배고프고 근육이 덜 빠진다, 기간도 날짜를 채운다).
  // 예전엔 '12개월 안에'가 최대 감량으로 8개월 만에 끝났다(11/27)
  if (dir === 'cut' && strategy === 'cut_fast' && ask.months) {
    const slow = sim('cut', floorBf).slice(0, limitM + 1);
    const slowHit = askKg !== null
      ? slow.some((pt, m) => m > 0 && pt.weightKg <= askKg + 0.25)
      : slow.some((pt) => pt.phase === 'keep' || pt.bfPct <= floorBf + 0.3);
    if (slowHit) strategy = 'cut';
  }
  const st = STRATEGY[strategy];
  // 1) 하한까지 가는 전체 트랙 — 무게에 처음 닿는 달을 찾는다
  const full = sim(strategy, dir === 'cut' ? floorBf : undefined);
  const within = full.slice(0, limitM + 1);
  let hit: number | null = null;
  if (askKg !== null) {
    const idx = within.findIndex((pt, m) => m > 0 && (dir === 'cut' ? pt.weightKg <= askKg + 0.25 : pt.weightKg >= askKg - 0.25));
    hit = idx < 0 ? null : idx;
  }
  // 2) 끝 달 · 끝 몸
  let track = full;
  let endM: number;
  let reachM: number;
  if (hit !== null) {
    reachM = hit;
    if (dir === 'cut') {
      // 목표 무게에서 멈추게 그 달 체지방에서 다시 돌린다 → 그 뒤는 고정(체중 그대로)
      // 멈출 체지방 = 그 달의 제지방으로 목표 무게가 되는 체지방 (달 단위로 넘어가 버리지 않게).
      // 감량 중 제지방도 빠지므로(Forbes) 한 번에 안 맞는다 — 멈춘 몸의 제지방으로 몇 번 다시 맞춘다
      let ref = full[hit];
      for (let i = 0; i < 6; i++) {
        const ffmAt = ref.weightKg * (1 - ref.bfPct / 100);
        const stopBf = ((askKg! - ffmAt) / askKg!) * 100;
        track = sim(strategy, Math.max(floorBf, stopBf));
        const k = track.findIndex((p, m) => m > 0 && p.phase === 'keep');
        const stopAt = k > 0 ? k - 1 : TARGET_MAX_MONTHS;
        ref = track[Math.min(stopAt + 1, TARGET_MAX_MONTHS)];
        if (Math.abs(ref.weightKg - askKg!) < 0.05) break;
      }
      // 멈춘 달(처음 고정이 되는 달)이 새 도달 달 — 날짜를 넘기면 날짜에서 자른다
      const k = track.findIndex((p, m) => m > 0 && p.phase === 'keep');
      hit = Math.min(k > 0 ? k : hit, limitM);
      reachM = hit;
    }
    endM = dir === 'cut' ? hit + keepFor(hit) : Math.max(MIN_CARD_MONTHS, ask.months ? limitM : hit);
    if (dir === 'cut') track = freezeAfter(track, hit);
  } else {
    // 못 닿는다 — 날짜 안(또는 24개월)의 가장 가까운 몸. 감량은 하한에 닿는 달 · 날짜 중 먼저 오는 달에서 멈추고 고정
    const kIdx = dir === 'cut' ? within.findIndex((p) => p.phase === 'keep') : -1;
    reachM = kIdx > 0 ? kIdx : limitM;
    if (dir === 'cut') track = freezeAfter(track, reachM);
    endM = dir === 'cut' ? reachM + keepFor(reachM) : Math.max(MIN_CARD_MONTHS, limitM);
  }
  endM = Math.max(1, Math.min(TARGET_MAX_MONTHS, endM));
  const pt = track[endM];
  const reachKg = Math.round(track[Math.min(reachM, endM)].weightKg * 10) / 10;
  const capped = askKg !== null && hit === null;
  let capReason: string | undefined;
  if (capped) {
    const atFloor = dir === 'cut' && within.some((p) => p.phase === 'keep');
    capReason = dir === 'cut'
      ? (atFloor
        ? `건강하게 뺄 수 있는 건 약 ${reachKg}kg(체지방 ${Math.round(floorBf)}%)까지예요`
        : `${limitM}개월 안에 현실적으로 갈 수 있는 건 약 ${reachKg}kg이에요`)
      : `${limitM}개월 안에 근육 위주로 늘릴 수 있는 건 약 ${reachKg}kg이에요`;
  }
  const first = track[0];
  const kRound = (v: number) => Math.round(v * 10) / 10;
  const cutM = dir === 'cut' ? Math.min(endM, reachM) : 0;
  const name = askKg !== null ? `${kRound(capped ? reachKg : askKg)}kg 만들기` : `${limitM}개월 안에`;
  const card: CardProject = {
    id: strategy,
    strategy,
    name,
    how: dir === 'cut'
      ? (endM > cutM ? `감량 ${cutM}개월 → 고정 ${endM - cutM}개월` : `감량 ${cutM}개월`)
      : st.how,
    cutMonths: cutM,
    keepMonths: dir === 'cut' ? Math.max(0, endM - cutM) : 0,
    firstMonthKg: kRound(track[1].weightKg - first.weightKg),
    months: endM,
    kind: 'complete',
    goal: { archetypeId: `target:${strategy}`, name, cell: pt.cell, bfPct: pt.bfPct, nffmi: pt.nffmi },
    end: endOf(ctx, pt),
    reachesGoal: !capped,
    progressPct: 100,
    recommended: false,
    fit: strategyFit(ctx.sex, ctx.start, strategy),
    nutrition: phaseNutrition(st.phase, {
      sex: ctx.sex, age: ctx.age, heightCm: ctx.heightCm, weightKg: first.weightKg, days: ctx.days, level: ctx.level,
    }, strategy),
    phases: phaseSpans(track, endM),
    track,
    reachedAt: hit,
  };
  return { dir, strategy, askKg, reachKg, capped, capReason, hitMonth: hit, card };
}

/** 프로필 목표(카드를 고르기 전 · 습관 경로) → 같은 계산기의 방식 */
export const strategyOfGoal = (goal: 'cut' | 'muscle' | 'habit' | string): Strategy | null =>
  goal === 'cut' ? 'cut' : goal === 'muscle' ? 'leanmass' : null;

/** 카드 방식 → 기존 profile.goal(플래너 · 코치 문구) */
export const legacyGoalOf = (s: Strategy): 'cut' | 'muscle' => (STRATEGY[s].phase === 'cut' ? 'cut' : 'muscle');

// ─── 목표 ──────────────────────────────────────────────────────────────────
/** "잘 모르겠어요" — 현재 칸에서 체지방 한 칸↓, 근육 한 칸↑ */
export function autoGoalCell(sex: Sex, start: BodyComp): string {
  const { f, m } = parseCell(toCell(sex, start.bfPct, start.nffmi));
  return cellName(Math.max(1, f - 1), Math.min(5, m + 1));
}

/** 체지방 하한 아래로는 어떤 목표도 잡지 않는다 */
export const clampGoal = (sex: Sex, g: Goal): Goal => ({ bfPct: Math.max(GRID[sex].bfMin, g.bfPct), nffmi: g.nffmi });

/** 목표까지: 체지방량 · 제지방량 차이 (근육 목표는 최소치 — 지금이 더 많으면 0) */
export function goalGap(heightCm: number, start: BodyComp, goal: Goal): {
  fatKg: number; leanKg: number; targetWeightKg: number; muscleAhead: boolean;
} {
  const t = targetBody(heightCm, goal.bfPct, goal.nffmi, start.ffmKg);
  return {
    fatKg: t.fmKg - start.fmKg,
    leanKg: t.ffmKg - start.ffmKg,
    targetWeightKg: t.weightKg,
    muscleAhead: start.nffmi > goal.nffmi,
  };
}

/** 엔진이 정한 순서 한 줄 — 단계 배열에서 나온다 */
export function orderLine(spans: PhaseSpan[]): string {
  const seq = spans.map((s) => s.phase).filter((p) => p !== 'keep');
  const uniq = seq.filter((p, i) => p !== seq[i - 1]);
  if (!uniq.length) return '지금 몸을 유지하는 게 목표예요';
  if (uniq.length === 1) return uniq[0] === 'cut' ? '감량에 집중하는 게 가장 빠릅니다' : '근육 채우기에 집중하는 게 가장 빠릅니다';
  const word = (p: Phase) => (p === 'cut' ? '감량' : '근육 채우기');
  return `${word(uniq[0])} 먼저 → ${word(uniq[1])} 순서가 가장 빠릅니다`;
}

export const muscleLabel = (cell: string): string => MUSCLE_LABEL[parseCell(cell).m - 1];

/** 프로필 goal(기존 calcBodyStats·플래너용): 현재 체지방률 > 목표 + 1.5%p 면 cut, 아니면 muscle */
export const legacyGoal = (start: BodyComp, goal: Goal): 'cut' | 'muscle' =>
  start.bfPct > goal.bfPct + 1.5 ? 'cut' : 'muscle';

// ─── 체크인 (명세 6-3) ─────────────────────────────────────────────────────
export type CheckinStatus = 'ahead' | 'on' | 'behind';

/** 실측 − 예측 진행률이 ±10%p 안이면 정상 */
export const checkinStatus = (measuredPct: number, expectedPct: number): CheckinStatus =>
  measuredPct - expectedPct > 10 ? 'ahead' : measuredPct - expectedPct < -10 ? 'behind' : 'on';

export const STATUS_TEXT: Record<CheckinStatus, string> = {
  ahead: '예상보다 빨라요',
  on: '계획대로 가고 있어요',
  behind: '예상보다 조금 느려요',
};

/** 저장된 트랙에서 monthIndex 개월째 예측값 (트랙은 offset 개월째부터 시작) */
export function expectedPoint(track: readonly MonthPoint[], offset: number, monthIndex: number): MonthPoint {
  const i = Math.max(0, Math.min(track.length - 1, monthIndex - offset));
  return track[i];
}

/** 카드 방식으로 목표까지 — 감량은 목표 체지방에서 멈추고, 처음 닿는 달이 reachedAt(24개월까지) */
function simulateStrategyTo(sex: Sex, heightCm: number, level: Level, start: BodyComp, strategy: Strategy, goal: Goal): SimResult {
  const cut = STRATEGY[strategy].phase === 'cut';
  const track = simulateStrategy(sex, heightCm, level, start, strategy, 24, cut ? goal.bfPct : undefined);
  const hit = track.findIndex((pt) => (cut ? pt.bfPct <= goal.bfPct + 0.3 : pt.nffmi >= goal.nffmi - 0.05));
  return { track, reachedAt: hit < 0 ? null : hit };
}

/**
 * 두 번 연속 뒤처지면 지금 실측값에서 다시 시뮬레이션 — 완료 예상이 몇 개월 늦어졌는지 알린다(몰래 바꾸지 않는다).
 * months: 시작부터 센 새 완료 예상(18개월 안에 못 가면 null).
 */
export function recalcFrom(
  sex: Sex, heightCm: number, level: Level, now: BodyComp, goal: Goal, monthIndex: number, oldMonths: number,
  /** 카드 방식(2.0) — 있으면 그 속도(감량 1% · 0.5%, 증량 +300 · +500)로 다시 계산한다. 없으면(옛 프로젝트) 옛 모델 */
  strategy?: Strategy,
): { sim: SimResult; months: number | null; delayMonths: number } {
  const sim = strategy ? simulateStrategyTo(sex, heightCm, level, now, strategy, goal) : simulate(sex, heightCm, level, now, goal);
  const months = sim.reachedAt === null ? null : monthIndex + sim.reachedAt;
  return { sim, months, delayMonths: months === null ? 24 + monthIndex - oldMonths : months - oldMonths };
}
