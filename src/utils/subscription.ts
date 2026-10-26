/**
 * 구독 상태 판정 — 클라이언트/서버가 같은 규칙을 써야 한다.
 * 서버 사본: functions/src/entitlement.ts (isProSub / normalizeSub). 고칠 때 둘 다 고칠 것.
 */
import type { Subscription } from '../types';

export const FREE_SUB: Subscription = {
  tier: 'free',
  status: 'none',
  expiresAt: null,
  source: 'none',
  productId: null,
  trialUsed: false,
  updatedAt: '',
};

/**
 * 지금 PRO 인가.
 * canceled·grace 는 남은 기간 동안은 계속 PRO 로 본다(스토어 관행).
 * expiresAt 이 null 이면 만료 없는 지급분(관리자·평생권).
 */
export function isProSub(sub: Subscription | null | undefined, now = Date.now()): boolean {
  if (!sub || sub.tier !== 'pro') return false;
  if (sub.status === 'none' || sub.status === 'expired') return false;
  if (!sub.expiresAt) return true;
  const t = Date.parse(sub.expiresAt);
  return Number.isFinite(t) && t > now;
}

/** 형식이 깨진 expiresAt 에 쓰는 "이미 만료" 값 — fail-open 이 아니라 fail-closed */
const EXPIRED_AT = '1970-01-01T00:00:00.000Z';

/** 서버에서 온 값이 깨져 있어도 앱이 죽지 않도록 */
export function normalizeSub(raw: unknown): Subscription {
  const d = (raw ?? {}) as Partial<Subscription>;
  const tier = d.tier === 'pro' ? 'pro' : 'free';
  const status: Subscription['status'] =
    d.status === 'trial' || d.status === 'active' || d.status === 'grace' ||
    d.status === 'expired' || d.status === 'canceled'
      ? d.status
      : 'none';
  const source: Subscription['source'] =
    d.source === 'ios' || d.source === 'android' || d.source === 'promo' || d.source === 'admin'
      ? d.source
      : 'none';
  // null/undefined 만 "만료 없음". Timestamp·number 등 다른 타입은 만료로 본다(서버와 동일)
  const expiresAt =
    d.expiresAt === null || d.expiresAt === undefined ? null
    : typeof d.expiresAt === 'string' ? d.expiresAt
    : EXPIRED_AT;
  return {
    tier,
    status,
    expiresAt,
    source,
    productId: typeof d.productId === 'string' ? d.productId : null,
    trialUsed: d.trialUsed === true,
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : '',
    ...(d.waitlist === 'claimed' || d.waitlist === 'none' ? { waitlist: d.waitlist } : {}),
  };
}

/** 남은 일수 — 0 이하이거나 무기한이면 null */
export function daysLeft(sub: Subscription | null | undefined, now = Date.now()): number | null {
  if (!sub?.expiresAt) return null;
  const t = Date.parse(sub.expiresAt);
  if (!Number.isFinite(t) || t <= now) return null;
  return Math.ceil((t - now) / 86_400_000);
}

export const SUB_STATUS_LABEL: Record<Subscription['status'], string> = {
  none: '무료 플랜',
  trial: '무료 체험 중',
  active: '구독 중',
  grace: '결제 확인 중',
  expired: '만료됨',
  canceled: '해지 예약됨',
};
