/**
 * 내 변화 프로젝트 화면의 숫자 표기 — 반올림은 표시할 때만(엔진은 반올림하지 않은 값을 들고 있다).
 * 반올림 규칙은 엔진의 roundTo(검산표와 같은 "딱 절반이면 짝수 쪽").
 */
import { roundTo } from '../../utils/bodyComp';
import { legacyGoal, muscleLabel, type Nutrition, type Phase } from '../../utils/projection';
import type { BodyAnalysis, StoredProject, UserProfile } from '../../types';
import type { AnalysisInput } from '../../utils/bodyAnalysis';

/** 82 → '82', 71.94 → '71.9' */
export const kg = (v: number): string => {
  const r = roundTo(v, 1);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};
/** 소수 1자리 고정 — 프로젝트 카드 */
export const pct1 = (v: number): string => roundTo(v, 1).toFixed(1);
/** 정수 — "체지방 26%" */
export const pct0 = (v: number): string => String(roundTo(v, 0));
/** 부호 붙인 kg — '−11.6kg' (진짜 마이너스 기호) */
export const signedKg = (v: number): string => `${v < 0 ? '−' : '+'}${kg(Math.abs(v))}kg`;

export const kcal = (v: number): string => `${Math.round(v).toLocaleString('ko-KR')}kcal`;

export const PHASE_LABEL: Record<Phase, string> = { cut: '감량', gain: '린벌크', keep: '유지' };

/** "목표 체형 도달" · "목표 체형 거의 도달 (83%)" · "목표의 70% 지점" — 다음 목표 프로젝트는 "다음 목표…" */
export function reachLine(p: StoredProject): string {
  const who = p.kind === 'next' ? '다음 목표' : '목표 체형';
  if (p.reachesGoal) return `${who} 도달`;
  const n = Math.round(p.progressPct);
  // 아바타 칸은 목표 칸에 들어왔지만 도달 판정 전 — 숫자를 함께 쓴다
  if (p.end.cell === p.goal.cell) return `${who} 거의 도달 (${n}%)`;
  return `${p.kind === 'next' ? '다음 목표' : '목표'}의 ${n}% 지점`;
}

/** 실천 조건 한 줄 — "주 4회 · 하루 2,330kcal · 단백질 164g" */
export const practiceLine = (n: Nutrition, days: number): string =>
  `주 ${days}회 · 하루 ${kcal(n.kcal)} · 단백질 ${n.proteinG}g`;

export const muscleOf = (cell: string): string => muscleLabel(cell);

/** 분석 → 저장할 프로필. 화면 밖 값(알레르기)은 base 에서, profile.goal 은 엔진이 정한다(cut / muscle) */
export function profileFromAnalysis(a: Pick<BodyAnalysis, 'input' | 'goal' | 'comp'>, base?: UserProfile | null): UserProfile {
  const i: AnalysisInput = a.input;
  return {
    sex: i.sex,
    age: String(i.age),
    height: String(i.heightCm),
    weight: String(i.weightKg),
    goal: legacyGoal(a.comp, a.goal),
    env: i.env,
    days: i.days as UserProfile['days'],
    level: i.level,
    food: i.food,
    allergy: base?.allergy ?? '',
    ...(i.waistCm ? { waistCm: i.waistCm } : {}),
    ...(a.goal.mode === 'pick' ? { goalArchetypeId: a.goal.archetypeId } : {}),
  };
}
