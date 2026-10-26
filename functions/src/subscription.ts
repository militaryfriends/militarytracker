/**
 * 구독·계정 콜러블.
 *
 * users/{uid}.sub 를 바꿀 수 있는 경로는 이 파일과 entitlement.ts 의 writeSub 뿐이다.
 * 보안 규칙이 클라이언트의 sub 수정·삭제를 막고, users 문서 삭제도 서버(accountDelete)만
 * 할 수 있으므로, 앱을 뜯어 고쳐도 스스로 PRO 가 되거나 체험을 다시 받을 수 없다.
 */
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import {
  db, loadAccount, writeSub, logGrant, addDays, hasAdminClaim, requireAuth,
  isProSub, normalizeSub, Subscription,
} from './entitlement';
import { syncStore } from './revenuecat';
import { claimByEmail, claimByPhone, importWaitlist, isPhone, normPhone } from './waitlist';

/** index.ts 의 setGlobalOptions 가 먼저 돌지만, 순서에 기대지 않도록 명시한다 */
const REGION = 'asia-northeast3';
const MAX_INSTANCES = 10;
/** src/config/entitlements.ts 의 TRIAL_DAYS 와 같은 값이어야 한다 */
const TRIAL_DAYS = 30;
/** 프로모션 코드 1개가 줄 수 있는 최대 일수 — 실수로 365000 을 넣는 사고 방지 */
const MAX_PROMO_DAYS = 400;
/** 프로모 코드 규격. 콘솔에서 만들 때도 이 규격을 지킬 것 (짧은 코드는 추측된다) */
const PROMO_CODE = /^[A-Z0-9][A-Z0-9-]{5,39}$/;
/** 계정당 하루 코드 시도 횟수 — 무차별 대입 방지 */
const PROMO_ATTEMPTS_PER_DAY = 10;

const opts = { region: REGION, maxInstances: MAX_INSTANCES, timeoutSeconds: 20, memory: '256MiB' as const };

/** 남은 기간이 있으면 그 위에 더한다 */
function extend(sub: Subscription, days: number): string {
  const base = isProSub(sub) && sub.expiresAt ? Date.parse(sub.expiresAt) : Date.now();
  return addDays(days, Number.isFinite(base) ? base : Date.now());
}

const kstDay = (): string =>
  new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

// ─── 현재 상태 ─────────────────────────────────────────────────────────────
export const subStatus = onCall(opts, async (req: CallableRequest<{ claim?: boolean }>) => {
  const uid = requireAuth(req);
  const acc = await loadAccount(uid, hasAdminClaim(req));

  // 대기자 명단 — 인증된 가입 이메일이 명단에 있으면 프리미엄 지급 (계정당 한 번 확인)
  if (req.data?.claim === true && !acc.sub.waitlist) {
    const got = await claimByEmail(uid, req.auth?.token?.email, req.auth?.token?.email_verified === true, acc.sub);
    if (got) return { sub: got, pro: true, waitlist: true };
  }

  // 스토어 구독의 기간이 지났으면 자동 갱신됐는지 RevenueCat 에 묻는다
  if ((acc.sub.source === 'ios' || acc.sub.source === 'android') && !isProSub(acc.sub)) {
    try {
      const { sub } = await syncStore(uid);
      return { sub, pro: acc.isAdmin || isProSub(sub) };
    } catch (e) {
      logger.warn('store sync failed', { uid, e: String(e) });
    }
  }

  // 만료됐는데 tier 가 pro 로 남아 있으면 정리한다
  if (acc.sub.tier === 'pro' && !isProSub(acc.sub) && acc.sub.status !== 'expired') {
    const sub = await writeSub(uid, { ...acc.sub, tier: 'free', status: 'expired' });
    return { sub, pro: acc.isAdmin };
  }
  return { sub: acc.sub, pro: acc.pro };
});

