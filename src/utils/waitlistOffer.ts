/**
 * 대기자 혜택 — 무료 자격(sub.waitlist === 'eligible')을 스토어 혜택으로 바꾸는 이름표.
 *
 * 2026-11-28 대표 결정: 대기자도 결제 수단을 등록해야 무료 기간이 시작된다
 * (스토어 결제창 — 끝나면 월 구독으로 자동 결제, 그 전에 언제든 해지).
 *  · iOS: 서버가 계정에 묶어 준 App Store 오퍼 코드(functions/src/offerCodes.ts)
 *  · Android: Play Console 개발자 지정 혜택 — 태그 OFFER_TAG(+ rc-ignore-offer)
 * 서버 사본: functions/src/offerPure.ts (offerOf). 고칠 때 둘 다 고칠 것.
 */
import type { Subscription } from '../types';

export type WaitlistOffer = 'm3' | 'm1';

/** 명단 일수 → 스토어 혜택(스토어에는 정해진 길이만 있어 3개월 · 1개월 두 가지) */
export const offerOf = (days: number | undefined | null): WaitlistOffer => ((Number(days) || 90) >= 60 ? 'm3' : 'm1');

export const OFFER_LABEL: Record<WaitlistOffer, string> = { m3: '3개월', m1: '1개월' };

/** Play Console 개발자 지정 혜택의 태그 — 콘솔에서 글자 그대로 단다 */
export const OFFER_TAG: Record<WaitlistOffer, string> = { m3: 'waitlist-3m', m1: 'waitlist-1m' };
export const WAITLIST_TAGS: readonly string[] = [OFFER_TAG.m3, OFFER_TAG.m1];

/** ⚠️ 임시 브랜치(claude/tmp-waitlist-preview) 전용 — 미리보기 화면 확인용. 주소의 ?mockWaitlist=m3|m1 · mockStore=1 · mockRedeem=1 · mockAlert=1 */
const q = (k: string): string | null => {
  try {
    return typeof window !== 'undefined' && window.location ? new URLSearchParams(window.location.search).get(k) : null;
  } catch {
    return null;
  }
};
export const mockWaitlist = (): WaitlistOffer | null => {
  const m = q('mockWaitlist');
  return m === 'm3' || m === 'm1' ? m : null;
};
export const mockFlag = (k: 'mockStore' | 'mockRedeem' | 'mockAlert'): boolean => q(k) === '1';

/** 무료 자격이 있고 아직 시작 전이면 그 혜택, 아니면 null */
export const waitlistOffer = (sub: Subscription | null | undefined): WaitlistOffer | null =>
  mockWaitlist() ?? (sub?.waitlist === 'eligible' ? offerOf(sub.waitlistDays) : null);

/**
 * 관리자 화면 미리 세기 — App Store Connect 에서 내려받은 일회용 코드 목록(CSV · 줄바꿈 · 쉼표) → 코드만, 중복 없이.
 * 코드는 대문자 · 숫자 8~64자이고 대문자가 하나는 있다(머리글 · 숫자만인 칸은 빠진다).
 * 서버 사본: functions/src/offerPure.ts parseOfferCodes
 */
export function parseOfferCodes(text: string): string[] {
  const out = new Set<string>();
  for (const tok of String(text ?? '').split(/[\s,;"']+/)) {
    if (/^(?=.*[A-Z])[A-Z0-9]{8,64}$/.test(tok)) out.add(tok);
  }
  return [...out];
}
