/**
 * 로그인 세션 — 사용자 문서 실시간 구독 + 기록 증분 동기화 (smiscamp AuthContext 와 같은 방식).
 *
 * 앱을 켜면
 *   1) 기기에 남은 사용자 문서(appStore.cachedUser)로 바로 화면을 연다 — 서버를 기다리지 않는다.
 *   2) users/{uid} 를 onSnapshot 으로 구독한다. 처음 1건, 그 뒤로는 바뀔 때만 읽는다.
 *      구독(sub)·프로필이 서버(Cloud Functions)나 다른 기기에서 바뀌어도 바로 반영된다.
 *   3) 플랜 1건 + 기록·체중은 기기에 있는 것보다 새 것만 받는다(새 것이 없으면 쿼리당 1건).
 *      사흘에 한 번은 통째로 받아, 다른 기기에서 늦게 올라온 옛 날짜 기록을 맞춘다.
 *   4) 구독 판정은 문서 값으로 한다(isProSub 가 만료 시각을 본다). 만료됐는데 문서가 아직 pro 일 때만
 *      subStatus 콜러블을 불러 서버가 정리하게 한다.
 *
 * 예전: 켤 때마다 사용자 문서 + 플랜 + 기록 60 + 체중 30 ≈ 92건 읽기 + subStatus 호출을 다 받을 때까지 스플래시.
 * 지금: 평소 4건 안팎, 스플래시는 기기 캐시로 바로 걷힌다.
 *
 * 로그아웃 · 계정 삭제는 logoutUser · deleteUserAccount 로 — 구독을 먼저 끊어야 권한 오류가 안 나고,
 * 서버가 지운 문서를 "없음"으로 보고 다시 만들지 않는다.
 */
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import type { User as FirebaseUser } from 'firebase/auth';
import { auth, db } from './firebase';
import {
  normalizeUser, ensureUserDoc, touchLastLogin, fetchPlan, logout, deleteAccount,
} from './authService';
import { getWorkoutLogs, getWorkoutLogsSince, getWeights, getWeightsSince } from './workoutService';
import { refreshSub } from './billingService';
import { logOutStore } from './storeIap';
import { flushPendingLogs, mergePendingIntoLogs } from './sync';
import { fetchActiveProject, fetchCheckins, fetchLatestAnalysis, saveAnalysis } from './bodyService';
import { useAuthStore } from '../stores/authStore';
import { useAppStore, waitForHydration } from '../stores/appStore';
import { isProSub } from '../utils/subscription';
import { showAlert } from '../utils/alert';
import { latestServerCreatedAt, mergeByCreatedAt, replaceWithFresh, userSignature } from '../utils/merge';
import type { User } from '../types';

/** 기기에 들고 있는 개수 — appStore partialize 와 같다 */
const LOGS_KEEP = 60;
const WEIGHTS_KEEP = 30;
/** 이 간격마다 기록·체중을 통째로 다시 받는다 */
const FULL_SYNC_EVERY_MS = 3 * 24 * 60 * 60 * 1000;
/** 포그라운드로 돌아왔을 때 이보다 오래됐으면 새 기록을 확인한다 */
const RESUME_REFRESH_MS = 30 * 60 * 1000;
/** lastLoginAt 쓰기 간격 — 쓸 때마다 구독에 읽기 1건이 붙는다 */
const LAST_LOGIN_EVERY_MS = 12 * 60 * 60 * 1000;
/** 기기 캐시도 없고 서버도 답이 없을 때(오프라인 첫 실행) 이만큼 기다린 뒤 최소 정보로 연다 */
const FIRST_SNAPSHOT_TIMEOUT_MS = 8_000;
/** 서버가 "문서 없음"이라 해도 가입 화면의 setDoc 이 곧 도착할 수 있다 — 그만큼 기다렸다가 만든다 */
const ENSURE_DELAY_MS = 1_500;

