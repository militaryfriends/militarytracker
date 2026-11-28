/**
 * iOS 대기자 혜택 — App Store 일회용 오퍼 코드 창고 (2026-11-28 대표 결정: 무료 기간도 결제 수단 등록 뒤).
 *
 * 만들기:   App Store Connect › mt_pro_monthly › 오퍼 코드 '무료 3개월' · '무료 1개월' → 일회용 코드 CSV 를 내려받아
 *           앱 MY › 설정 › 관리자 › 대기자 명단 화면에 붙여 넣는다 → subGrant({ offerCodes: { offer, codes, expires? } }).
 *           (설정 순서: docs/대기자-혜택-스토어-설정.md)
 * 문서:     offerCodes/{코드} { platform: 'ios', offer: 'm3' | 'm1', pool: '<offer>:free' | ':assigned' | ':expired', at,
 *           expiresAt?, assignedTo?, assignedAt? }
 *           offerAssignments/{uid} { code, offer, at } — 한 사람에 코드 하나(잠금 겸 찾기)
 *           둘 다 규칙상 관리자 · 서버만 읽고 쓴다(firestore.rules 맨 끝 줄).
 *           pool 은 혜택 · 상태를 한 칸에 묶은 값이라 같음(==) 조건 하나로 찾는다(복합 색인이 필요 없다).
 * 나눠 주기: 대기자 자격(sub.waitlist === 'eligible')인 사람이 '무료 받기'를 누르면 안 쓴 코드 하나를 그 계정에 묶는다.
 *           다시 누르면 같은 코드(만료됐으면 새 코드). 앱은 App Store 코드 사용 화면을 코드가 채워진 채로 연다 —
 *           결제 수단 확인 · 등록은 애플이 한다. 실제로 쓰였는지는 스토어 구독이 생기는 것으로 안다(revenuecat.ts → 'claimed').
 *           동시에 많이 눌러도 같은 코드 하나에 몰리지 않게 후보 20개 중 하나를 골라 짧은 트랜잭션으로 묶는다.
 */
import * as logger from 'firebase-functions/logger';
import { HttpsError } from 'firebase-functions/v2/https';
import { db, Subscription, logGrant } from './entitlement';
import { WaitlistOffer, kstEndOfDay, offerOf, parseOfferCodes, redeemUrl } from './offerPure';

const COL = 'offerCodes';
const LOCKS = 'offerAssignments';
/** 한 번 호출에 넣는 최대 코드 수 — 관리자 화면이 이보다 잘게 나눠 보낸다(함수 시간 한도 30초) */
const MAX_IMPORT = 3000;

const offerIn = (v: unknown): WaitlistOffer => (v === 'm1' ? 'm1' : 'm3');
const isExpired = (d: { expiresAt?: unknown } | undefined, now = Date.now()): boolean =>
  typeof d?.expiresAt === 'string' && Date.parse(d.expiresAt) <= now;

/** 관리자 가져오기 — 이미 있는 코드(나눠 준 것 포함)는 건드리지 않는다. expires: 'YYYY-MM-DD'(콘솔에서 정한 만료일) */
export async function importOfferCodes(raw: unknown): Promise<{ added: number; skipped: number; over: number; offer: WaitlistOffer }> {
  const d = (raw ?? {}) as { offer?: unknown; codes?: unknown; expires?: unknown };
  if (d.offer !== 'm3' && d.offer !== 'm1') throw new HttpsError('invalid-argument', '혜택(3개월 · 1개월)을 골라 주세요.');
  const offer: WaitlistOffer = d.offer;
  const all = parseOfferCodes(d.codes);
  if (!all.length) throw new HttpsError('invalid-argument', '코드를 찾지 못했습니다.');
  const codes = all.slice(0, MAX_IMPORT);
  const expiresAt = kstEndOfDay(d.expires);
  let added = 0;
  let skipped = 0;
  for (let i = 0; i < codes.length; i += 300) {
    const refs = codes.slice(i, i + 300).map((c) => db.collection(COL).doc(c));
    const snaps = await db.getAll(...refs);
    const batch = db.batch();
    const at = new Date().toISOString();
    snaps.forEach((s, k) => {
      if (s.exists) { skipped++; return; }
      batch.set(refs[k], { platform: 'ios', offer, pool: `${offer}:free`, at, ...(expiresAt ? { expiresAt } : {}) });
      added++;
    });
    await batch.commit();
  }
  return { added, skipped, over: all.length - codes.length, offer };
}

