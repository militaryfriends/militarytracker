import {
  collection,
  doc,
  setDoc,
  query,
  where,
  orderBy,
  limit as fsLimit,
  getDocs,
} from 'firebase/firestore';
import { db } from './firebase';
import { WorkoutLog, WeightRecord, SetDetail } from '../types';
import { stableDocId } from '../utils/merge';

const nowIso = () => new Date().toISOString();

/** 로컬 시간 기준 YYYY-MM-DD (toISOString 은 UTC라 한국 새벽에 날짜가 밀린다) */
export function localDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export class SaveTimeout extends Error {}

/**
 * 서버 저장 확인을 이 시간까지만 기다린다.
 * Firestore JS SDK 의 addDoc 은 오프라인에서 reject 하지 않고 재접속까지 pending 이라,
 * 타임아웃이 없으면 오프라인 사용자는 무한 스피너를 본다.
 */
const SAVE_TIMEOUT_MS = 8_000;

/** 쓰기를 timeoutMs 까지만 기다린다 — 넘기면 SaveTimeout. SDK 의 쓰기는 큐에 남아 재접속 때 커밋될 수 있다 */
export function withTimeout<T>(write: Promise<T>, timeoutMs = SAVE_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SaveTimeout('save timeout')), timeoutMs);
  });
  return Promise.race([write, timeout]).finally(() => clearTimeout(timer));
}

// ─── Workout Logs ─────────────────────────────────────────────────────────
/**
 * 문서 id 는 사용자 + 만든 시각(stableDocId) — 타임아웃 뒤 SDK 큐가 먼저 커밋했든, 대기열에서 다시 올리든
 * 같은 문서를 덮어써서 중복 기록이 생기지 않는다. (예전 addDoc 은 재시도마다 새 문서가 생길 수 있었다)
 */
export async function saveWorkoutLog(log: Omit<WorkoutLog, 'id'>): Promise<WorkoutLog> {
  const id = stableDocId(log.userId, log.createdAt);
  return withTimeout(setDoc(doc(db, 'workoutLogs', id), log).then(() => ({ id, ...log })));
}

export async function getWorkoutLogs(userId: string, limitCount = 60): Promise<WorkoutLog[]> {
  return logsQuery(userId, null, limitCount);
}

/**
 * since(createdAt) 보다 나중 기록만 — 앱을 켤 때 기기 캐시 위에 새 것만 얹는다.
 * 새 기록이 없으면 읽기 1건(빈 결과도 1건으로 친다). 인덱스는 전체 조회와 같은 (userId, createdAt desc).
 */
export async function getWorkoutLogsSince(userId: string, since: string, limitCount = 60): Promise<WorkoutLog[]> {
  return logsQuery(userId, since, limitCount);
}

async function logsQuery(userId: string, since: string | null, limitCount: number): Promise<WorkoutLog[]> {
  const q = query(
    collection(db, 'workoutLogs'),
    where('userId', '==', userId),
    ...(since ? [where('createdAt', '>', since)] : []),
    orderBy('createdAt', 'desc'),
    fsLimit(limitCount)
  );
  const snap = await getDocs(q);
  const out: WorkoutLog[] = [];
  for (const d of snap.docs) {
    // 문서 하나가 깨졌다고 전체 기록을 잃지 않는다
    try { out.push(normalizeLog(d.id, d.data())); } catch { /* skip */ }
  }
  return out;
}