interface Live {
  gen: number;
  uid: string;
  fu: FirebaseUser;
  unsub: Unsubscribe | null;
  /** 구독이 오류로 끝났다 — 포그라운드 복귀 때 다시 붙인다 */
  dead: boolean;
  /** 이번 세션에서 문서를 한 번이라도 봤다 — 그 뒤에 사라지면(다른 기기에서 탈퇴) 다시 만들지 않는다 */
  seenDoc: boolean;
  /** 첫 확정 문서를 받고 할 일(lastLoginAt · 구독 정리)을 했다 */
  greeted: boolean;
  fallback: ReturnType<typeof setTimeout> | null;
  ensureTimer: ReturnType<typeof setTimeout> | null;
}

/** 계정이 바뀌거나 로그아웃하면 올라간다 — 늦게 도착한 옛 세션의 응답을 버리는 데 쓴다 */
let gen = 0;
let live: Live | null = null;
let lastRefreshAt = 0;
let refreshing: { gen: number; done: Promise<void> } | null = null;

const isCurrent = (g: number) => g === gen && live?.gen === g;

// ─── 시작 · 끝 ───────────────────────────────────────────────────────────

/** onAuthStateChanged(user) 에서 부른다 */
export async function startSession(fu: FirebaseUser): Promise<void> {
  const g = ++gen;
  stopListener();
  lastRefreshAt = 0;
  // 기기에 저장된 세션·대기열·캐시가 복원되기 전에 읽으면 빈 값을 보게 된다
  await waitForHydration();
  if (g !== gen) return;

  const app = useAppStore.getState();
  // 다른 계정의 기기 데이터는 버린다 (같은 계정이면 캐시가 그대로 남는다)
  app.setOwner(fu.uid);
  const cached = useAppStore.getState().cachedUser;
  const { setUser, setInitialized } = useAuthStore.getState();
  if (cached && cached.uid === fu.uid) {
    // 지난번 문서로 바로 연다 — 바뀐 게 있으면 구독이 곧 고친다
    setUser(cached);
    setInitialized(true);
  }
  // 아직 못 올린 운동 기록을 목록에 먼저 보인다
  mergePendingIntoLogs(fu.uid);

  live = {
    gen: g, uid: fu.uid, fu, unsub: null, dead: false, seenDoc: false, greeted: false,
    fallback: null, ensureTimer: null,
  };
  if (!useAuthStore.getState().isInitialized || useAuthStore.getState().user?.uid !== fu.uid) {
    live.fallback = setTimeout(() => openWithoutServer(g), FIRST_SNAPSHOT_TIMEOUT_MS);
  }
  listen(live);
  void refreshData(fu.uid, { force: true });
}

/** 구독을 끊고 진행 중인 응답을 버린다 (signedOut · 로그아웃 · 계정 삭제가 부른다) */
export function endSession(): void {
  gen++;
  stopListener();
  live = null;
  lastRefreshAt = 0;
}

/** onAuthStateChanged(null) 에서 부른다 — 화면을 로그인으로 돌리고 기기 데이터를 지운다 */
export async function signedOut(): Promise<void> {
  endSession();
  const g = gen;
  // 기기에 저장된 상태가 복원되기 전에 지우면 복원이 다시 덮어쓴다
  await waitForHydration();
  if (g !== gen) return; // 그 사이 다시 로그인했다
  useAuthStore.getState().setUser(null);
  useAppStore.getState().resetAll();
  useAuthStore.getState().setInitialized(true);
}

/** 포그라운드 복귀 — 대기 기록 재시도, 끊긴 구독 다시 붙이기, 오래됐으면 새 기록 확인 */
export function resumeSession(): void {
  const l = live;
  if (!l || auth.currentUser?.uid !== l.uid) return;
  if (l.dead) listen(l);
  flushPendingLogs(l.uid).catch(() => {});
  void refreshData(l.uid);
}

/** 로그아웃 — 구독을 먼저 끊는다(로그아웃 뒤 권한 오류가 구독으로 날아오지 않게) */
export async function logoutUser(): Promise<void> {
  endSession();
  // 스토어 결제 계정도 떼어 둔다 — 다음 로그인 계정에 이 사람의 구매가 붙지 않게
  void logOutStore();
  try {
    await logout();
  } catch (e) {
    // 로그아웃 실패 — 세션을 다시 붙인다
    if (auth.currentUser) void startSession(auth.currentUser);
    throw e;
  }
}

