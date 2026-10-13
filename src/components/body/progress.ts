/**
 * 진행 중인 프로젝트의 "지금" — 홈 카드와 체크인 화면이 같은 계산을 쓴다.
 *
 * 아바타의 "지금 몸"은 체크인과 주간 체중 기록으로만 바뀐다(운동 횟수로는 절대 바뀌지 않는다, 명세 6장).
 * 체중만 있으면 직전 체성분에서 나눠 계산(updateComp)하고, 칸은 히스테리시스로 경계에서 깜빡이지 않게.
 * 체크인은 시작일부터 4주(28일)마다, 7일 늦게까지 받는다.
 */
import { cellWithHysteresis, toCell, updateComp, type BodyComp } from '../../utils/bodyComp';
import { trendWeight } from '../../utils/body';
import type { BodyProject, Checkin, WeightRecord } from '../../types';

export const CHECKIN_EVERY_DAYS = 28;
const DAY = 86_400_000;

export interface ProjectNow {
  /** 시작 후 지난 날 */
  days: number;
  /** n주차 (1부터) */
  week: number;
  /** 다음 체크인까지 남은 날 — 0 이하면 지금 할 때 */
  dueIn: number;
  /** 다음 체크인의 monthIndex (시작 후 몇 개월째) */
  nextMonthIndex: number;
  /** 직전 체성분 (마지막 체크인, 없으면 시작) */
  prevComp: BodyComp;
  prevCell: string;
  /** 지금 칸 — 마지막 체크인 뒤 주간 체중이 있으면 그걸로 */
  nowComp: BodyComp;
  nowCell: string;
  latest: Checkin | null;
}

export function projectNow(p: BodyProject, checkins: readonly Checkin[], weights: readonly WeightRecord[], now = Date.now()): ProjectNow {
  const sex = p.input.sex;
  const days = Math.max(0, Math.floor((now - Date.parse(p.startedAt)) / DAY));
  const latest = checkins[0] ?? null;
  const done = checkins.length;
  const prevComp = latest?.comp ?? p.baseline;
  const prevCell = latest?.cell ?? toCell(sex, p.baseline.bfPct, p.baseline.nffmi);
  const nextMonthIndex = Math.max((latest?.monthIndex ?? 0) + 1, Math.round(days / 30.44));

  // 마지막 체크인(또는 시작) 뒤의 체중 기록만 반영
  const since = latest?.createdAt ?? p.startedAt;
  const after = weights.filter((w) => (w.createdAt ?? `${w.date}T23:59:59`) > since);
  const tw = trendWeight(after as WeightRecord[]);
  const nowComp = tw ? updateComp(prevComp, p.input.heightCm, tw) : prevComp;
  const nowCell = tw ? cellWithHysteresis(sex, nowComp.bfPct, nowComp.nffmi, prevCell) : prevCell;

  return {
    days,
    week: Math.floor(days / 7) + 1,
    dueIn: CHECKIN_EVERY_DAYS * (done + 1) - days,
    nextMonthIndex,
    prevComp,
    prevCell,
    nowComp,
    nowCell,
    latest,
  };
}
