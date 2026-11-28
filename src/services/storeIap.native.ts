/**
 * 스토어 결제 (iOS · Android) — RevenueCat SDK.
 * 결제 자체와 영수증 검증은 RevenueCat 이 하고, 앱은 끝나면 서버 subApplyReceipt 를 불러
 * 서버가 RevenueCat 에 직접 물어 users/{uid}.sub 를 쓰게 한다(앱이 보낸 결과는 믿지 않는다).
 * appUserID = Firebase uid — 기기를 바꿔도 같은 구독.
 */
import { Platform } from 'react-native';
import { REVENUECAT } from '../config/revenuecat';
import { WAITLIST_TAGS } from '../utils/waitlistOffer';

export interface StorePackage { id: string; productId: string; price: string; raw: unknown; /** 무료 체험 기간(예: '1개월') — 없으면 체험 없음 */ trial?: string }

type RC = typeof import('react-native-purchases').default;
let rc: RC | null = null;
let configured = false;
let current: string | null = null;

const apiKey = () => (Platform.OS === 'ios' ? REVENUECAT.ios : Platform.OS === 'android' ? REVENUECAT.android : '');

export const storeIapReady = (): boolean => !!apiKey();

async function ensure(uid: string): Promise<RC> {
  if (!rc) rc = (require('react-native-purchases') as { default: RC }).default;
  if (!configured) {
    rc.configure({ apiKey: apiKey(), appUserID: uid });
    configured = true;
    current = uid;
  } else if (current !== uid) {
    await rc.logIn(uid);
    current = uid;
  }
  return rc;
}

export async function loadPackages(uid: string): Promise<StorePackage[]> {
  if (!storeIapReady()) return [];
  const p = await ensure(uid);
  const off = await p.getOfferings();
  const pkgs = off.current?.availablePackages ?? [];
  // iOS: 무료 체험은 처음 구독하는 사람만 받는다 — 이미 쓴 사람에게 '7일 무료' 를 보여 주면 오해(Apple 3.1.2).
  // 자격이 '받을 수 있음' 일 때만 체험 문구를 띄운다(모름 · 못 받음이면 바로 결제 문구). Android 는 스토어가 자격 있는 사람에게만 체험 옵션을 준다.
  let eligible: Record<string, boolean> | null = null;
  if (Platform.OS === 'ios' && pkgs.length) {
    try {
      const m = await p.checkTrialOrIntroductoryPriceEligibility(pkgs.map((k) => k.product.identifier));
      eligible = Object.fromEntries(Object.entries(m).map(([id, e]) => [id, e.status === p.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE]));
    } catch {
      eligible = {};
    }
  }
  return pkgs.map((k) => ({
    id: k.identifier,
    productId: k.product.identifier,
    price: k.product.priceString,
    raw: k,
    trial: eligible && !eligible[k.product.identifier] ? undefined : trialOf({ ...k.product, defaultOption: normalOption(k.product) }),
  }));
}

type Opt = NonNullable<RcPackage['product']['subscriptionOptions']>[number];
type RcPackage = Parameters<RC['purchasePackage']>[0];
const isWaitlistOpt = (o: { tags?: string[] | null }): boolean => (o.tags ?? []).some((t) => WAITLIST_TAGS.includes(t));

/**
 * Android 일반 구매에 쓸 옵션 — 대기자 전용 혜택(개발자 지정, 3개월 · 1개월 무료)은 빼고 고른다.
 * RevenueCat 은 무료 기간이 가장 긴 옵션을 기본으로 고르므로, 콘솔에서 rc-ignore-offer 태그를 빠뜨리면
 * 일반 구독도 3개월 무료가 된다 — 그 실수가 있어도 그런 일이 없게 여기서 한 번 더 거른다. iOS 는 null(옵션 없음).
 */
function normalOption(product: RcPackage['product']): Opt | null {
  const def = product.defaultOption;
  if (!def || !isWaitlistOpt(def)) return def ?? null;
  const rest = (product.subscriptionOptions ?? []).filter((o) => !isWaitlistOpt(o));
  return rest.find((o) => o.freePhase) ?? rest.find((o) => o.isBasePlan) ?? rest[0] ?? null;
}