/** 같은 createdAt 의 로그가 이미 서버에 있는지 — 타임아웃 후 재시도의 중복 방지 */
export async function findLogByCreatedAt(userId: string, createdAt: string): Promise<WorkoutLog | null> {
  const q = query(
    collection(db, 'workoutLogs'),
    where('userId', '==', userId),
    where('createdAt', '==', createdAt),
    fsLimit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return normalizeLog(d.id, d.data());
}

const sanitizeDetail = (v: unknown): SetDetail[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const list = v
    .filter((x): x is SetDetail => !!x && typeof x === 'object')
    .map((x) => ({ w: Number(x.w) || 0, r: Number(x.r) || 0 }));
  return list.length ? list : undefined;
};

/** 구버전 문서(dayIdx·totalSets·detail 없음) 대비 정규화 */
export function normalizeLog(id: string, data: Record<string, unknown>): WorkoutLog {
  const d = data as Partial<WorkoutLog>;
  const rawEx = Array.isArray(d.exercises) ? d.exercises : [];
  const exercises = rawEx.filter((x) => !!x && typeof x === 'object' && typeof x.id === 'string').map((x) => {
    const detail = sanitizeDetail(x.detail);
    // 맨몸·시간 종목은 w=0 이 정상이다 — r 만 있으면 best 로 인정한다
    const best =
      x.best && Number(x.best.r) > 0 && Number(x.best.w) >= 0
        ? { w: Number(x.best.w) || 0, r: Number(x.best.r) }
        : undefined;
    return {
      id: x.id,
      sets: Math.max(0, Number(x.sets) || 0),
      volume: Math.max(0, Number(x.volume) || 0),
      // 세트별 수치는 '지난 기록'·개인기록 판정의 근거라 반드시 보존한다
      ...(detail ? { detail } : {}),
      ...(best ? { best } : {}),
    };
  });
  return {
    id,
    userId: d.userId ?? '',
    date: d.date ?? localDate(),
    dayIdx: typeof d.dayIdx === 'number' ? d.dayIdx : -1,
    dayName: d.dayName ?? '',
    exercises,
    totalSets: Number.isFinite(Number(d.totalSets)) && d.totalSets != null
      ? Number(d.totalSets) : exercises.reduce((a, x) => a + x.sets, 0),
    totalVolume: Number.isFinite(Number(d.totalVolume)) && d.totalVolume != null
      ? Number(d.totalVolume) : exercises.reduce((a, x) => a + x.volume, 0),
    durationSec: Math.max(0, Number(d.durationSec) || 0),
    createdAt: d.createdAt ?? nowIso(),
  };
}

// ─── Weight Records ───────────────────────────────────────────────────────
/**
 * 체중 저장. 오프라인이면 예전엔 끝나지 않는 스피너였다 — 8초 뒤 queued: true 로 돌려주고,
 * 쓰기는 SDK 큐에 남아 연결되면 올라간다(앱을 완전히 끄기 전까지).
 * queued 인 기록은 id 가 local- — 증분 동기화의 기준(latestServerCreatedAt)에서 빠지고,
 * 서버에 올라간 뒤 받으면 같은 createdAt 의 서버 것으로 바뀐다.
 */
export async function saveWeight(userId: string, kg: number): Promise<{ record: WeightRecord; queued: boolean }> {
  const createdAt = nowIso();
  const data: Omit<WeightRecord, 'id'> = { userId, date: localDate(), kg, createdAt };
  const id = stableDocId(userId, createdAt);
  try {
    await withTimeout(setDoc(doc(db, 'weights', id), data));
    return { record: { id, ...data }, queued: false };
  } catch (e) {
    if (e instanceof SaveTimeout) return { record: { id: `local-${createdAt}`, ...data }, queued: true };
    throw e;
  }
}

export async function getWeights(userId: string, limitCount = 30): Promise<WeightRecord[]> {
  return weightsQuery(userId, null, limitCount);
}

/** since(createdAt) 보다 나중 체중만 — getWorkoutLogsSince 와 같은 방식 */
export async function getWeightsSince(userId: string, since: string, limitCount = 30): Promise<WeightRecord[]> {
  return weightsQuery(userId, since, limitCount);
}

async function weightsQuery(userId: string, since: string | null, limitCount: number): Promise<WeightRecord[]> {
  const q = query(
    collection(db, 'weights'),
    where('userId', '==', userId),
    ...(since ? [where('createdAt', '>', since)] : []),
    orderBy('createdAt', 'desc'),
    fsLimit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WeightRecord, 'id'>) }));
}
