/**
 * 구독 알림 — 무료 체험 · 구독이 끝나기 전에 미리 알린다(2026-11-28 대표 지시).
 * 여기는 '언제 · 무슨 말'만 정한다(순수 함수 — 단위 테스트 대상). 실제 예약은 services/reminders.ts.
 *
 * 규칙
 *  · 스토어 구독(ios · android)만. 관리자 지급 · 프로모 · 만료 없는 권한은 부르지 않는다.
 *  · 무료 체험(trial): 끝나기 7 · 2 · 1일 전 낮 12시. 체험 뒤에는 스토어가 구독을 이어 가며 결제한다 — 그 사실과 해지 방법을 말한다.
 *  · 해지 예약(canceled): 끝나기 3 · 1일 전 낮 12시. 그 뒤로는 무료 플랜이라는 것과 기록은 남는다는 것만.
 *  · 구독 중(active) · 결제 확인 중(grace)은 부르지 않는다(grace 는 스토어가 직접 알린다).
 *  · 금액은 쓰지 않는다 — 스토어 · 오퍼마다 달라서 앱이 확실히 아는 값이 아니다.
 *  · 이미 지난 시각은 뺀다(now 기준 1분 뒤부터). 시각은 기기 현지 시간.
 */
import type { Subscription } from '../types';

export interface SubNotice {
  key: string;
  at: Date;
  title: string;
  body: string;
}

export const SUB_NOTICE_HOUR = 12;
const TRIAL_DAYS = [7, 2, 1] as const;
const CANCELED_DAYS = [3, 1] as const;

const when = (d: number) => (d === 1 ? '내일' : d === 7 ? '일주일 뒤' : `${d}일 뒤`);

export function subNotices(sub: Subscription | null | undefined, now: number = Date.now()): SubNotice[] {
  if (!sub || sub.tier !== 'pro' || !sub.expiresAt) return [];
  if (sub.source !== 'ios' && sub.source !== 'android') return [];
  if (sub.status !== 'trial' && sub.status !== 'canceled') return [];
  const end = new Date(sub.expiresAt);
  if (!Number.isFinite(end.getTime()) || end.getTime() <= now) return [];
  const endLabel = `${end.getMonth() + 1}월 ${end.getDate()}일`;
  const trial = sub.status === 'trial';
  const out: SubNotice[] = [];
  for (const d of trial ? TRIAL_DAYS : CANCELED_DAYS) {
    const at = new Date(end);
    at.setDate(at.getDate() - d);
    at.setHours(SUB_NOTICE_HOUR, 0, 0, 0);
    // 알림 시각이 끝나는 시각보다 늦으면(끝나는 날 아침 등) 의미가 없다
    if (at.getTime() <= now + 60_000 || at.getTime() >= end.getTime()) continue;
    out.push(trial
      ? {
        key: `trial-${d}`,
        at,
        title: `무료 체험이 ${when(d)} 끝나요`,
        body: `${endLabel}부터 구독이 이어지고 결제돼요. 원하지 않으면 설정 › 구독 관리에서 해지하세요.`,
      }
      : {
        key: `canceled-${d}`,
        at,
        title: `PRO가 ${when(d)} 끝나요`,
        body: `${endLabel}부터 무료 플랜이에요. 기록은 그대로 남아요.`,
      });
  }
  return out;
}