// ─── 무료 체험 ─────────────────────────────────────────────────────────────
export const subStartTrial = onCall(opts, async (req) => {
  const uid = requireAuth(req);
  if (TRIAL_DAYS <= 0) throw new HttpsError('failed-precondition', '무료 체험을 제공하지 않습니다.');

  // 일회용 메일로 계정을 찍어내 체험을 반복하는 것을 막는다.
  // 앱은 이 reason 을 보고 "인증 메일 다시 보내기" 를 띄운다.
  if (req.auth?.token?.email_verified !== true) {
    throw new HttpsError(
      'failed-precondition',
      '이메일 인증 후 무료 체험을 시작할 수 있습니다. 받은 메일함을 확인해주세요.',
      { reason: 'email_unverified' }
    );
  }

  const acc = await loadAccount(uid, hasAdminClaim(req));
  if (acc.sub.trialUsed) {
    throw new HttpsError('failed-precondition', '무료 체험은 계정당 한 번만 이용할 수 있습니다.');
  }
  if (isProSub(acc.sub)) {
    throw new HttpsError('failed-precondition', '이미 구독 중입니다.');
  }

  // sub 필드가 어떤 경로로든 초기화됐더라도 감사 로그는 남는다 — 같은 트랜잭션에서
  // 한 번 더 확인하고, 지급과 로그를 원자적으로 쓴다.
  // (subEvents 는 관리자 전용 컬렉션이라 클라이언트가 지울 수 없다)
  const sub: Subscription = {
    tier: 'pro',
    status: 'trial',
    expiresAt: addDays(TRIAL_DAYS),
    source: 'promo',
    productId: 'trial',
    trialUsed: true,
    updatedAt: new Date().toISOString(),
  };
  await db.runTransaction(async (tx) => {
    const prior = await tx.get(
      db.collection('subEvents').where('uid', '==', uid).where('kind', '==', 'trial').limit(1)
    );
    if (!prior.empty) {
      logger.warn('trial re-request blocked by subEvents', { uid });
      throw new HttpsError('failed-precondition', '무료 체험은 계정당 한 번만 이용할 수 있습니다.');
    }
    tx.set(db.collection('users').doc(uid), { sub }, { merge: true });
    tx.set(db.collection('subEvents').doc(), {
      uid, kind: 'trial', detail: { days: TRIAL_DAYS }, at: FieldValue.serverTimestamp(),
    });
  });
  return { sub, pro: true };
});

// ─── 프로모션 코드 ─────────────────────────────────────────────────────────
/**
 * promoCodes/{CODE} 문서 형태 (콘솔에서 직접 만든다):
 *   { days: 30, maxUses: 100, uses: 0, active: true, note: '런칭 베타',
 *     validUntil: '2026-12-31T23:59:59.000Z' }   // validUntil 은 선택
 * CODE 는 PROMO_CODE 규격(대문자·숫자·하이픈, 6~40자). 짧고 뻔한 코드는 만들지 말 것.
 *
 * 실패 사유는 사용자에게 구분해 주지 않는다 — "존재하지 않음/비활성/만료/소진" 을
 * 나눠 알려주면 코드 존재 여부를 탐색하는 오라클이 된다.
 */
const PROMO_FAIL = '사용할 수 없는 코드입니다.';

