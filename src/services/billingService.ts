/**
 * 구독 결제 어댑터.
 *
 * ── 지금 동작하는 것 ────────────────────────────────────────────────────
 *   startTrial()    무료 체험 시작 (서버가 계정당 1회만 허용)
 *   redeemPromo()   프로모션 코드 등록
 *   refreshSub()    서버가 보는 구독 상태를 다시 받아온다
 *
 * ── 스토어 결제를 붙일 자리 ─────────────────────────────────────────────
 *   purchase() / restore() 한 곳만 갈아 끼우면 된다.
 *   iOS·Android 의 디지털 구독은 반드시 인앱결제를 써야 하므로
 *   (Apple 3.1.1 / Google Play 결제 정책) 외부 결제 링크를 넣으면 심사에서 막힌다.
 *   RevenueCat 또는 expo-iap 을 붙인 뒤,
 *   구매 영수증을 subApplyReceipt 콜러블로 넘겨 서버가 검증·기록하게 한다.
 *   클라이언트가 users/{uid}.sub 를 직접 쓰는 길은 보안 규칙이 막아 두었다.
 */
import { Linking, Platform } from 'react-native';
import { httpsCallable, FunctionsError } from 'firebase/functions';
import { functions } from './firebase';
import { refreshIdToken } from './authService';
import type { Subscription } from '../types';
import { isProSub, normalizeSub } from '../utils/subscription';
import { PRODUCTS, SubProduct } from '../config/entitlements';
import { auth } from './firebase';
import {
  storeIapReady, loadPackages, buyPackage, restoreStore, buyWaitlistOffer, syncStorePurchases, presentRedeemSheet, StorePackage,
} from './storeIap';
import { OFFER_TAG, offerOf } from '../utils/waitlistOffer';

export class BillingUnavailable extends Error {}
export class PromoError extends Error {}
/** 서버가 이메일 인증을 요구했다 — 화면은 "인증 메일 다시 보내기" 를 띄운다 */
export class EmailUnverified extends Error {}

/**
 * 결제 SDK(RevenueCat) 키가 들어 있으면 true (src/config/revenuecat.ts).
 * false 인 동안 구독 화면은 가격표·구매·복원을 숨긴다 — 동작하지 않는 결제 UI 는 심사 거절 사유다(Apple 2.1).
 * 앱 안에 자체 코드 입력 칸은 두지 않는다(Apple 3.1.1) — 코드 · 대기자 휴대폰 번호는 웹에서만.
 */
export const STORE_BILLING_READY = storeIapReady();

const uidOrThrow = (): string => {
  const u = auth.currentUser?.uid;
  if (!u) throw new BillingUnavailable('로그인이 필요합니다.');
  return u;
};

let packages: StorePackage[] = [];

const msg = (e: unknown, fallback: string): string => {
  const m = (e as FunctionsError)?.message;
  return typeof m === 'string' && m.trim() ? m : fallback;
};

/** 스토어에서 받아온 상품 목록(가격은 스토어 값). 결제 SDK 가 없거나 못 받으면 기본값 */
export async function getOfferings(): Promise<SubProduct[]> {
  if (!canPurchase()) return [...PRODUCTS];
  try {
    packages = await loadPackages(uidOrThrow());
  } catch (e) {
    console.warn('[billing] offerings', e);
    return [...PRODUCTS];
  }
  if (!packages.length) return [...PRODUCTS];
  return PRODUCTS.map((p) => {
    const hit = packages.find((k) => k.productId === p.id || k.productId.startsWith(`${p.id}:`));
    return hit ? { ...p, price: hit.price, trial: hit.trial } : p;
  });
}

/** 서버가 RevenueCat 에 직접 확인해 sub 를 기록한다 */
async function applyStore(): Promise<Subscription | null> {
  try {
    const call = httpsCallable(functions, 'subApplyReceipt', { timeout: 30_000 });
    const res = await call({ platform: Platform.OS });
    return normalizeSub((res.data as { sub?: unknown })?.sub);
  } catch (e) {
    throw new BillingUnavailable(msg(e, '구독 정보를 확인하지 못했습니다. 잠시 후 구매 복원을 눌러주세요.'));
  }
}

