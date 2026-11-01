// 자동 복사본 — 직접 고치지 말 것. 원본: src/utils/bodyAnalysis.ts. 고친 뒤 npm run engine:sync
/**
 * 분석 한 번 — 입력(O1·O3·O4) + 목표 선택(O2) → 현재 몸 · 목표 · 24개월 트랙 · 프로젝트 2개.
 * O6 로딩 화면이 단계별로 이 결과를 한 줄씩 보여 주고, 서버(projectStart)가 저장된 입력으로 다시 돌려
 * 클라이언트 값을 믿지 않는다. 결정론적 — 같은 입력이면 같은 결과.
 *
 * functions/src/engine/ 에 같은 내용으로 복사돼 있다 — bodyComp.ts 머리말 참고.
 */
import {
  ENGINE_VERSION, cellCenter, estimateBodyComp, toCell, toCoord,
  type BodyComp, type Coord, type InbodyInput, type Sex,
} from './bodyComp';
import {
  autoGoalCell, buildCards, simulate, clampGoal, goalGap, legacyGoal, legacyGoalOf, orderLine, phaseSpans,
  type CardProject, type GoalSpec, type Level, type MonthPoint,
} from './projection';
import { archetypeById, cellLabel } from './archetypes';
export type { CardProject };

export interface AnalysisInput {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  waistCm?: number;
  inbody?: InbodyInput;
  level: Level;
  /** 주 운동 일수 2~6 */
  days: number;
  env: 'gym' | 'home';
  food: 'convenience' | 'self' | 'family' | 'out';
}

export interface GoalPick {
  /** pick = 카드 선택, auto = "잘 모르겠어요, 추천해주세요" */
  mode: 'pick' | 'auto';
  archetypeId?: string;
}

export interface AnalysisGoal extends GoalSpec {
  mode: 'pick' | 'auto';
  /** 목표 체중 (근육은 최소치) */
  weightKg: number;
}

export interface AnalysisGap {
  /** 목표까지 체지방량 변화(kg) — 음수면 감량 */
  fatKg: number;
  /** 목표까지 제지방량 변화(kg) — 근육 목표는 최소치라 0 이상 */
  leanKg: number;
  /** 지금 근육이 목표보다 많다 — "지금 근육량을 유지하면서 체지방만 줄이면…" */
  muscleAhead: boolean;
}

export interface AnalysisCore {
  engineVersion: string;
  input: AnalysisInput;
  comp: BodyComp;
  coord: Coord;
  cell: string;
  goal: AnalysisGoal;
  gap: AnalysisGap;
  /** "감량 먼저 → 근육 채우기 순서가 가장 빠릅니다" */
  order: string;
  /** 목표(추천 카드)까지의 트랙 */
  track: MonthPoint[];
  reachedAt: number | null;
  /** 카드 4장 — 최대 감량 · 근육 유지 감량 · 린매스업 · 벌크업 (2026-11-01). 추천은 1장 */
  projects: CardProject[];
  /** 기존 profile.goal (calcBodyStats · 플래너가 깨지지 않게) */
  legacyGoal: 'cut' | 'muscle';
}

/** 목표 선택 → 목표 스펙. 카드가 없거나 성별이 다르면 추천(auto)으로 */
export function resolveGoal(input: AnalysisInput, comp: BodyComp, pick: GoalPick): Omit<AnalysisGoal, 'weightKg'> {
  const card = pick.mode === 'pick' && pick.archetypeId ? archetypeById(pick.archetypeId) : undefined;
  if (card && card.sex === input.sex) {
    const g = clampGoal(input.sex, card);
    return { mode: 'pick', archetypeId: card.id, name: card.name, cell: card.cell, ...g };
  }
  const cell = autoGoalCell(input.sex, comp);
  const g = clampGoal(input.sex, cellCenter(input.sex, cell));
  return { mode: 'auto', archetypeId: 'auto', name: cellLabel(input.sex, cell), cell, ...g };
}

/**
 * pick 을 주면 예전처럼 그 목표 카드(명세 예시 · 옛 분석 재현)로 목표 · 차이를 잡는다.
 * pick 이 없으면(지금 온보딩) 목표 = 추천 카드가 실제로 도달하는 몸 — 결과 · 프로젝트 · 식단 숫자가 한 값에서 나온다.
 */
export function analyzeBody(input: AnalysisInput, pick?: GoalPick): AnalysisCore {
  const comp = estimateBodyComp(input);
  const coord = toCoord(input.sex, comp.bfPct, comp.nffmi);
  const cell = toCell(input.sex, comp.bfPct, comp.nffmi);
  const ctx = { sex: input.sex, age: input.age, heightCm: input.heightCm, level: input.level, days: input.days, start: comp, waistCm: input.waistCm };
  const cards = buildCards(ctx);
  const rec = cards.find((c) => c.recommended) ?? cards[0];
  const g = pick ? resolveGoal(input, comp, pick) : { mode: 'auto' as const, ...rec.goal, name: rec.name };
  const gap = goalGap(input.heightCm, comp, g);
  const goal: AnalysisGoal = { ...g, weightKg: pick ? gap.targetWeightKg : rec.end.weightKg };
  // 목표를 직접 고른 경우(옛 흐름)는 그 목표로 가는 트랙 · 순서
  const legacy = pick ? simulate(input.sex, input.heightCm, input.level, comp, goal) : null;
  return {
    engineVersion: ENGINE_VERSION,
    input,
    comp,
    coord,
    cell,
    goal,
    gap: pick
      ? { fatKg: gap.fatKg, leanKg: gap.leanKg, muscleAhead: gap.muscleAhead }
      // 카드 몸까지의 실제 변화(체지방량 · 제지방량) — 도달할 수 없는 증가량이 나오지 않는다
      : {
        fatKg: (rec.end.weightKg * rec.end.bfPct) / 100 - comp.fmKg,
        leanKg: rec.end.weightKg * (1 - rec.end.bfPct / 100) - comp.ffmKg,
        muscleAhead: false,
      },
    order: legacy ? orderLine(phaseSpans(legacy.track, legacy.reachedAt ?? 24)) : orderLine(phaseSpans(rec.track, rec.months)),
    track: legacy ? legacy.track : rec.track,
    reachedAt: legacy ? legacy.reachedAt : rec.reachedAt,
    projects: cards,
    legacyGoal: pick ? legacyGoal(comp, goal) : legacyGoalOf(rec.strategy),
  };
}

/** 저장용 — 프로젝트마다 들고 있는 트랙은 빼고(같은 입력으로 다시 계산된다) 크기를 줄인다 */
export function stripTracks(projects: readonly CardProject[]): Omit<CardProject, 'track'>[] {
  return projects.map(({ track: _t, ...rest }) => rest);
}
