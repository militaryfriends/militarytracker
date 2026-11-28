/**
 * 스토어 구독 확인 — RevenueCat REST API 로 서버가 직접 묻는다. 앱이 보낸 결과는 믿지 않는다.
 *
 * 비밀 키(sk_…)는 Firestore serverConfig/revenuecat { secretKey } 에 둔다(규칙상 관리자 외 읽기 불가).
 * Secret Manager 를 쓰지 않는 이유: 비밀이 없으면 함수 배포 자체가 실패해, 키를 받기 전에는 다른 기능도 못 올린다.
 * 앱 사용자 id = Firebase uid (앱의 Purchases.configure appUserID).
 */
import * as logger from 'firebase-functions/logger';
import { HttpsError } from 'firebase-functions/v2/https';
import { db, normalizeSub, Subscription, writeSub, logGrant } from './entitlement';

const ENTITLEMENT = 'pro';
const API = 'https://api.revenuecat.com/v1/subscribers/';

let cachedKey: { v: string; at: number } | null = null;
async function secretKey(): Promise<string> {
  if (cachedKey && Date.now() - cachedKey.at < 10 * 60_000) return cachedKey.v;
  const snap = await db.collection('serverConfig').doc('revenuecat').get();
  const v = String(snap.data()?.secretKey ?? '').trim();
  cachedKey = { v, at: Date.now() };
  return v;
}

interface RcEntitlement { expires_date?: string | null; product_identifier?: string }
interface RcSub {
  store?: string; period_type?: string; expires_date?: string | null;
  unsubscribe_detected_at?: string | null; billing_issues_detected_at?: string | null;
}

/**
 * RevenueCat 의 지금 상태로 users/{uid}.sub 를 맞춘다.
 * 스토어 구독이 없으면 지금 sub 를 건드리지 않는다(체험 · 코드 · 대기자 혜택은 그대로).
 */
export async function syncStore(uid: string): Promise<{ sub: Subscription; changed: boolean }> {
  const key = await secretKey();
  const userSnap = await db.collection('users').doc(uid).get();
  const cur = normalizeSub(userSnap.data()?.sub);
  if (!key) throw new HttpsError('failed-precondition', '스토어 결제가 아직 연결되지 않았습니다.');

  const res = await fetch(API + encodeURIComponent(uid), {
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    logger.error('revenuecat error', { status: res.status, body: (await res.text()).slice(0, 300) });
    throw new HttpsError('unavailable', '구독 정보를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.');
  }
  const body = (await res.json()) as {
    subscriber?: { entitlements?: Record<string, RcEntitlement>; subscriptions?: Record<string, RcSub> };
  };
  const ent = body.subscriber?.entitlements?.[ENTITLEMENT];
  if (!ent?.product_identifier) return { sub: cur, changed: false };

  const rs = body.subscriber?.subscriptions?.[ent.product_identifier] ?? {};
  const expires = ent.expires_date ?? rs.expires_date ?? null;
  const live = !expires || Date.parse(expires) > Date.now();
  const source = rs.store === 'play_store' ? 'android' : rs.store === 'app_store' ? 'ios' : cur.source;
  // 스토어 구독이 끝났는데 지금 sub 가 다른 경로(코드 · 대기자)로 더 길면 그쪽을 둔다
  if (!live && cur.source !== 'ios' && cur.source !== 'android') return { sub: cur, changed: false };

  const status: Subscription['status'] = !live ? 'expired'
    : rs.billing_issues_detected_at ? 'grace'
    : rs.unsubscribe_detected_at ? 'canceled'
    : rs.period_type === 'trial' ? 'trial'
    : 'active';
  // 대기자 무료 자격(eligible)은 스토어 구독이 생기면 다 쓴 것 — 대기자 혜택(오퍼 코드 · 개발자 지정 혜택)으로
  // 무료 기간을 시작했든 일반 구독을 했든, 결제 수단이 등록된 구독이 됐다(waitlist.ts)
  const waitlist = live && cur.waitlist === 'eligible' ? 'claimed' as const : cur.waitlist;
  const next = {
    tier: live ? 'pro' as const : 'free' as const,
    status,
    expiresAt: expires,
    source: source as Subscription['source'],
    productId: ent.product_identifier,
    trialUsed: cur.trialUsed,
    ...(waitlist ? { waitlist } : {}),
    ...(cur.waitlistDays ? { waitlistDays: cur.waitlistDays } : {}),
  };
  const same = cur.tier === next.tier && cur.status === next.status && cur.expiresAt === next.expiresAt
    && cur.source === next.source && cur.productId === next.productId && cur.waitlist === waitlist;
  if (same) return { sub: cur, changed: false };
  const sub = await writeSub(uid, next);
  await logGrant(uid, 'store', {
    status, expires, product: ent.product_identifier, store: rs.store ?? null,
    ...(waitlist !== cur.waitlist ? { waitlist } : {}),
  });
  return { sub, changed: true };
}