/** 서버가 보는 현재 구독 상태. claim: 대기자 명단(가입 이메일)도 확인한다 */
export async function refreshSub(opts?: { claim?: boolean }): Promise<Subscription | null> {
  try {
    const call = httpsCallable(functions, 'subStatus', { timeout: 15_000 });
    const res = await call(opts?.claim ? { claim: true } : {});
    return normalizeSub((res.data as { sub?: unknown })?.sub);
  } catch {
    // 함수 미배포·오프라인 — 기존 상태를 유지한다
    return null;
  }
}

/** 무료 체험 시작. 계정당 1회 + 이메일 인증, 서버에서 판정한다. */
export async function startTrial(): Promise<Subscription> {
  // 방금 인증을 마쳤어도 email_verified 클레임은 새 토큰에만 실린다
  await refreshIdToken();
  try {
    const call = httpsCallable(functions, 'subStartTrial', { timeout: 20_000 });
    const res = await call({});
    return normalizeSub((res.data as { sub?: unknown })?.sub);
  } catch (e) {
    const d = (e as FunctionsError)?.details as { reason?: string } | undefined;
    if (d?.reason === 'email_unverified') {
      throw new EmailUnverified(msg(e, '이메일 인증 후 무료 체험을 시작할 수 있습니다.'));
    }
    throw new PromoError(msg(e, '체험을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.'));
  }
}

/** 프로모션 코드 등록 */
export async function redeemPromo(code: string): Promise<Subscription> {
  const clean = code.trim().toUpperCase();
  if (!clean) throw new PromoError('코드를 입력해주세요.');
  try {
    const call = httpsCallable(functions, 'subRedeemPromo', { timeout: 20_000 });
    const res = await call({ code: clean });
    return normalizeSub((res.data as { sub?: unknown })?.sub);
  } catch (e) {
    throw new PromoError(msg(e, '코드를 확인하지 못했습니다.'));
  }
}

/** 스토어 결제가 이 기기에서 가능한가 */
export function canPurchase(): boolean {
  // 웹에서는 인앱결제가 없다. 구독은 앱에서만.
  if (Platform.OS === 'web') return false;
  return STORE_BILLING_READY;
}

