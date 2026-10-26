/**
 * AI 사용 한도.
 *
 * 왜 필요한가: AI 호출은 호출당 원가가 붙는데 구독료는 정액이다.
 * 무제한으로 두면 극소수 헤비 유저(또는 봇)가 구독 매출을 전부 상쇄한다.
 * (월 구독 ₩4,900 → 수수료 제하면 약 ₩4,165. 코치 500회면 원가가 그걸 넘는다.)
 * 코치는 "하루 10회" 가 구독 혜택 문구다 — 월 한도로 두면 첫 며칠에 몰아 쓰고 나머지 날이 막힌다.
 *
 * 한도는 반드시 서버에서 센다. 앱에 남은 횟수를 내려 주긴 하지만
 * 그건 표시용이고, 실제 차단은 여기서 한다.
 *
 * 저장 위치: users/{uid}.usage.{kind} = { period, count }
 * 이 필드는 Cloud Functions 만 쓴다 — 보안 규칙이 클라이언트의 수정·삭제를 막는다.
 *
 * 왜 트랜잭션인가: "읽고 → AI 호출 → 쓰기" 로 하면 병렬 호출이 전부 한도를 통과한다.
 * 그래서 호출 *전에* 트랜잭션으로 자리를 선점하고, AI 가 실패하면 되돌린다.
 */
import { HttpsError } from 'firebase-functions/v2/https';
import { db } from './entitlement';

export type QuotaKind = 'coach' | 'plan' | 'diet' | 'report';

interface QuotaRule {
  limit: number;
  /** month = 한국 시간 기준 달, day = 한국 시간 기준 날 */
  period: 'month' | 'day';
  /** 앱이 판별하는 details.reason — 코치는 기존 값을 유지한다 */
  reason: string;
  label: string;
}

export const QUOTA: Record<QuotaKind, QuotaRule> = {
  coach: { limit: 10, period: 'day', reason: 'coach_quota_exceeded', label: '오늘의 코치 대화' },
  plan: { limit: 2, period: 'day', reason: 'plan_quota_exceeded', label: '오늘의 AI 플랜 생성' },
  diet: { limit: 3, period: 'day', reason: 'diet_quota_exceeded', label: '오늘의 AI 식단 생성' },
  // 체크인은 4주마다라 달력 한 달에 두 번 들 수 있다. 다 써도 체크인은 템플릿 리포트로 끝난다(aiReport)
  report: { limit: 2, period: 'month', reason: 'report_quota_exceeded', label: '이번 달 리포트' },
};

/**
 * 계정당 이번 달 AI 원가 상한(원). 넘으면 그달 남은 날은 코치가 하루 COACH_OVER_BUDGET 회로 줄어든다
 * (구독료 9,900원 · 남는 돈 약 7,650원보다 원가가 커지지 않게). 원가는 aiCost/{uid} — index.ts addCost.
 */
export const AI_MONTHLY_CAP_WON = 5000;
export const COACH_OVER_BUDGET = 3;

/** 앱과 공유하는 값 — 코치 화면이 남은 횟수를 표시한다 (하루 기준) */
export const COACH_DAILY_LIMIT = QUOTA.coach.limit;

export interface Quota {
  used: number;
  limit: number;
  remaining: number;
  /** 관리자는 한도가 없다 */
  unlimited?: boolean;
}

/**
 * 한국 시간 기준 YYYY-MM 또는 YYYY-MM-DD.
 * UTC 로 계산하면 매월 1일 오전 9시에 초기화돼 유저가 이상하게 느낀다.
 */
export function periodKey(period: 'month' | 'day', now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const ym = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}`;
  return period === 'month' ? ym : `${ym}-${String(kst.getUTCDate()).padStart(2, '0')}`;
}

interface StoredUsage {
  period?: string;
  count?: number;
}

function readUsage(data: FirebaseFirestore.DocumentData | undefined, kind: QuotaKind): number {
  const usage = (data?.usage ?? {}) as Record<string, StoredUsage>;
  // 구버전 문서는 coachUsage 에 있었다
  const raw: StoredUsage = usage[kind] ?? (kind === 'coach' ? (data?.coachUsage ?? {}) : {});
  const rule = QUOTA[kind];
  // 기간이 바뀌면 저장된 값은 무시한다 (따로 초기화 작업이 필요 없다)
  return raw.period === periodKey(rule.period) ? Math.max(0, Number(raw.count) || 0) : 0;
}

const unlimited = (kind: QuotaKind): Quota => ({
  used: 0, limit: QUOTA[kind].limit, remaining: QUOTA[kind].limit, unlimited: true,
});

/**
 * AI 를 부르기 *전에* 자리를 선점한다. 한도를 넘었으면 resource-exhausted 로 끊는다.
 * 트랜잭션이라 동시에 100개를 보내도 100번째 이후는 전부 막힌다.
 */
export async function consumeQuota(uid: string, kind: QuotaKind, isAdmin: boolean): Promise<Quota> {
  if (isAdmin) return unlimited(kind);
  const rule = QUOTA[kind];
  const ref = db.collection('users').doc(uid);

  const costRef = db.collection('aiCost').doc(uid);
  return db.runTransaction(async (tx) => {
    const [snap, cost] = await Promise.all([tx.get(ref), kind === 'coach' ? tx.get(costRef) : Promise.resolve(null)]);
    const used = readUsage(snap.data(), kind);
    const spent = Number(cost?.data()?.[periodKey('month')] ?? 0);
    const limit = kind === 'coach' && spent >= AI_MONTHLY_CAP_WON ? COACH_OVER_BUDGET : rule.limit;
    if (used >= limit) {
      throw new HttpsError(
        'resource-exhausted',
        `${rule.label} ${limit}회를 모두 사용했습니다.`,
        { reason: rule.reason, limit, used }
      );
    }
    const count = used + 1;
    tx.set(ref, { usage: { [kind]: { period: periodKey(rule.period), count } } }, { merge: true });
    return { used: count, limit, remaining: limit - count };
  });
}

/** AI 호출이 실패했을 때 선점한 자리를 돌려준다 — 연결 실패로 횟수가 깎이면 안 된다 */
export async function refundQuota(uid: string, kind: QuotaKind, quota: Quota): Promise<void> {
  if (quota.unlimited) return;
  const rule = QUOTA[kind];
  const ref = db.collection('users').doc(uid);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const used = readUsage(snap.data(), kind);
      if (used <= 0) return;
      tx.set(ref, { usage: { [kind]: { period: periodKey(rule.period), count: used - 1 } } }, { merge: true });
    });
  } catch {
    // 환불 실패는 한도 1회 손해일 뿐 — 호출자에게 던지지 않는다
  }
}
