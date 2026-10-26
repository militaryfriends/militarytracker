/**
 * 스토어 결제 (iOS · Android) — RevenueCat SDK.
 * 결제 자체와 영수증 검증은 RevenueCat 이 하고, 앱은 끝나면 서버 subApplyReceipt 를 불러
 * 서버가 RevenueCat 에 직접 물어 users/{uid}.sub 를 쓰게 한다(앱이 보낸 결과는 믿지 않는다).
 * appUserID = Firebase uid — 기기를 바꿔도 같은 구독.
 */
import { Platform } from 'react-native';
import { REVENUECAT } from '../config/revenuecat';

export interface StorePackage { id: string; productId: string; price: string; raw: unknown }

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
  return (off.current?.availablePackages ?? []).map((k) => ({
    id: k.identifier,
    productId: k.product.identifier,
    price: k.product.priceString,
    raw: k,
  }));
}

export async function buyPackage(uid: string, pkg: StorePackage): Promise<'done' | 'cancelled'> {
  const p = await ensure(uid);
  try {
    await p.purchasePackage(pkg.raw as Parameters<RC['purchasePackage']>[0]);
    return 'done';
  } catch (e) {
    if ((e as { userCancelled?: boolean })?.userCancelled) return 'cancelled';
    throw e;
  }
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