/** 계정 삭제 — 구독을 먼저 끊는다. 안 끊으면 서버가 지운 문서를 "없음"으로 보고 다시 만들 수 있다 */
export async function deleteUserAccount(): Promise<void> {
  endSession();
  try {
    await deleteAccount();
  } catch (e) {
    if (auth.currentUser) void startSession(auth.currentUser);
    throw e;
  }
}

// ─── 사용자 문서 구독 ─────────────────────────────────────────────────────

function stopListener() {
  const l = live;
  if (!l) return;
  l.unsub?.();
  l.unsub = null;
  if (l.fallback) clearTimeout(l.fallback);
  if (l.ensureTimer) clearTimeout(l.ensureTimer);
  l.fallback = null;
  l.ensureTimer = null;
}

function listen(l: Live) {
  l.unsub?.();
  l.dead = false;
  const g = l.gen;
  l.unsub = onSnapshot(
    doc(db, 'users', l.uid),
    (snap) => {
      if (!isCurrent(g)) return;
      if (!snap.exists()) {
        // 기기 캐시의 "없음"은 믿지 않는다(오프라인). 서버가 확인한 것만.
        if (snap.metadata.fromCache) return;
        // 이번 세션에 있던 문서가 사라졌다 = 다른 기기에서 탈퇴 등. 다시 만들지 않는다.
        if (l.seenDoc) {
          console.warn('[session] 사용자 문서가 사라졌습니다');
          return;
        }
        scheduleEnsure(l);
        return;
      }
      const data = snap.data();
      // 로컬 merge 쓰기만 얹힌 조각 문서(서버 문서를 받기 전) — 화면에 쓰지 않는다
      if (snap.metadata.hasPendingWrites && (data.role == null || data.createdAt == null)) return;
      l.seenDoc = true;
      if (l.ensureTimer) { clearTimeout(l.ensureTimer); l.ensureTimer = null; }
      if (l.fallback) { clearTimeout(l.fallback); l.fallback = null; }
      const u = normalizeUser(l.uid, data);
      applyUser(u);
      if (!l.greeted && !snap.metadata.hasPendingWrites) {
        l.greeted = true;
        greet(u);
      }
    },
    (err) => {
      if (!isCurrent(g)) return;
      console.warn('[session] 사용자 문서 구독이 끊겼습니다', err.code);
      l.dead = true;
      l.unsub = null;
      // 처음 열기 전이었다면 기다리지 않는다
      openWithoutServer(g);
    }
  );
}

/** 화면에 보이는 값과 다를 때만 바꾼다 (lastLoginAt 만 바뀐 알림은 다시 그리지 않는다) */
function applyUser(u: User) {
  const authState = useAuthStore.getState();
  const app = useAppStore.getState();
  const sig = userSignature(u);
  const shown = authState.user;
  if (!shown || shown.uid !== u.uid || userSignature(shown) !== sig) {
    authState.setUser(u);
  }
  const cached = app.cachedUser;
  if (!cached || cached.uid !== u.uid || userSignature(cached) !== sig) {
    app.setCachedUser(u);
  }
  // 온보딩에서 저장한 신체 정보 — 식단·코치·플랜 재생성이 모두 여기에 의존
  if (u.profile && JSON.stringify(u.profile) !== JSON.stringify(app.profile)) app.setProfile(u.profile);
  if (!authState.isInitialized) authState.setInitialized(true);
}

