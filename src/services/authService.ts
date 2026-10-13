import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged,
  sendPasswordResetEmail,
  sendEmailVerification,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, writeBatch, runTransaction } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from './firebase';
import { User, UserProfile, Plan, UserStats } from '../types';
import { normalizePlan } from '../utils/planner';
import { normalizeSub } from '../utils/subscription';

const nowIso = () => new Date().toISOString();

function baseUserDoc(partial: Partial<User>): Omit<User, 'uid'> {
  return {
    email: partial.email ?? null,
    displayName: partial.displayName ?? null,
    photoURL: partial.photoURL ?? null,
    authProvider: partial.authProvider ?? 'email',
    role: 'user',
    onboardingDone: false,
    profile: null,
    createdAt: nowIso(),
    lastLoginAt: nowIso(),
  };
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string
): Promise<User> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  // 문서를 먼저 만든다 — 세션(session.ts)이 이 문서를 구독하기 시작하므로
  // updateProfile(네트워크) 뒤로 미루면 "문서 없음" 창이 넓어진다.
  const userData = baseUserDoc({ email, displayName, authProvider: 'email' });
  await setDoc(doc(db, 'users', credential.user.uid), userData);
  await updateProfile(credential.user, { displayName }).catch(() => {});
  // 무료 체험은 이메일 인증을 요구한다(서버). 발송 실패는 가입을 막지 않는다.
  sendEmailVerification(credential.user).catch(() => {});
  return { uid: credential.user.uid, ...userData };
}

/**
 * users/{uid} 문서가 없으면 만든다(멱등). 회원가입 직후 구독이 setDoc 보다 먼저 "없음"을 보거나,
 * 삭제 도중 실패한 계정이 남았을 때 세션(session.ts)이 부른다.
 * 트랜잭션 — 가입 화면의 setDoc 과 겹쳐도 있는 문서를 덮어쓰지 않는다. 문서는 구독으로 들어온다.
 */
export async function ensureUserDoc(fu: FirebaseUser): Promise<void> {
  const ref = doc(db, 'users', fu.uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) return;
    tx.set(
      ref,
      baseUserDoc({
        email: fu.email,
        displayName: fu.displayName,
        photoURL: fu.photoURL,
        authProvider: 'email',
      })
    );
  });
}

/**
 * 마지막 접속 시각. 세션이 12시간에 한 번만 부른다 — users 문서를 쓰면 구독에 읽기 1건이 다시 붙는다.
 * updateDoc: 문서가 없을 때 lastLoginAt 만 있는 조각 문서를 만들지 않는다(규칙도 거절한다).
 */
export async function touchLastLogin(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { lastLoginAt: nowIso() });
}

/** 인증 메일 재발송 */
export async function resendVerification(): Promise<void> {
  const u = auth.currentUser;
  if (!u) throw new Error('not signed in');
  await sendEmailVerification(u);
}

/** 인증 완료 여부를 토큰에 반영한다(email_verified 클레임은 새 토큰에만 실린다) */
export async function refreshIdToken(): Promise<boolean> {
  const u = auth.currentUser;
  if (!u) return false;
  await u.reload().catch(() => {});
  await u.getIdToken(true).catch(() => {});
  return u.emailVerified;
}

/**
 * 로그인만 한다. 사용자 문서는 세션(session.ts)이 구독으로 받고, 없으면 만들고, lastLoginAt 도 거기서 쓴다.
 * (예전엔 여기서 getDoc + setDoc 을 하고 _layout 이 또 getDoc 을 해서 로그인마다 같은 문서를 두 번 읽었다)
 */
export async function signInWithEmail(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, password);
}

/** 비밀번호 재설정 메일 발송. 존재하지 않는 계정도 동일하게 처리(계정 존재 여부 노출 방지) */
export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

/** 로그아웃 — 화면에서는 session.ts 의 logoutUser 를 쓴다(구독을 먼저 끊는다) */
export async function logout(): Promise<void> {
  await signOut(auth);
}