const UNIT: Record<string, string> = { DAY: '일', WEEK: '주', MONTH: '개월', YEAR: '년' };
/** '1주' 대신 '7일' — 체험 안내 문구가 일 단위(무료 체험 7일, 10/31 결정) */
const span = (n: number, unit: string) => (unit === 'WEEK' ? `${n * 7}일` : `${n}${UNIT[unit] ?? ''}`);

/** 스토어 상품의 무료 체험 기간 — iOS 는 introPrice(가격 0), Android 는 기본 옵션의 무료 단계 */
function trialOf(p: { introPrice?: { price: number; periodUnit: string; periodNumberOfUnits: number } | null;
  defaultOption?: { freePhase?: { billingPeriod?: { unit: string; value: number } } | null } | null }): string | undefined {
  if (p.introPrice && p.introPrice.price === 0) {
    return span(p.introPrice.periodNumberOfUnits, p.introPrice.periodUnit);
  }
  const f = p.defaultOption?.freePhase?.billingPeriod;
  return f ? span(f.value, f.unit) : undefined;
}

export async function buyPackage(uid: string, pkg: StorePackage): Promise<'done' | 'cancelled'> {
  const p = await ensure(uid);
  const k = pkg.raw as RcPackage;
  try {
    // Android 에서 기본 옵션이 대기자 전용 혜택으로 잡혔으면 일반 옵션을 직접 산다(normalOption)
    const def = k.product.defaultOption;
    const pick = Platform.OS === 'android' && def && isWaitlistOpt(def) ? normalOption(k.product) : null;
    if (pick) await p.purchaseSubscriptionOption(pick);
    else await p.purchasePackage(k);
    return 'done';
  } catch (e) {
    if ((e as { userCancelled?: boolean })?.userCancelled) return 'cancelled';
    throw e;
  }
}

/**
 * Android 대기자 혜택 — 개발자 지정 혜택(태그)으로 스토어 결제창을 연다. 결제 수단 등록 · 확인은 구글이 한다.
 * 콘솔에 그 혜택이 아직 없으면 'missing'(일반 구매로 넘어가지 않는다 — 대기자가 돈을 내거나 7일만 받게 되므로).
 */
export async function buyWaitlistOffer(uid: string, productId: string, tag: string): Promise<'done' | 'cancelled' | 'missing'> {
  if (Platform.OS !== 'android') return 'missing';
  const p = await ensure(uid);
  const off = await p.getOfferings();
  const pkgs = off.current?.availablePackages ?? [];
  const pkg = pkgs.find((k) => k.product.identifier === productId || k.product.identifier.startsWith(`${productId}:`)) ?? pkgs[0];
  const opt = pkg?.product.subscriptionOptions?.find((o) => o.tags.includes(tag));
  if (!opt) return 'missing';
  try {
    await p.purchaseSubscriptionOption(opt);
    return 'done';
  } catch (e) {
    if ((e as { userCancelled?: boolean })?.userCancelled) return 'cancelled';
    throw e;
  }
}

/** iOS — App Store 에서 쓴 오퍼 코드는 앱 밖에서 생긴 구매라, 앱으로 돌아오면 RevenueCat 에 다시 올린다 */
export async function syncStorePurchases(uid: string): Promise<void> {
  const p = await ensure(uid);
  await p.syncPurchasesForResult();
}

/** iOS — 애플의 코드 입력 시트(코드를 직접 넣는 예비 길) */
export async function presentRedeemSheet(uid: string): Promise<void> {
  if (Platform.OS !== 'ios') return;
  const p = await ensure(uid);
  await p.presentCodeRedemptionSheet();
}

export async function restoreStore(uid: string): Promise<void> {
  const p = await ensure(uid);
  await p.restorePurchases();
}

export async function logOutStore(): Promise<void> {
  if (!rc || !configured || !current) return;
  try { await rc.logOut(); } catch { /* 이미 익명이면 실패 — 무시 */ }
  current = null;
}