/** 첫 확정 문서를 받은 뒤 한 번 — 마지막 접속 기록, 만료된 구독 정리 */
function greet(u: User) {
  const last = Date.parse(u.lastLoginAt);
  if (!Number.isFinite(last) || Date.now() - last > LAST_LOGIN_EVERY_MS) {
    touchLastLogin(u.uid).catch(() => {});
  }
  const sub = u.sub;
  // 대기자 명단 — 인증된 가입 이메일이 명단에 있으면 서버가 프리미엄을 준다(계정당 한 번 확인)
  if (!sub?.waitlist && auth.currentUser?.uid === u.uid && auth.currentUser.emailVerified) {
    refreshSub({ claim: true })
      .then((next) => {
        if (!next || useAuthStore.getState().user?.uid !== u.uid) return;
        useAuthStore.getState().patchUser({ sub: next });
        if (next.waitlist === 'claimed') {
          showAlert('대기자 명단 혜택', '사전 신청해 주셔서 감사합니다. 프리미엄이 적용되었습니다.');
        }
      })
      .catch(() => {});
    return;
  }
  if (sub && sub.tier === 'pro' && !isProSub(sub) && sub.status !== 'expired') {
    // 서버가 정리하면 새 sub 가 구독으로 들어온다. 콜러블 응답도 바로 반영한다.
    refreshSub()
      .then((next) => {
        if (next && useAuthStore.getState().user?.uid === u.uid) useAuthStore.getState().patchUser({ sub: next });
      })
      .catch(() => {});
  }
}

/** 문서가 정말 없을 때(가입 직후 레이스 · 삭제 도중 실패한 계정) — 조금 기다렸다가 없으면 만든다 */
function scheduleEnsure(l: Live) {
  if (l.ensureTimer) return;
  const g = l.gen;
  l.ensureTimer = setTimeout(() => {
    l.ensureTimer = null;
    if (!isCurrent(g) || l.seenDoc) return;
    // 만든 문서는 이 구독으로 들어온다
    ensureUserDoc(l.fu).catch((e) => {
      console.warn('[session] 사용자 문서를 만들지 못했습니다', e);
      openWithoutServer(g);
    });
  }, ENSURE_DELAY_MS);
}

/**
 * 서버 답 없이 연다 — 기기 캐시가 있으면 그것, 없으면 최소 정보.
 * 캐시가 없으면 온보딩 여부를 알 수 없으므로 완료로 보고 홈(플랜 없음 화면)으로 보낸다.
 */
function openWithoutServer(g: number) {
  if (!isCurrent(g) || !live) return;
  const fu = live.fu;
  const { user, isInitialized, setUser, setInitialized } = useAuthStore.getState();
  if (user?.uid === fu.uid) {
    if (!isInitialized) setInitialized(true);
    return;
  }
  const cached = useAppStore.getState().cachedUser;
  const now = new Date().toISOString();
  setUser(
    cached && cached.uid === fu.uid
      ? cached
      : {
          uid: fu.uid,
          email: fu.email,
          displayName: fu.displayName,
          photoURL: fu.photoURL,
          authProvider: 'email',
          role: 'user',
          onboardingDone: true,
          profile: null,
          createdAt: now,
          lastLoginAt: now,
        }
  );
  setInitialized(true);
}

// ─── 플랜 · 기록 · 체중 ───────────────────────────────────────────────────

/**
 * 플랜 1건 + 기록·체중 증분. 동시에 한 번만 돈다. force 가 아니면 RESUME_REFRESH_MS 안에서는 건너뛴다.
 * 기기에 플랜이 없을 때만 hydrating 을 켠다(홈이 "플랜 없음" 대신 로딩을 보이게 — 빈 화면에서 루틴을 고르면
 * 서버 플랜을 덮어쓴다).
 */
export function refreshData(uid: string, opts: { force?: boolean } = {}): Promise<void> {
  const g = gen;
  if (refreshing && refreshing.gen === g) return refreshing.done;
  if (!opts.force && Date.now() - lastRefreshAt < RESUME_REFRESH_MS) return Promise.resolve();

  const entry: { gen: number; done: Promise<void> } = { gen: g, done: Promise.resolve() };
  refreshing = entry;
  entry.done = (async () => {
    const spinner = !useAppStore.getState().plan;
    if (spinner) useAuthStore.getState().setHydrating(true);
    try {
      // 하나가 실패해도 나머지는 살린다
      const [planR, logsR, weightsR] = await Promise.allSettled([
        fetchPlan(uid),
        syncLogs(uid, g),
        syncWeights(uid, g),
        syncBody(uid, g),
      ]);
      if (g !== gen) return;
      if (planR.status === 'fulfilled') useAppStore.getState().setPlan(planR.value);
      if (planR.status === 'fulfilled' || logsR.status === 'fulfilled' || weightsR.status === 'fulfilled') {
        lastRefreshAt = Date.now();
      }
    } finally {
      if (spinner) useAuthStore.getState().setHydrating(false);
      if (refreshing === entry) refreshing = null;
    }
    if (g !== gen) return;
    // 지난번에 서버 저장이 실패한 운동 기록 — 목록에 보이게 하고 다시 올린다
    mergePendingIntoLogs(uid);
    flushPendingLogs(uid).catch(() => {});
  })();
  return entry.done;
}

