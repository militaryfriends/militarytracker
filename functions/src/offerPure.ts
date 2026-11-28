/**
 * 대기자 혜택 — 순수 계산(아무것도 불러오지 않는다). 앱 테스트(src/utils/__tests__/waitlistOffer.test.ts)가 이 파일을 직접 읽는다.
 *
 * 2026-11-28 대표 결정: 대기자도 결제 수단을 등록해야 무료 기간이 시작된다(스토어 결제창 — 끝나면 자동 결제, 그 전에 언제든 해지).
 * 앱 쪽 사본: src/utils/waitlistOffer.ts (offerOf). 고칠 때 둘 다 고칠 것.
 */
export type WaitlistOffer = 'm3' | 'm1';

/** 명단 일수 → 스토어 혜택. 스토어에는 정해진 길이만 있어 3개월 · 1개월 두 가지로 묶는다(명단 가져오기는 90 · 30 만 쓴다) */
export const offerOf = (days: number | undefined | null): WaitlistOffer => ((Number(days) || 90) >= 60 ? 'm3' : 'm1');

/** eas.json submit.production.ios.ascAppId */
export const APP_STORE_ID = '6827046995';

/** App Store 코드 사용 화면 — 코드가 채워진 채로 열린다. 결제 수단 확인 · 등록은 애플이 한다 */
export const redeemUrl = (code: string): string =>
  `https://apps.apple.com/redeem?ctx=offercodes&id=${APP_STORE_ID}&code=${encodeURIComponent(code)}`;

/**
 * App Store Connect 에서 내려받은 일회용 코드 목록(CSV · 줄바꿈 · 쉼표 아무거나) → 코드만, 중복 없이.
 * 코드는 대문자 · 숫자 8~64자. 소문자가 섞인 머리글('Offer Code' 등)은 빠진다.
 */
export function parseOfferCodes(raw: unknown): string[] {
  const text = Array.isArray(raw) ? raw.map((v) => String(v ?? '')).join('\n') : String(raw ?? '');
  const out = new Set<string>();
  for (const tok of text.split(/[\s,;"']+/)) {
    if (/^[A-Z0-9]{8,64}$/.test(tok)) out.add(tok);
  }
  return [...out];
}
