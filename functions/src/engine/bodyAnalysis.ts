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
  autoGoalCell, buildProjects, clampGoal, goalGap, legacyGoal, orderLine, phaseSpans,
  type GoalSpec, type Level, type MonthPoint, type Project,
} from './projection';
import { archetypeById, cellLabel } from './archetypes';

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
  /** 목표까지 0~24개월 */
  track: MonthPoint[];
  reachedAt: number | null;
  projects: [Project, Project];
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

export function analyzeBody(input: AnalysisInput, pick: GoalPick): AnalysisCore {
  const comp = estimateBodyComp(input);
  const coord = toCoord(input.sex, comp.bfPct, comp.nffmi);
  const cell = toCell(input.sex, comp.bfPct, comp.nffmi);
  const g = resolveGoal(input, comp, pick);
  const gap = goalGap(input.heightCm, comp, g);
  const goal: AnalysisGoal = { ...g, weightKg: gap.targetWeightKg };
  const built = buildProjects(
    { sex: input.sex, age: input.age, heightCm: input.heightCm, level: input.level, days: input.days, start: comp, waistCm: input.waistCm },
    goal,
    (c) => cellLabel(input.sex, c),
  );
  const longest = Math.max(...built.projects.map((p) => p.months));
  return {
    engineVersion: ENGINE_VERSION,
    input,
    comp,
    coord,
    cell,
    goal,
    gap: { fatKg: gap.fatKg, leanKg: gap.leanKg, muscleAhead: gap.muscleAhead },
    order: orderLine(phaseSpans(built.track, Math.max(longest, built.reachedAt ?? 0))),
    track: built.track,
    reachedAt: built.reachedAt,
    projects: built.projects,
    legacyGoal: legacyGoal(comp, goal),
  };
}

/** 저장용 — 프로젝트마다 들고 있는 트랙은 빼고(같은 입력으로 다시 계산된다) 크기를 줄인다 */
export function stripTracks(projects: readonly Project[]): Omit<Project, 'track'>[] {
  return projects.map(({ track: _t, ...rest }) => rest);
}
