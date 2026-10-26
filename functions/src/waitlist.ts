/**
 * 대기자 명단 혜택 — 출시 전 신청자(Tally 폼: 이름 · 이메일 · 휴대폰)에게 프리미엄을 준다.
 *
 * 명단은 waitlist/{해시} 문서로만 둔다. 이메일 · 번호 원문은 저장하지 않는다(해시만 — 신청 목적인
 * "출시 알림" 밖으로 개인정보를 늘리지 않으려고). 문서 { kind, days, claimedBy?, claimedAt? }.
 *  · 이메일: 인증된 가입 이메일이 명단에 있으면 subStatus({ claim: true }) 때 자동 지급
 *  · 휴대폰: 앱 "코드 입력" 칸에 번호를 넣으면 subRedeemPromo 가 여기로 넘긴다(시도 횟수 제한 공유)
 * 한 항목은 한 계정만, 한 계정은 한 번만 받는다. 기간은 max(지금 남은 기간, 오늘 + days) — 체험과 겹쳐 쌓이지 않는다.
 * 명단 넣기: 관리자가 subGrant({ waitlist: [{ email?, phone?, days }] }) (앱 MY › 관리자 · 대기자 명단).
 */
import { createHash } from 'crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { db, normalizeSub, isProSub, Subscription, addDays, logGrant } from './entitlement';

/** 명단 한 줄이 줄 수 있는 최대 일수 */
const MAX_WAITLIST_DAYS = 400;
const SALT = 'mt-waitlist-v1:';

export const normEmail = (v: unknown): string => String(v ?? '').trim().toLowerCase();
/** 010-1234-5678 · +82 10 1234 5678 → 01012345678 */
export function normPhone(v: unknown): string {
  let d = String(v ?? '').replace(/[^0-9]/g, '');
  if (d.startsWith('82')) d = `0${d.slice(2)}`;
  return d;
}
export const isPhone = (v: string): boolean => /^01[016789][0-9]{7,8}$/.test(v);
const isEmail = (v: string): boolean => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) && v.length <= 200;

const key = (kind: 'email' | 'phone', v: string) =>
  createHash('sha256').update(`${SALT}${kind}:${v}`).digest('hex');

export interface WaitlistRow { email?: unknown; phone?: unknown; days?: unknown }

/** 관리자 가져오기 — 같은 사람을 다시 넣어도 덮어쓰기만 한다(받은 기록은 유지) */
export async function importWaitlist(rows: unknown): Promise<{ added: number; skipped: number }> {
  const list = (Array.isArray(rows) ? rows : []).slice(0, 5000) as WaitlistRow[];
  let added = 0;
  let skipped = 0;
  let batch = db.batch();
  let n = 0;
  for (const r of list) {
    const days = Math.min(MAX_WAITLIST_DAYS, Math.max(1, Math.round(Number(r?.days ?? 90))));
    const email = normEmail(r?.email);
    const phone = normPhone(r?.phone);
    const targets: ['email' | 'phone', string][] = [];
    if (isEmail(email)) targets.push(['email', email]);
    if (isPhone(phone)) targets.push(['phone', phone]);
    if (!targets.length || !Number.isFinite(days)) { skipped++; continue; }
    for (const [kind, v] of targets) {
      batch.set(db.collection('waitlist').doc(key(kind, v)), { kind, days, at: new Date().toISOString() }, { merge: true });
      n++;
      if (n >= 400) { await batch.commit(); batch = db.batch(); n = 0; }
    }
    added++;
  }
  if (n) await batch.commit();
  return { added, skipped };
}

/**
 * 명단 항목 하나로 지급. 없는 항목이면 null.
 * 같은 사람이 이메일 · 번호 두 항목을 갖고 있어도 계정의 sub.waitlist === 'claimed' 라 한 번만 받는다.
 */
async function claim(uid: string, kind: 'email' | 'phone', value: string): Promise<Subscription | null> {
  const ref = db.collection('waitlist').doc(key(kind, value));
  const userRef = db.collection('users').doc(uid);
  const out = await db.runTransaction(async (tx) => {
    const [w, u] = await Promise.all([tx.get(ref), tx.get(userRef)]);
    const cur = normalizeSub(u.data()?.sub);
    if (!w.exists) return null;
    const d = w.data() as { days?: number; claimedBy?: string };
    if (cur.waitlist === 'claimed') throw new HttpsError('already-exists', '대기자 혜택은 이미 받았습니다.');
    if (d.claimedBy && d.claimedBy !== uid) throw new HttpsError('already-exists', '이미 다른 계정에서 받은 혜택입니다.');
    const days = Math.min(MAX_WAITLIST_DAYS, Math.max(1, Math.round(Number(d.days ?? 90))));
    const target = Date.parse(addDays(days));
    const curEnd = isProSub(cur) && cur.expiresAt ? Date.parse(cur.expiresAt) : 0;
    const next: Subscription = {
      tier: 'pro',
      // 스토어 구독 중이면 그 상태 · 기간을 그대로 둔다(스토어가 갱신한다)
      status: cur.source === 'ios' || cur.source === 'android' ? cur.status : 'active',
      expiresAt: cur.expiresAt === null && isProSub(cur) ? null : new Date(Math.max(target, curEnd)).toISOString(),
      source: cur.source === 'ios' || cur.source === 'android' ? cur.source : 'promo',
      productId: cur.source === 'ios' || cur.source === 'android' ? cur.productId : 'waitlist',
      trialUsed: cur.trialUsed,
      updatedAt: new Date().toISOString(),
      waitlist: 'claimed',
    };
    tx.set(userRef, { sub: next }, { merge: true });
    tx.set(ref, { claimedBy: uid, claimedAt: new Date().toISOString() }, { merge: true });
    return { sub: next, days };
  });
  if (!out) return null;
  await logGrant(uid, 'waitlist', { kind, days: out.days });
  return out.sub;
}

/** 인증된 이메일로 자동 확인 (subStatus). 한 계정에 한 번만 명단을 본다 */
export async function claimByEmail(uid: string, email: unknown, verified: boolean, cur: Subscription): Promise<Subscription | null> {
  if (cur.waitlist) return null;
  const e = normEmail(email);
  if (!verified || !isEmail(e)) return null;
  const sub = await claim(uid, 'email', e);
  if (sub) return sub;
  // 명단에 없음 — 다시 보지 않게 표시만 (번호로는 나중에 받을 수 있다)
  await db.collection('users').doc(uid).set({ sub: { ...cur, waitlist: 'none' } }, { merge: true });
  return null;
}

/** 코드 칸에 넣은 휴대폰 번호 (subRedeemPromo) */
export async function claimByPhone(uid: string, phone: string): Promise<Subscription | null> {
  return claim(uid, 'phone', phone);
}
