/**
 * 운동 로그 저장·동기화.
 *
 * 저장 한 번에 두 가지가 일어난다:
 *   1) workoutLogs 에 문서 추가
 *   2) users/{uid}.stats(개인 기록 요약) 갱신 — 앱은 최근 로그 일부만 들고 있어서
 *      오래된 PR·누적치는 여기서만 살아남는다
 *
 * 오프라인이면 쓰기가 끝나지 않는다(SDK 가 reject 하지 않고 대기). 그래서 saveWorkoutLog
 * 는 타임아웃으로 빠져나오고, 로그는 pendingLogs 에 남아 다음 기회(앱 시작, 포그라운드 복귀)에
 * 여기 flushPendingLogs 가 올린다. 문서 id 가 사용자+만든 시각(stableDocId)이라 타임아웃 뒤
 * SDK 큐가 먼저 커밋했어도 다시 올리면 같은 문서를 덮어쓸 뿐 중복이 생기지 않는다.
 * (예전 버전이 무작위 id 로 남긴 대기 기록 때문에 재시도 전 createdAt 확인은 남겨 둔다 — 대기 기록당 읽기 1건)
 */
import { FirestoreError } from 'firebase/firestore';
import { WorkoutLog } from '../types';
import { saveWorkoutLog, findLogByCreatedAt, SaveTimeout } from './workoutService';
import { saveStats } from './authService';
import { useAppStore } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import { nextStats } from '../utils/stats';

/** 저장 성공 후 stats 갱신 — 실패해도 로그는 이미 저장돼 있으니 조용히 넘긴다 */
async function bumpStats(uid: string, saved: WorkoutLog): Promise<void> {
  const { user, patchUser } = useAuthStore.getState();
  if (!user || user.uid !== uid) return;
  const past = useAppStore.getState().logs.filter((l) => l.createdAt !== saved.createdAt);
  const stats = nextStats(user.stats, saved, past);
  patchUser({ stats });
  await saveStats(uid, stats).catch(() => {});
}

/**
 * 로그 하나를 서버에 올리고 스토어에 반영한다.
 * 반환값 false = 아직 못 올렸고 pendingLogs 에 남아 있다.
 */
export async function persistLog(uid: string, log: Omit<WorkoutLog, 'id'>): Promise<boolean> {
  const { addLog, queuePending, dropPending } = useAppStore.getState();
  try {
    const saved = await saveWorkoutLog(log);
    dropPending(log.createdAt);
    addLog(saved);
    await bumpStats(uid, saved);
    return true;
  } catch (e) {
    if (!(e instanceof SaveTimeout)) {
      const code = (e as FirestoreError)?.code;
      // 규칙 거부 등 영구 실패는 다시 시도해도 같다 — 대기열에 두면 뒤의 정상 로그까지 막는다
      if (code === 'permission-denied' || code === 'invalid-argument') {
        console.warn('[persistLog] dropped', code);
        dropPending(log.createdAt);
        return false;
      }
    }
    queuePending(log);
    // 화면에는 바로 보이게 — 동기화 전 표시용 임시 id
    addLog({ ...log, id: `local-${log.createdAt}` });
    return false;
  }
}

let flushing = false;

/** 대기 중인 로그를 순서대로 올린다. 앱 시작·포그라운드 복귀·저장 직후에 부른다 */
export async function flushPendingLogs(uid: string): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const pending = useAppStore.getState().pendingLogs.filter((l) => l.userId === uid);
    for (const log of pending) {
      const { addLog, dropPending } = useAppStore.getState();
      // 이미 서버에 있으면(타임아웃 뒤 SDK 큐가 커밋 · 예전 버전의 무작위 id) 그걸로 대체
      const existing = await findLogByCreatedAt(uid, log.createdAt).catch(() => null);
      if (existing) {
        dropPending(log.createdAt);
        addLog(existing);
        await bumpStats(uid, existing);
        continue;
      }
      const ok = await persistLog(uid, log);
      if (!ok && useAppStore.getState().pendingLogs.some((l) => l.createdAt === log.createdAt)) {
        break; // 아직 오프라인 — 다음 기회에
      }
    }
  } finally {
    flushing = false;
  }
}

/** 서버 로그 목록에 아직 못 올린 로컬 로그를 합친다(재시작 후 기록 화면에서 사라지지 않게) */
export function mergePendingIntoLogs(uid: string): void {
  const { logs, pendingLogs, setLogs } = useAppStore.getState();
  const mine = pendingLogs.filter((l) => l.userId === uid);
  if (!mine.length) return;
  const have = new Set(logs.map((l) => l.createdAt));
  const extra = mine
    .filter((l) => !have.has(l.createdAt))
    .map((l) => ({ ...l, id: `local-${l.createdAt}` }));
  if (!extra.length) return;
  setLogs([...extra, ...logs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
}