/**
 * 내 변화 프로젝트 — 기기 캐시가 원본처럼 쓰인다(분석은 이 기기에서 만들고, 프로젝트 · 판정은 콜러블 응답으로 받는다).
 * 서버에서 다시 받는 건 새 기기 · 재설치이거나 사흘이 지났을 때뿐 — 열 때마다 읽기를 쓰지 않는다.
 * 저장에 실패해 pending 으로 남은 분석은 여기서 다시 올린다.
 */
async function syncBody(uid: string, g: number): Promise<void> {
  const st0 = useAppStore.getState();
  if (st0.analysis?.pending && st0.analysis.userId === uid) {
    const a = st0.analysis;
    if (await saveAnalysis(a).catch(() => false)) {
      const cur = useAppStore.getState().analysis;
      if (g === gen && cur?.id === a.id) {
        const { pending: _p, ...rest } = cur;
        useAppStore.getState().setAnalysis(rest);
      }
    }
  }
  const { analysis, project, syncMarks } = useAppStore.getState();
  const stale = Date.now() - (syncMarks.bodyAt ?? 0) > FULL_SYNC_EVERY_MS;
  if (!stale && (analysis || project)) return;
  if (!stale && syncMarks.bodyAt) return; // 이미 받아 봤는데 없었다
  const [a, p] = await Promise.all([fetchLatestAnalysis(uid), fetchActiveProject(uid)]);
  if (g !== gen) return;
  const st = useAppStore.getState();
  // 기기에서 막 만든(아직 안 올라간) 분석은 서버 것으로 덮지 않는다
  if (a && !(st.analysis?.pending && st.analysis.createdAt > a.createdAt)) st.setAnalysis(a);
  st.setProject(p);
  if (p) {
    const cs = await fetchCheckins(uid, p.id);
    if (g === gen) useAppStore.getState().setCheckins(cs);
  }
  useAppStore.getState().setSyncMark('bodyAt', Date.now());
}

async function syncLogs(uid: string, g: number): Promise<void> {
  const { logs, syncMarks } = useAppStore.getState();
  const since = latestServerCreatedAt(logs);
  const full = !since || Date.now() - syncMarks.logsFullAt > FULL_SYNC_EVERY_MS;
  const fresh = full ? await getWorkoutLogs(uid, LOGS_KEEP) : await getWorkoutLogsSince(uid, since, LOGS_KEEP);
  if (g !== gen) return;
  const st = useAppStore.getState();
  if (full) {
    st.setLogs(replaceWithFresh(fresh, st.logs, LOGS_KEEP));
    st.setSyncMark('logsFullAt', Date.now());
  } else if (fresh.length) {
    st.setLogs(mergeByCreatedAt(fresh, st.logs, LOGS_KEEP));
  }
}

async function syncWeights(uid: string, g: number): Promise<void> {
  const { weights, syncMarks } = useAppStore.getState();
  const since = latestServerCreatedAt(weights);
  const full = !since || Date.now() - syncMarks.weightsFullAt > FULL_SYNC_EVERY_MS;
  const fresh = full ? await getWeights(uid, WEIGHTS_KEEP) : await getWeightsSince(uid, since, WEIGHTS_KEEP);
  if (g !== gen) return;
  const st = useAppStore.getState();
  if (full) {
    st.setWeights(replaceWithFresh(fresh, st.weights, WEIGHTS_KEEP));
    st.setSyncMark('weightsFullAt', Date.now());
  } else if (fresh.length) {
    st.setWeights(mergeByCreatedAt(fresh, st.weights, WEIGHTS_KEEP));
  }
}