export const subRedeemPromo = onCall(
  { ...opts, timeoutSeconds: 30 },
  async (req: CallableRequest<{ code?: string }>) => {
    const uid = requireAuth(req);
    const code = String(req.data?.code ?? '').trim().toUpperCase().slice(0, 40);
    if (!code) throw new HttpsError('invalid-argument', '코드를 입력해주세요.');

    // 휴대폰 번호 → 대기자 명단 확인 (코드와 같은 하루 시도 횟수를 쓴다)
    const phone = normPhone(code);
    if (/^[0-9+\-\s]+$/.test(code) && isPhone(phone)) {
      const attemptRef = db.collection('promoAttempts').doc(uid);
      const today = kstDay();
      await db.runTransaction(async (tx) => {
        const a = (await tx.get(attemptRef)).data() as { day?: string; n?: number } | undefined;
        const n = a?.day === today ? Number(a.n) || 0 : 0;
        if (n >= PROMO_ATTEMPTS_PER_DAY) {
          throw new HttpsError('resource-exhausted', '오늘은 더 이상 코드를 입력할 수 없습니다. 내일 다시 시도해주세요.');
        }
        tx.set(attemptRef, { day: today, n: n + 1, uid }, { merge: true });
      });
      const sub = await claimByPhone(uid, phone);
      if (!sub) throw new HttpsError('failed-precondition', '대기자 명단에서 이 번호를 찾지 못했습니다.');
      return { sub, pro: true, waitlist: true };
    }
    if (!PROMO_CODE.test(code)) throw new HttpsError('failed-precondition', PROMO_FAIL);

    const codeRef = db.collection('promoCodes').doc(code);
    const useRef = db.collection('promoRedemptions').doc(`${uid}__${code}`);
    const userRef = db.collection('users').doc(uid);
    const attemptRef = db.collection('promoAttempts').doc(uid);
    const today = kstDay();

    const sub = await db.runTransaction(async (tx) => {
      const [codeSnap, useSnap, userSnap, attemptSnap] = await Promise.all([
        tx.get(codeRef), tx.get(useRef), tx.get(userRef), tx.get(attemptRef),
      ]);

      // 시도 횟수는 성공·실패 모두 센다 (같은 트랜잭션 안에서 — 병렬 시도로 못 넘긴다)
      const a = attemptSnap.data() as { day?: string; n?: number } | undefined;
      const n = a?.day === today ? Number(a.n) || 0 : 0;
      if (n >= PROMO_ATTEMPTS_PER_DAY) {
        throw new HttpsError('resource-exhausted', '오늘은 더 이상 코드를 입력할 수 없습니다. 내일 다시 시도해주세요.');
      }
      tx.set(attemptRef, { day: today, n: n + 1, uid }, { merge: true });

      if (!codeSnap.exists) throw new HttpsError('failed-precondition', PROMO_FAIL);
      const c = codeSnap.data() as {
        days?: number; maxUses?: number; uses?: number; active?: boolean; validUntil?: string;
      };
      if (c.active === false) throw new HttpsError('failed-precondition', PROMO_FAIL);
      if (c.validUntil && Date.parse(c.validUntil) < Date.now()) {
        throw new HttpsError('failed-precondition', PROMO_FAIL);
      }
      const uses = Number(c.uses ?? 0);
      const maxUses = Number(c.maxUses ?? 0);
      if (maxUses > 0 && uses >= maxUses) throw new HttpsError('failed-precondition', PROMO_FAIL);
      if (useSnap.exists) throw new HttpsError('already-exists', '이미 사용한 코드입니다.');

      const days = Math.min(MAX_PROMO_DAYS, Math.max(1, Math.round(Number(c.days ?? 0))));
      if (!Number.isFinite(days) || !days) throw new HttpsError('failed-precondition', PROMO_FAIL);

      const current = normalizeSub(userSnap.data()?.sub);
      const next: Subscription = {
        tier: 'pro',
        status: 'active',
        expiresAt: extend(current, days),
        source: 'promo',
        productId: code,
        trialUsed: current.trialUsed,
        updatedAt: new Date().toISOString(),
      };

      tx.set(userRef, { sub: next }, { merge: true });
      tx.set(useRef, { uid, code, days, at: new Date().toISOString() });
      tx.update(codeRef, { uses: uses + 1 });
      return next;
    });

    await logGrant(uid, 'promo', { code });
    return { sub, pro: true };
  }
);

