/**
 * iOS 대기자 혜택 — App Store 일회용 오퍼 코드 창고 (2026-11-28 대표 결정: 무료 기간도 결제 수단 등록 뒤).
 *
 * 만들기:   App Store Connect › mt_pro_monthly › 오퍼 코드 '무료 3개월' · '무료 1개월' → 일회용 코드 CSV 를 내려받아
 *           앱 MY › 설정 › 관리자 › 대기자 명단 화면에 붙여 넣는다 → subGrant({ offerCodes: { offer, codes } }).
 *           (설정 순서: docs/대기자-혜택-스토어-설정.md)
 * 문서:     offerCodes/{코드} { platform: 'ios', offer: 'm3' | 'm1', pool: '<offer>:free' | '<offer>:assigned', at,
 *           assignedTo?, assignedAt? } — 규칙상 관리자 · 서버만 읽고 쓴다(firestore.rules 맨 끝 줄).
 *           pool 은 혜택 · 상태를 한 칸에 묶은 값이라 같음(==) 조건 하나로 찾는다(복합 색인이 필요 없다).
 * 나눠 주기: 대기자 자격(sub.waitlist === 'eligible')인 사람이 '무료로 시작'을 누르면 안 쓴 코드 하나를 그 계정에 묶는다.
 *           다시 누르면 같은 코드. 앱은 App Store 코드 사용 화면을 코드가 채워진 채로 연다 — 결제 수단 확인 · 등록은 애플이 한다.
 *           실제로 쓰였는지는 스토어 구독이 생기는 것으로 안다(revenuecat.ts 가 waitlist 를 'claimed' 로 바꾼다).
 */
import * as logger from 'firebase-functions/logger';
import { HttpsError } from 'firebase-functions/v2/https';
import { db, Subscription, logGrant } from './entitlement';
import { WaitlistOffer, offerOf, parseOfferCodes, redeemUrl } from './offerPure';

const COL = 'offerCodes';
/** 한 번에 가져올 수 있는 최대 코드 수 */
const MAX_IMPORT = 20000;

/** 관리자 가져오기 — 이미 있는 코드(나눠 준 것 포함)는 건드리지 않는다 */
export async function importOfferCodes(raw: unknown): Promise<{ added: number; skipped: number; offer: WaitlistOffer }> {
  const d = (raw ?? {}) as { offer?: unknown; codes?: unknown };
  if (d.offer !== 'm3' && d.offer !== 'm1') throw new HttpsError('invalid-argument', '혜택(3개월 · 1개월)을 골라 주세요.');
  const offer: WaitlistOffer = d.offer;
  const codes = parseOfferCodes(d.codes).slice(0, MAX_IMPORT);
  if (!codes.length) throw new HttpsError('invalid-argument', '코드를 찾지 못했습니다.');
  let added = 0;
  let skipped = 0;
  for (let i = 0; i < codes.length; i += 300) {
    const refs = codes.slice(i, i + 300).map((c) => db.collection(COL).doc(c));
    const snaps = await db.getAll(...refs);
    const batch = db.batch();
    snaps.forEach((s, k) => {
      if (s.exists) { skipped++; return; }
      batch.set(refs[k], { platform: 'ios', offer, pool: `${offer}:free`, at: new Date().toISOString() });
      added++;
    });
    await batch.commit();
  }
  return { added, skipped, offer };
}

/** 관리자 화면 — 혜택마다 남은 코드 · 나눠 준 코드 수 */
export async function offerCodeStats(): Promise<Record<WaitlistOffer, { free: number; assigned: number }>> {
  const count = async (pool: string): Promise<number> =>
    (await db.collection(COL).where('pool', '==', pool).count().get()).data().count;
  const [m3f, m3a, m1f, m1a] = await Promise.all(['m3:free', 'm3:assigned', 'm1:free', 'm1:assigned'].map(count));
  return { m3: { free: m3f, assigned: m3a }, m1: { free: m1f, assigned: m1a } };
}

/** 대기자 자격이 있는 계정에 코드 하나를 묶어 돌려준다. 이미 묶인 코드가 있으면 그것 */
export async function assignOfferCode(uid: string, sub: Subscription): Promise<{ code: string; url: string; offer: WaitlistOffer }> {
  if (sub.waitlist !== 'eligible') throw new HttpsError('failed-precondition', '대기자 혜택 대상이 아닙니다.');
  const want = offerOf(sub.waitlistDays);
  const got = await db.runTransaction(async (tx) => {
    const mine = await tx.get(db.collection(COL).where('assignedTo', '==', uid).limit(1));
    if (!mine.empty) {
      const doc = mine.docs[0];
      return { code: doc.id, offer: (doc.data().offer === 'm1' ? 'm1' : 'm3') as WaitlistOffer, fresh: false };
    }
    const free = await tx.get(db.collection(COL).where('pool', '==', `${want}:free`).limit(1));
    if (free.empty) return null;
    const doc = free.docs[0];
    tx.update(doc.ref, { pool: `${want}:assigned`, assignedTo: uid, assignedAt: new Date().toISOString() });
    return { code: doc.id, offer: want, fresh: true };
  });
  if (!got) {
    // 창고가 비었다 — 관리자가 App Store Connect 에서 코드를 더 만들어 넣어야 한다
    logger.error('offer code pool empty', { offer: want });
    throw new HttpsError('resource-exhausted', '대기자 혜택을 준비하고 있습니다. 잠시 후 다시 시도해주세요.');
  }
  if (got.fresh) await logGrant(uid, 'offer_code', { offer: got.offer });
  return { code: got.code, url: redeemUrl(got.code), offer: got.offer };
}