export async function purchase(productId: string): Promise<Subscription | null> {
  if (!canPurchase()) {
    throw new BillingUnavailable(
      Platform.OS === 'web'
        ? '구독은 앱에서만 결제할 수 있습니다. iOS·Android 앱에서 진행해주세요.'
        : '스토어 결제가 아직 연결되지 않았습니다. 지금은 무료 체험으로 이용할 수 있습니다.'
    );
  }
  const uid = uidOrThrow();
  if (!packages.length) packages = await loadPackages(uid);
  const pkg = packages.find((k) => k.productId === productId || k.productId.startsWith(`${productId}:`)) ?? packages[0];
  if (!pkg) throw new BillingUnavailable('구독 상품을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
  let r: 'done' | 'cancelled';
  try {
    r = await buyPackage(uid, pkg);
  } catch (e) {
    throw new BillingUnavailable(msg(e, '결제를 완료하지 못했습니다.'));
  }
  if (r === 'cancelled') return null;
  return applyStore();
}

export async function restore(): Promise<Subscription | null> {
  if (!canPurchase()) {
    // 결제 SDK 가 없어도 서버 기록(코드·관리자 지급)은 되살릴 수 있다
    return refreshSub();
  }
  try {
    await restoreStore(uidOrThrow());
  } catch (e) {
    throw new BillingUnavailable(msg(e, '스토어에서 구매 내역을 불러오지 못했습니다.'));
  }
  return applyStore();
}

// ─── 대기자 무료 시작 ──────────────────────────────────────────────────────
/**
 * 2026-11-28 대표 결정: 대기자도 결제 수단을 등록해야 무료 기간(3개월 · 1개월)이 시작된다.
 * 등록 · 확인은 스토어 결제창이 하고, 무료 기간이 끝나면 월 구독으로 자동 결제, 그 전에 언제든 해지할 수 있다.
 *  · Android: 개발자 지정 혜택(태그 waitlist-3m · waitlist-1m)으로 결제창 → 끝나면 서버에 기록 → done
 *  · iOS: 서버가 이 계정에 묶어 준 App Store 오퍼 코드로 코드 사용 화면을 연다 → redirected
 *         (앱으로 돌아오면 구독 화면이 finishWaitlistRedeem() 으로 확인한다)
 */
export type WaitlistStart =
  | { kind: 'done'; sub: Subscription }
  | { kind: 'cancelled' }
  | { kind: 'redirected'; code: string };

const WAITLIST_NOT_READY = '대기자 혜택을 준비하고 있습니다. 잠시 후 다시 시도해주세요.';

export async function startWaitlistOffer(sub: Subscription): Promise<WaitlistStart> {
  if (!canPurchase()) {
    throw new BillingUnavailable(
      Platform.OS === 'web'
        ? '대기자 혜택은 앱에서 시작할 수 있습니다. iOS·Android 앱의 구독 화면에서 진행해주세요.'
        : '스토어 결제가 아직 연결되지 않았습니다.'
    );
  }
  if (sub.waitlist !== 'eligible') throw new BillingUnavailable('대기자 혜택 대상이 아닙니다.');
  const uid = uidOrThrow();
  if (Platform.OS === 'android') {
    let r: 'done' | 'cancelled' | 'missing';
    try {
      r = await buyWaitlistOffer(uid, PRODUCTS[0].id, OFFER_TAG[offerOf(sub.waitlistDays)]);
    } catch (e) {
      throw new BillingUnavailable(msg(e, '결제를 완료하지 못했습니다.'));
    }
    if (r === 'missing') throw new BillingUnavailable(WAITLIST_NOT_READY);
    if (r === 'cancelled') return { kind: 'cancelled' };
    const next = await applyStore();
    if (!next) throw new BillingUnavailable('구독 정보를 확인하지 못했습니다. 잠시 후 구매 복원을 눌러주세요.');
    return { kind: 'done', sub: next };
  }
  // iOS — 코드는 서버가 고른다(앱이 아무 코드나 고를 수 없게)
  let code = '';
  let url = '';
  try {
    const call = httpsCallable(functions, 'subStatus', { timeout: 20_000 });
    const res = await call({ offerCode: true });
    const oc = (res.data as { offerCode?: { code?: string; url?: string } })?.offerCode;
    code = String(oc?.code ?? '');
    url = String(oc?.url ?? '');
  } catch (e) {
    throw new BillingUnavailable(msg(e, WAITLIST_NOT_READY));
  }
  if (!code || !url) throw new BillingUnavailable(WAITLIST_NOT_READY);
  await Linking.openURL(url);
  return { kind: 'redirected', code };
}

/** iOS — App Store 에서 코드를 쓰고 돌아왔을 때. 구독이 생겼으면 서버 기록까지 마친 sub, 아직이면 null */
export async function finishWaitlistRedeem(): Promise<Subscription | null> {
  if (!canPurchase()) return null;
  try {
    await syncStorePurchases(uidOrThrow());
  } catch {
    /* 아직 기기에 거래가 안 왔을 수 있다 — 서버 확인은 한다 */
  }
  const next = await applyStore();
  return next && isProSub(next) ? next : null;
}

/** iOS — 코드 사용 화면이 안 열렸을 때, 애플의 코드 입력 시트에 직접 넣는 예비 길 */
export async function openRedeemSheet(): Promise<void> {
  if (Platform.OS !== 'ios' || !canPurchase()) return;
  await presentRedeemSheet(uidOrThrow());
}

/** 기기의 구독 관리(해지) 화면 — 앱 안에서 해지할 수는 없고 스토어로 보낸다 */
export function manageSubscriptionUrl(source: Subscription['source'], productId?: string | null): string | null {
  if (source === 'ios') return 'https://apps.apple.com/account/subscriptions';
  if (source === 'android') {
    const sku = (productId ?? 'mt_pro_monthly').split(':')[0];
    return `https://play.google.com/store/account/subscriptions?package=com.militaryfriends.militarytracker&sku=${encodeURIComponent(sku)}`;
  }
  return null;
}
