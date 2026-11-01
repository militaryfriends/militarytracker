/**
 * 처방(세트 · 반복 · 남길 반복 RIR) — 레벨은 종목이 아니라 강도를 바꾼다(대표 피드백 10/31 3절 원칙 1).
 * 플랜 · 홈 · 세션 · 루틴 화면이 모두 이 값을 쓴다(화면마다 숫자가 다르던 문제).
 *   입문: 세트 −1(최소 2) · RIR 3 — 동작을 익히는 강도
 *   중급: 기본 세트 · RIR 2
 *   상급: 고중량 복합(휴식 120초 이상)은 세트 +1 · RIR 1
 * 반복 범위는 종목 DB 값 그대로(종목 성격에 맞춘 값).
 */
import type { Exercise } from '../data/exercises';

export type Lv = 1 | 2 | 3;

export interface Rx {
  sets: number;
  reps: string;
  rir: number;
  rest: number;
}

export function prescription(e: Exercise, level: Lv = 2): Rx {
  const sets = level === 1 ? Math.max(2, e.s - 1) : level === 3 && e.rest >= 120 ? e.s + 1 : e.s;
  const rir = level === 1 ? 3 : level === 3 ? 1 : 2;
  return { sets, reps: e.r, rir, rest: e.rest };
}

/** "4세트 × 6-10회" — 시간 종목(초)은 '회'를 붙이지 않는다 */
export const repsText = (r: string) => (/[초회]$/.test(r) ? r : `${r}회`);
export const rxText = (rx: Rx) => `${rx.sets}세트 × ${repsText(rx.reps)}`;
/** RIR 을 풀어 쓴 안내 — "마지막 세트도 2회 더 할 수 있을 때 멈추기" */
export const rirText = (rx: Rx) => `세트마다 ${rx.rir}회 정도 여유를 남기는 무게`;