/** 관리자 화면 — 혜택마다 남은 코드 · 나눠 준 코드 수 (만료일이 지난 '남은' 코드도 남은 수에 들어간다) */
export async function offerCodeStats(): Promise<Record<WaitlistOffer, { free: number; assigned: number }>> {
  const count = async (pool: string): Promise<number> =>
    (await db.collection(COL).where('pool', '==', pool).count().get()).data().count;
  const [m3f, m3a, m1f, m1a] = await Promise.all(['m3:free', 'm3:assigned', 'm1:free', 'm1:assigned'].map(count));
  return { m3: { free: m3f, assigned: m3a }, m1: { free: m1f, assigned: m1a } };
}

/** 대기자 자격이 있는 계정에 코드 하나를 묶어 돌려준다. 이미 묶인 코드가 있으면 그것(만료됐으면 새 코드) */
export async function assignOfferCode(uid: string, sub: Subscription): Promise<{ code: string; url: string; offer: WaitlistOffer }> {
  if (sub.waitlist !== 'eligible') throw new HttpsError('failed-precondition', '대기자 혜택 대상이 아닙니다.');
  const want = offerOf(sub.waitlistDays);
  const lockRef = db.collection(LOCKS).doc(uid);

  // 이미 묶인 코드 — 아직 쓸 수 있으면 그대로, 만료됐으면 만료로 돌리고 새로 묶는다
  let stale = '';
  const lock = await lockRef.get();
  if (lock.exists) {
    const code = String(lock.data()?.code ?? '');
    const c = code ? await db.collection(COL).doc(code).get() : null;
    if (c?.exists && !isExpired(c.data())) {
      return { code, url: redeemUrl(code), offer: offerIn(c.data()?.offer) };
    }
    if (c?.exists) await c.ref.update({ pool: `${offerIn(c.data()?.offer)}:expired` });
    stale = code;
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const cands = await db.collection(COL).where('pool', '==', `${want}:free`).limit(20).get();
    if (cands.empty) {
      // 창고가 비었다 — 관리자가 App Store Connect 에서 코드를 더 만들어 넣어야 한다
      logger.error('offer code pool empty', { offer: want });
      throw new HttpsError('resource-exhausted', '대기자 혜택을 준비하고 있습니다. 잠시 후 다시 시도해주세요.');
    }
    // 만료일이 지난 코드는 만료로 돌려 다시 나오지 않게 하고, 남은 것 중에서 고른다
    const now = Date.now();
    const dead = cands.docs.filter((d) => isExpired(d.data(), now));
    if (dead.length) {
      const b = db.batch();
      dead.forEach((d) => b.update(d.ref, { pool: `${want}:expired` }));
      await b.commit();
    }
    const fresh = cands.docs.filter((d) => !isExpired(d.data(), now));
    if (!fresh.length) continue;
    const pick = fresh[Math.floor(Math.random() * fresh.length)];
    const got = await db.runTransaction(async (tx) => {
      const [c, l] = await Promise.all([tx.get(pick.ref), tx.get(lockRef)]);
      const mine = l.exists ? String(l.data()?.code ?? '') : '';
      // 다른 요청(같은 사람의 두 번 누름)이 먼저 묶었다 — 그 코드를 준다
      if (mine && mine !== stale) return { code: mine, offer: offerIn(l.data()?.offer), fresh: false };
      const cd = c.data();
      if (!c.exists || cd?.pool !== `${want}:free`) return null; // 그새 다른 사람에게 나갔다 — 다시 고른다
      if (isExpired(cd)) {
        tx.update(pick.ref, { pool: `${want}:expired` });
        return null;
      }
      const at = new Date().toISOString();
      tx.update(pick.ref, { pool: `${want}:assigned`, assignedTo: uid, assignedAt: at });
      tx.set(lockRef, { code: pick.id, offer: want, at });
      return { code: pick.id, offer: want, fresh: true };
    });
    if (got) {
      if (got.fresh) await logGrant(uid, 'offer_code', { offer: got.offer, ...(stale ? { replaced: true } : {}) });
      return { code: got.code, url: redeemUrl(got.code), offer: got.offer };
    }
  }
  throw new HttpsError('unavailable', '요청이 몰리고 있습니다. 잠시 후 다시 시도해주세요.');
}
