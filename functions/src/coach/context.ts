/**
 * 코치 신호 입력을 서버가 직접 모은다 — 앱이 보낸 요약은 믿을 수도 없고 짧다.
 * 읽기: users(프로필) · plans · workoutLogs 40 · weights 60 · bodyProjects(진행 중) · checkins 1.
 * 인덱스는 앱이 쓰는 것과 같은 (userId, createdAt|startedAt desc).
 */
import * as logger from 'firebase-functions/logger';
import { db } from '../entitlement';
import { FieldValue } from 'firebase-admin/firestore';
import { computeSignals, signalsText, type Phase, type SigLog, type SigProject, type SigWeight, type SignalKey, type SignalResult } from './signals';

const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : Number(x));

/** 앱이 보낸 종목 이름표 — 이름만 쓰고 길이 · 개수를 자른다 */
export function cleanExNames(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 80)) {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(k) || typeof v !== 'string') continue;
    const name = v.replace(/[<>\n\r]/g, '').trim().slice(0, 30);
    if (name) out[k] = name;
  }
  return out;
}

export async function loadSignals(uid: string, exNames: Record<string, string>, now = Date.now()): Promise<SignalResult | null> {
  try {
    const [userS, planS, logsS, weightsS, projS, chkS] = await Promise.all([
      db.collection('users').doc(uid).get(),
      db.collection('plans').doc(uid).get(),
      db.collection('workoutLogs').where('userId', '==', uid).orderBy('createdAt', 'desc').limit(40).get(),
      db.collection('weights').where('userId', '==', uid).orderBy('createdAt', 'desc').limit(60).get(),
      db.collection('bodyProjects').where('userId', '==', uid).orderBy('startedAt', 'desc').limit(3).get(),
      db.collection('checkins').where('userId', '==', uid).orderBy('createdAt', 'desc').limit(1).get(),
    ]);
    const profile = (userS.get('profile') ?? {}) as { days?: number; goal?: string; strategy?: string };
    const planDays = (planS.get('days') as unknown[] | undefined)?.length ?? 0;
    const fallbackPhase: Phase = profile.strategy === 'leanmass' || profile.strategy === 'bulk' ? 'gain'
      : profile.strategy === 'cut' || profile.strategy === 'cut_fast' ? 'cut'
        : profile.goal === 'cut' ? 'cut' : profile.goal === 'muscle' ? 'gain' : 'keep';

    const logs: SigLog[] = logsS.docs.map((d) => {
      const x = d.data();
      return {
        date: String(x.date ?? ''),
        createdAt: String(x.createdAt ?? ''),
        totalSets: num(x.totalSets) || 0,
        exercises: (Array.isArray(x.exercises) ? x.exercises : []).map((e: { id?: unknown; best?: { w?: unknown; r?: unknown } }) => ({
          id: String(e?.id ?? ''),
          best: e?.best ? { w: num(e.best.w), r: num(e.best.r) } : undefined,
        })),
      };
    });
    const weights: SigWeight[] = weightsS.docs.map((d) => {
      const x = d.data();
      return { date: String(x.date ?? ''), kg: num(x.kg), createdAt: typeof x.createdAt === 'string' ? x.createdAt : undefined };
    });
    const active = projS.docs.find((d) => d.get('status') === 'active');
    let project: SigProject | null = null;
    if (active) {
      const p = active.data();
      if (Array.isArray(p.track) && p.track.length) {
        project = {
          startedAt: String(p.startedAt),
          months: num(p.months) || 0,
          phases: Array.isArray(p.phases) ? p.phases : [],
          track: p.track.map((t: { weightKg?: unknown }) => ({ weightKg: num(t?.weightKg) })),
          trackOffset: num(p.trackOffset) || 0,
          startWeightKg: num(p.input?.weightKg),
        };
      }
    }
    const lastCheckinAt = chkS.docs[0]?.get('createdAt') ?? null;

    return computeSignals({
      now,
      targetDays: planDays || num(profile.days) || 3,
      fallbackPhase,
      logs,
      weights,
      project,
      lastCheckinAt: typeof lastCheckinAt === 'string' ? lastCheckinAt : null,
      exNames,
    });
  } catch (e) {
    // 신호가 없어도 코치는 답한다(앱이 보낸 <data> 로)
    logger.warn('coach signals failed', { uid, e: String(e) });
    return null;
  }
}

/**
 * 코치가 최근에 꺼낸 신호 — coachState/{uid} { said: { plateau: ISO, … } } (서버만 읽고 쓴다, 규칙의 기본 거부).
 * 같은 문제를 답마다 되풀이하지 않게 pickFocus 가 본다. 계정 삭제가 함께 지운다.
 */
export async function loadSaid(uid: string): Promise<Partial<Record<SignalKey, string>>> {
  try {
    const s = await db.collection('coachState').doc(uid).get();
    return (s.get('said') ?? {}) as Partial<Record<SignalKey, string>>;
  } catch {
    return {};
  }
}

export function markSaid(uid: string, key: SignalKey): Promise<unknown> {
  return db.collection('coachState').doc(uid)
    .set({ said: { [key]: new Date().toISOString() }, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    .catch((e) => logger.warn('coachState write failed', { uid, e: String(e) }));
}

export { signalsText };