/** 개인 기록 요약(users.stats) — 최근 N건 로그 밖의 PR 도 잃지 않도록 클라이언트가 저장 시 갱신한다 */
function normalizeStats(raw: unknown): UserStats {
  const d = (raw ?? {}) as Partial<UserStats>;
  const pr: UserStats['pr'] = {};
  if (d.pr && typeof d.pr === 'object') {
    for (const [id, v] of Object.entries(d.pr as Record<string, unknown>)) {
      const x = v as { w?: unknown; r?: unknown; date?: unknown };
      const w = Number(x?.w), r = Number(x?.r);
      if (Number.isFinite(w) && Number.isFinite(r) && w >= 0 && r > 0) {
        pr[id] = { w, r, date: typeof x.date === 'string' ? x.date : '' };
      }
    }
  }
  return {
    pr,
    totalLogs: Math.max(0, Number(d.totalLogs) || 0),
    totalVolume: Math.max(0, Number(d.totalVolume) || 0),
  };
}

/** 서버 문서 → User. 빠진 칸·깨진 값이 있어도 앱이 죽지 않게 채운다 */
export function normalizeUser(uid: string, data: Record<string, unknown> | undefined): User {
  const d = (data ?? {}) as Partial<User>;
  return {
    uid,
    email: d.email ?? null,
    displayName: d.displayName ?? null,
    photoURL: d.photoURL ?? null,
    authProvider: d.authProvider ?? 'email',
    role: d.role === 'admin' ? 'admin' : 'user',
    onboardingDone: d.onboardingDone ?? false,
    profile: d.profile ?? null,
    // 구독은 서버(Cloud Functions)만 쓴다 — 여기서는 읽기만 한다
    sub: normalizeSub(d.sub),
    stats: normalizeStats(d.stats),
    createdAt: d.createdAt ?? nowIso(),
    lastLoginAt: d.lastLoginAt ?? nowIso(),
  };
}

/**
 * 계정 + 하위 데이터 전체 삭제 — 서버(accountDelete 콜러블, Admin SDK)가 지운다.
 * 클라이언트가 users 문서를 지울 수 있으면 구독·사용량을 초기화하는 우회로가 되므로
 * 보안 규칙에서 막았고, Admin SDK 는 "최근 로그인" 제약도 없다.
 * 서버가 auth 사용자를 지우면 onAuthStateChanged(null) 이 온다. 여기서는 signOut 만 보장한다.
 * 화면에서는 session.ts 의 deleteUserAccount 를 쓴다 — 구독을 먼저 끊지 않으면 지워진 문서를 "없음"으로 보고
 * 다시 만든다.
 */
export async function deleteAccount(): Promise<void> {
  if (!auth.currentUser) return;
  const call = httpsCallable(functions, 'accountDelete', { timeout: 120_000 });
  await call({});
  await signOut(auth).catch(() => {});
}

/** 프로필·플랜을 한 번에 기록 — 중간에 끊겨 '온보딩 완료인데 플랜 없음' 상태가 되지 않도록 */
export async function saveOnboarding(
  uid: string,
  profile: UserProfile,
  plan: Plan
): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid), { profile, onboardingDone: true }, { merge: true });
  batch.set(doc(db, 'plans', uid), { ...plan, updatedAt: nowIso() });
  await batch.commit();
}

export async function savePlan(uid: string, plan: Plan): Promise<void> {
  await setDoc(doc(db, 'plans', uid), { ...plan, updatedAt: nowIso() }, { merge: false });
}

/** 개인 기록 요약 저장 — 운동 로그 저장 직후 호출. 실패해도 로그 자체는 이미 저장돼 있다. */
export async function saveStats(uid: string, stats: UserStats): Promise<void> {
  await setDoc(doc(db, 'users', uid), { stats }, { merge: true });
}

export async function saveProfile(uid: string, profile: UserProfile): Promise<void> {
  await setDoc(doc(db, 'users', uid), { profile }, { merge: true });
}

export async function fetchPlan(uid: string): Promise<Plan | null> {
  const snap = await getDoc(doc(db, 'plans', uid));
  if (!snap.exists()) return null;
  return normalizePlan(snap.data() as Plan);
}

export function onAuthChange(callback: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, callback);
}
