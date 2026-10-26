/**
 * 구독 권한 — 서버 판정.
 *
 * 앱의 잠금 UI 는 우회할 수 있으므로 유료 기능의 실제 차단은 여기서 한다.
 * users/{uid}.sub 는 Cloud Functions(Admin SDK)만 쓴다 — 이 파일의 writeSub 와
 * subscription.ts 의 프로모 트랜잭션. 보안 규칙이 클라이언트의 수정·삭제를 모두 막는다.
 *
 * 판정 규칙 사본: src/utils/subscription.ts (isProSub). 고칠 때 둘 다 고칠 것.
 * Feature 키 사본: src/config/entitlements.ts
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();
export const db = getFirestore();

export type Feature = 'ai_plan' | 'ai_coach' | 'ai_diet' | 'routine_reco' | 'body_project';

export const FEATURE_LABEL: Record<Feature, string> = {
  ai_plan: 'AI 개인화 플랜',
  ai_coach: 'AI 코치',
  ai_diet: 'AI 식단',
  routine_reco: '루틴 추천',
  body_project: '내 변화 프로젝트',
};

export type PlanTier = 'free' | 'pro';
export type SubStatus = 'none' | 'trial' | 'active' | 'grace' | 'expired' | 'canceled';
export type SubSource = 'none' | 'ios' | 'android' | 'promo' | 'admin';

export interface Subscription {
  tier: PlanTier;
  status: SubStatus;
  expiresAt: string | null;
  source: SubSource;
  productId: string | null;
  trialUsed: boolean;
  updatedAt: string;
  /** 대기자 명단 확인 결과 — claimed(혜택 받음) · none(명단에 없음). 없으면 아직 확인 전 */
  waitlist?: 'claimed' | 'none';
}

/** 형식이 깨진 expiresAt 에 쓰는 "이미 만료" 값 */
const EXPIRED_AT = '1970-01-01T00:00:00.000Z';

export const FREE_SUB: Subscription = {
  tier: 'free',
  status: 'none',
  expiresAt: null,
  source: 'none',
  productId: null,
  trialUsed: false,
  updatedAt: '',
};

export function normalizeSub(raw: unknown): Subscription {
  const d = (raw ?? {}) as Partial<Subscription>;
  const status: SubStatus =
    d.status === 'trial' || d.status === 'active' || d.status === 'grace' ||
    d.status === 'expired' || d.status === 'canceled'
      ? d.status
      : 'none';
  const source: SubSource =
    d.source === 'ios' || d.source === 'android' || d.source === 'promo' || d.source === 'admin'
      ? d.source
      : 'none';
  // expiresAt 이 문자열이 아닌 값(Timestamp, number)으로 들어오면 "만료 없음" 이 아니라
  // "만료됨" 으로 본다 — 콘솔에서 잘못 넣은 값이 영구 PRO 가 되면 안 된다.
  const expiresAt =
    d.expiresAt === null || d.expiresAt === undefined ? null
    : typeof d.expiresAt === 'string' ? d.expiresAt
    : EXPIRED_AT;
  return {
    tier: d.tier === 'pro' ? 'pro' : 'free',
    status,
    expiresAt,
    source,
    productId: typeof d.productId === 'string' ? d.productId : null,
    trialUsed: d.trialUsed === true,
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : '',
    ...(d.waitlist === 'claimed' || d.waitlist === 'none' ? { waitlist: d.waitlist } : {}),
  };
}

export function isProSub(sub: Subscription | null | undefined, now = Date.now()): boolean {
  if (!sub || sub.tier !== 'pro') return false;
  if (sub.status === 'none' || sub.status === 'expired') return false;
  if (!sub.expiresAt) return true;
  const t = Date.parse(sub.expiresAt);
  return Number.isFinite(t) && t > now;
}

export interface Account {
  sub: Subscription;
  isAdmin: boolean;
  pro: boolean;
}

/** 커스텀 클레임 admin — 보안 규칙(isAdmin)과 같은 기준으로 본다 */
export const hasAdminClaim = (req: CallableRequest): boolean => req.auth?.token?.admin === true;

export function requireAuth(req: CallableRequest): string {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  return req.auth.uid;
}

/**
 * 계정 상태. 관리자 판정은 보안 규칙과 동일하게
 * "커스텀 클레임 admin==true 또는 users/{uid}.role=='admin'" 이다.
 */
export async function loadAccount(uid: string, adminClaim = false): Promise<Account> {
  const snap = await db.collection('users').doc(uid).get();
  const data = snap.exists ? snap.data() : undefined;
  const sub = normalizeSub(data?.sub);
  const isAdmin = adminClaim || data?.role === 'admin';
  return { sub, isAdmin, pro: isAdmin || isProSub(sub) };
}

/** '코치' → '코치는', '플랜' → '플랜은' — 받침 유무로 조사를 고른다 (앱 subscribe.tsx 의 eun 과 같은 규칙) */
function eun(word: string): string {
  const ch = word.charCodeAt(word.length - 1);
  if (ch < 0xac00 || ch > 0xd7a3) return `${word}은(는)`;
  return (ch - 0xac00) % 28 === 0 ? `${word}는` : `${word}은`;
}

/**
 * 유료 기능 진입 관문. 권한이 없으면 permission-denied 로 끊는다.
 * 앱은 이 코드를 보고 구독 화면을 연다.
 */
export async function requirePro(req: CallableRequest, feature: Feature): Promise<Account & { uid: string }> {
  const uid = requireAuth(req);
  const acc = await loadAccount(uid, hasAdminClaim(req));
  if (acc.pro) return { ...acc, uid };
  throw new HttpsError(
    'permission-denied',
    `${eun(FEATURE_LABEL[feature])} 구독 기능입니다.`,
    { reason: 'subscription_required', feature }
  );
}

/** users/{uid}.sub 를 통째로 교체하고 저장된 값을 돌려준다 */
export async function writeSub(uid: string, next: Omit<Subscription, 'updatedAt'>): Promise<Subscription> {
  const sub: Subscription = { ...next, updatedAt: new Date().toISOString() };
  await db.collection('users').doc(uid).set({ sub }, { merge: true });
  return sub;
}

/** 감사 로그 — 누가 언제 무슨 근거로 PRO 가 됐는지 남긴다 */
export async function logGrant(uid: string, kind: string, detail: Record<string, unknown>): Promise<void> {
  await db.collection('subEvents').add({
    uid, kind, detail, at: FieldValue.serverTimestamp(),
  });
}

export const addDays = (days: number, from = Date.now()): string =>
  new Date(from + days * 86_400_000).toISOString();
