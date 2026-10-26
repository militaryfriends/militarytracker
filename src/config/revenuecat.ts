/**
 * RevenueCat 공개 SDK 키 — 대시보드 Project settings › API keys 의 "Public app-specific" 키.
 * 공개 값이라 커밋해도 된다(비밀 키 sk_… 는 절대 여기에 넣지 않는다 — 서버의 serverConfig/revenuecat).
 * 키를 넣고 코드 푸시하면 구독 화면의 가격표 · 구매 · 복원이 열린다(빈 문자열이면 숨김).
 *
 * 대시보드 설정 (같은 이름이어야 한다):
 *   Entitlement  identifier "pro"
 *   Offering     "default" (current) 에 월간 패키지 하나 — 상품 id mt_pro_monthly (₩9,900)
 */
export const REVENUECAT = {
  ios: '',
  android: '',
  entitlement: 'pro',
} as const;