// ─── 관리자 지급 ───────────────────────────────────────────────────────────
export const subGrant = onCall(
  { ...opts, timeoutSeconds: 30 },
  async (req: CallableRequest<{ uid?: string; days?: number | null; note?: string; waitlist?: unknown }>) => {
    const caller = requireAuth(req);
    const me = await loadAccount(caller, hasAdminClaim(req));
    if (!me.isAdmin) throw new HttpsError('permission-denied', '관리자만 사용할 수 있습니다.');

    // 대기자 명단 가져오기 — 콜러블을 새로 만들면 공개 호출 설정을 콘솔에서 따로 켜야 해서 여기에 붙였다
    if (req.data?.waitlist !== undefined) {
      const r = await importWaitlist(req.data.waitlist);
      logger.info('waitlist import', { by: caller, ...r });
      return r;
    }

    const target = String(req.data?.uid ?? '').trim();
    if (!target || target.length > 128) throw new HttpsError('invalid-argument', '대상 uid 가 필요합니다.');
    const targetSnap = await db.collection('users').doc(target).get();
    if (!targetSnap.exists) throw new HttpsError('not-found', '대상 사용자가 없습니다.');

    const raw = req.data?.days;
    // days 가 null 이면 무기한
    let days: number | null;
    if (raw === null || raw === undefined) {
      days = null;
    } else {
      const n = Math.round(Number(raw));
      if (!Number.isFinite(n) || n < 1) throw new HttpsError('invalid-argument', 'days 는 1 이상이어야 합니다.');
      days = Math.min(MAX_PROMO_DAYS * 10, n);
    }

    const current = normalizeSub(targetSnap.data()?.sub);
    await logGrant(target, 'admin_grant', { by: caller, days, note: String(req.data?.note ?? '').slice(0, 200) });
    const sub = await writeSub(target, {
      tier: 'pro',
      status: 'active',
      expiresAt: days === null ? null : extend(current, days),
      source: 'admin',
      productId: null,
      trialUsed: current.trialUsed,
    });
    logger.info('subGrant', { by: caller, target, days });
    return { sub, pro: true };
  }
);

// ─── 스토어 영수증 ─────────────────────────────────────────────────────────
/**
 * 앱이 구매 · 복원을 마친 뒤 부른다. 앱이 보낸 영수증은 쓰지 않고, 서버가 RevenueCat 에
 * 이 uid 의 구독을 직접 물어 기록한다(revenuecat.ts). 아무 값이나 보내 PRO 가 되는 길이 없다.
 */
export const subApplyReceipt = onCall({ ...opts, timeoutSeconds: 30 }, async (req) => {
  const uid = requireAuth(req);
  const { sub } = await syncStore(uid);
  return { sub, pro: isProSub(sub) };
});

// ─── 계정 삭제 ─────────────────────────────────────────────────────────────
/**
 * 계정과 하위 데이터를 서버가 지운다.
 *
 * 왜 서버인가:
 *  - 클라이언트가 users 문서를 지울 수 있으면 sub/usage 를 초기화하는 우회로가 된다.
 *    그래서 보안 규칙에서 owner delete 를 뺐다.
 *  - deleteUser 는 "최근 로그인" 을 요구해 대부분의 사용자가 여기서 막혔다. Admin SDK 는 그 제약이 없다.
 *  - 데이터를 지우다 실패해도 auth 는 마지막에 지우므로 재시도가 가능하다.
 */
async function deleteByQuery(q: FirebaseFirestore.Query): Promise<number> {
  let total = 0;
  for (;;) {
    const snap = await q.limit(400).get();
    if (snap.empty) return total;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;
    if (snap.size < 400) return total;
  }
}

export const accountDelete = onCall({ ...opts, timeoutSeconds: 120 }, async (req) => {
  const uid = requireAuth(req);

  const logs = await deleteByQuery(db.collection('workoutLogs').where('userId', '==', uid));
  const weights = await deleteByQuery(db.collection('weights').where('userId', '==', uid));
  const promos = await deleteByQuery(db.collection('promoRedemptions').where('uid', '==', uid));
  // 내 변화 프로젝트 — 체형 수치가 들어 있는 개인정보라 전부 지운다
  const body = (await Promise.all(
    ['bodyAnalyses', 'bodyProjects', 'checkins', 'bodyReports']
      .map((c) => deleteByQuery(db.collection(c).where('userId', '==', uid)))
  )).reduce((a, b) => a + b, 0);
  await db.collection('promoAttempts').doc(uid).delete();
  await db.collection('aiCost').doc(uid).delete();
  await db.collection('plans').doc(uid).delete();
  await db.collection('users').doc(uid).delete();
  // subEvents 는 감사 로그라 남긴다 (uid 만 있고 개인정보는 없다)

  await getAuth().deleteUser(uid);
  logger.info('accountDelete', { uid, logs, weights, promos, body });
  return { ok: true };
});
