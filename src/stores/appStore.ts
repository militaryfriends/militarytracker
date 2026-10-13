import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  UserProfile, Plan, ExerciseSession, WorkoutLog, WeightRecord,
  DietPlan, LoggedExercise, SetDetail, SessionSummary, User,
  BodyAnalysis, BodyProject, Checkin,
} from '../types';
import { exById } from '../data/exercises';
import { localDate } from '../services/workoutService';
import { bestSet } from '../utils/stats';
import type { CoachMessage } from '../services/aiService';

export interface SessionState {
  dayIdx: number;
  dayName: string;
  exIdx: number;
  data: ExerciseSession[];
  startedAt: number;
  /** epoch ms — 마지막 입력 시각. 앱이 죽어 있던 시간을 운동 시간에서 빼는 데 쓴다 */
  lastActiveAt?: number;
  /** epoch ms — 휴식 종료 시각. 타임스탬프 기반이라 백그라운드에서도 정확 */
  restEndsAt: number | null;
}

/** 중단된 세션을 복구할 최대 시간 — 이보다 오래되면 기록만 남기고 닫는다 */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
/** 마지막 입력 후 이 시간이 지나면 운동이 끝난 것으로 본다(운동 시간 계산용) */
const IDLE_CUTOFF_MS = 10 * 60 * 1000;
/** 입력 상한 — 오타(99999kg)가 통계를 망가뜨리지 않게 */
const MAX_INPUT = 1000;
/** 코치 대화 보관 상한 — 서버는 최근 20턴만 쓰고, 무한히 쌓이면 persist 가 느려진다 */
const CHAT_KEEP = 40;

export interface SyncMarks {
  logsFullAt: number;
  weightsFullAt: number;
  /** 내 변화 프로젝트(분석 · 프로젝트 · 체크인)를 서버에서 마지막으로 받은 시각 — 저장본에 없으면 0 */
  bodyAt?: number;
}

const NO_SYNC: SyncMarks = { logsFullAt: 0, weightsFullAt: 0, bodyAt: 0 };

interface AppState {
  /** 기기에 저장된 데이터의 소유자 — 다른 계정으로 로그인하면 폐기한다 */
  ownerUid: string | null;
  /** 마지막으로 서버에서 받은 사용자 문서 — 오프라인 재시작 시 온보딩 여부·프로필을 복원한다 */
  cachedUser: User | null;

  profile: UserProfile | null;
  plan: Plan | null;

  session: SessionState | null;
  /** 운동 완료 직후 요약 */
  summary: SessionSummary | null;
  /** 서버 저장에 실패해 재시도를 기다리는 로그 — 기기에 함께 보존된다 */
  pendingLogs: Omit<WorkoutLog, 'id'>[];

  logs: WorkoutLog[];
  weights: WeightRecord[];

  diet: DietPlan | null;
  dietLoading: boolean;

  chat: CoachMessage[];
  chatBusy: boolean;

  /** 내 변화 프로젝트 — 마지막 분석(O6 결과). 거절해도 남아 홈 카드에서 다시 본다 */
  analysis: BodyAnalysis | null;
  /** 결제 후 진행 중인 프로젝트 (서버가 만든 문서의 기기 사본) */
  project: BodyProject | null;
  /** 이 프로젝트의 체크인 — 최신이 앞 */
  checkins: Checkin[];

  /**
   * 마지막으로 기록·체중을 "통째로" 받은 시각(epoch ms). 그 사이에는 기기 캐시보다 새 것만 받는다
   * (session.ts). 다른 기기에서 늦게 올라온 옛 날짜 기록은 통째로 받을 때 맞춰진다.
   */
  syncMarks: SyncMarks;

  setOwner: (uid: string | null) => void;
  setCachedUser: (u: User | null) => void;
  setProfile: (p: UserProfile | null) => void;
  setPlan: (plan: Plan | null) => void;

  /** 진행 중인 세션이 있으면 false 를 돌려준다(덮어쓰지 않는다). replace=true 면 덮어쓴다 */
  startSession: (dayIdx: number, replace?: boolean) => boolean;
  setVal: (si: number, field: 'w' | 'r', v: string) => void;
  toggleSet: (si: number) => void;
  addSet: () => void;
  removeSet: (si: number) => void;
  startRest: (sec: number) => void;
  stopRest: () => void;
  goToEx: (exIdx: number) => void;
  moveEx: (delta: number) => void;
  swapExercise: (newId: string) => void;
  appendExercise: (newId: string) => boolean;
  /** 저장할 로그를 만들어 반환. 세션은 아직 지우지 않는다 */
  buildLog: (userId: string) => Omit<WorkoutLog, 'id'> | null;
  /** 저장이 끝난 뒤 세션을 닫는다 */
  closeSession: () => void;
  clearSession: () => void;
  setSummary: (s: SessionSummary | null) => void;
  pruneSession: () => void;

  queuePending: (log: Omit<WorkoutLog, 'id'>) => void;
  dropPending: (createdAt: string) => void;

  addLog: (log: WorkoutLog) => void;
  setLogs: (logs: WorkoutLog[]) => void;
  addWeight: (w: WeightRecord) => void;
  setWeights: (ws: WeightRecord[]) => void;

  setSyncMark: (key: keyof SyncMarks, at: number) => void;

  setDiet: (d: DietPlan | null) => void;
  setDietLoading: (v: boolean) => void;

  addChat: (msg: CoachMessage) => void;
  clearChat: () => void;
  setChatBusy: (v: boolean) => void;

  setAnalysis: (a: BodyAnalysis | null) => void;
  setProject: (p: BodyProject | null) => void;
  setCheckins: (list: Checkin[]) => void;

  resetAll: () => void;
}

/** 입력 문자열 → 숫자. '62,5' 도 받고, 음수·과대값은 잘라낸다 */
const num = (v: string): number => {
  const n = parseFloat(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(MAX_INPUT, n);
};

/** 세션 → 저장용 로그. buildLog 와 TTL 정리가 같이 쓴다 */
function logFromSession(s: SessionState, userId: string): Omit<WorkoutLog, 'id'> {
  const exercises: LoggedExercise[] = s.data.map((x) => {
    // 무게·횟수가 모두 비어 있는 세트는 기록으로 치지 않는다
    const done = x.sets.filter((t) => t.done && (num(t.w) > 0 || num(t.r) > 0));
    const detail: SetDetail[] = done.map((t) => ({ w: num(t.w), r: num(t.r) }));
    const best = bestSet(detail);
    return {
      id: x.id,
      sets: done.length,
      volume: Math.round(detail.reduce((a, d) => a + d.w * d.r, 0)),
      ...(detail.length ? { detail } : {}),
      ...(best ? { best } : {}),
    };
  });

  // 앱이 죽어 있던 시간은 운동 시간에 넣지 않는다 — 마지막 입력 + 10분에서 끊는다
  const end = Math.min(Date.now(), (s.lastActiveAt ?? s.startedAt) + IDLE_CUTOFF_MS);
  return {
    userId,
    // 자정 넘겨 끝난 운동은 시작한 날의 기록이다
    date: localDate(new Date(s.startedAt)),
    dayIdx: s.dayIdx,
    dayName: s.dayName,
    exercises,
    totalSets: exercises.reduce((a, x) => a + x.sets, 0),
    totalVolume: exercises.reduce((a, x) => a + x.volume, 0),
    durationSec: Math.max(0, Math.round((end - s.startedAt) / 1000)),
    createdAt: new Date().toISOString(),
  };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ownerUid: null,
      cachedUser: null,
      profile: null,
      plan: null,
      session: null,
      summary: null,
      pendingLogs: [],
      logs: [],
      weights: [],
      diet: null,
      dietLoading: false,
      chat: [],
      chatBusy: false,
      analysis: null,
      project: null,
      checkins: [],
      syncMarks: NO_SYNC,

      setOwner: (uid) => {
        // 다른 계정이 로그인하면 기기에 남은 이전 사용자 데이터를 폐기한다.
        // pendingLogs 는 로그마다 userId 가 있어 남겨 둔다 — 그 계정이 다시 로그인하면 올라간다.
        if (uid && get().ownerUid && get().ownerUid !== uid) {
          set({
            cachedUser: null, profile: null, plan: null, logs: [], weights: [],
            session: null, summary: null, diet: null, chat: [], syncMarks: NO_SYNC,
            analysis: null, project: null, checkins: [],
          });
        }
        set({ ownerUid: uid });
      },
      setCachedUser: (u) => set({ cachedUser: u }),

      setProfile: (p) => set({ profile: p }),
      setPlan: (plan) => set({ plan }),

      startSession: (dayIdx, replace = false) => {
        const { plan, session } = get();
        if (session && !replace) return false;
        const day = plan?.days[dayIdx];
        if (!day || !day.ids.length) return false;
        const data: ExerciseSession[] = day.ids
          .filter((id) => !!exById(id))
          .map((id) => {
            const count = exById(id)?.s ?? 3;
            return { id, sets: Array.from({ length: count }, () => ({ w: '', r: '', done: false })) };
          });
        if (!data.length) return false;
        set({
          summary: null,
          session: {
            dayIdx, dayName: day.name, exIdx: 0, data,
            startedAt: Date.now(), lastActiveAt: Date.now(), restEndsAt: null,
          },
        });
        return true;
      },

      setVal: (si, field, v) => {
        const s = get().session;
        if (!s) return;
        const data = s.data.map((ex, ei) =>
          ei === s.exIdx
            ? { ...ex, sets: ex.sets.map((st, i) => (i === si ? { ...st, [field]: v } : st)) }
            : ex
        );
        set({ session: { ...s, data, lastActiveAt: Date.now() } });
      },

      toggleSet: (si) => {
        const s = get().session;
        if (!s) return;
        const justDone = !s.data[s.exIdx].sets[si].done;
        const data = s.data.map((ex, ei) =>
          ei === s.exIdx
            ? { ...ex, sets: ex.sets.map((st, i) => (i === si ? { ...st, done: !st.done } : st)) }
            : ex
        );
        const restSec = exById(s.data[s.exIdx].id)?.rest ?? 75;
        // 체크를 풀 때는 진행 중인 휴식을 건드리지 않는다
        set({
          session: {
            ...s, data, lastActiveAt: Date.now(),
            restEndsAt: justDone ? Date.now() + restSec * 1000 : s.restEndsAt,
          },
        });
      },

      addSet: () => {
        const s = get().session;
        if (!s) return;
        const data = s.data.map((ex, ei) =>
          ei === s.exIdx ? { ...ex, sets: [...ex.sets, { w: '', r: '', done: false }] } : ex
        );
        set({ session: { ...s, data } });
      },

      removeSet: (si) => {
        const s = get().session;
        if (!s) return;
        const data = s.data.map((ex, ei) =>
          ei === s.exIdx && ex.sets.length > 1
            ? { ...ex, sets: ex.sets.filter((_, i) => i !== si) }
            : ex
        );
        set({ session: { ...s, data } });
      },

      startRest: (sec) => {
        const s = get().session;
        if (!s) return;
        set({ session: { ...s, restEndsAt: Date.now() + sec * 1000 } });
      },

      stopRest: () => {
        const s = get().session;
        if (!s) return;
        set({ session: { ...s, restEndsAt: null } });
      },

      goToEx: (exIdx) => {
        const s = get().session;
        if (!s) return;
        const idx = Math.max(0, Math.min(s.data.length - 1, exIdx));
        set({ session: { ...s, exIdx: idx } });
      },

      moveEx: (delta) => get().goToEx((get().session?.exIdx ?? 0) + delta),

      swapExercise: (newId) => {
        const s = get().session;
        const target = exById(newId);
        if (!s || !target) return;
        if (s.data.some((x, i) => x.id === newId && i !== s.exIdx)) return; // 중복 방지
        const data = s.data.map((ex, ei) => {
          if (ei !== s.exIdx) return ex;
          const keep = ex.sets.length || target.s;
          return {
            id: newId,
            sets: Array.from({ length: keep }, () => ({ w: '', r: '', done: false })),
          };
        });
        set({ session: { ...s, data } });
      },

      appendExercise: (newId) => {
        const s = get().session;
        const target = exById(newId);
        if (!s || !target) return false;
        if (s.data.some((x) => x.id === newId)) return false; // 이미 있는 종목
        const data = [
          ...s.data,
          { id: newId, sets: Array.from({ length: target.s }, () => ({ w: '', r: '', done: false })) },
        ];
        set({ session: { ...s, data, exIdx: data.length - 1 } });
        return true;
      },

      buildLog: (userId) => {
        const s = get().session;
        return s ? logFromSession(s, userId) : null;
      },

      closeSession: () => set({ session: null }),
      clearSession: () => set({ session: null, summary: null }),
      setSummary: (summary) => set({ summary }),

      pruneSession: () => {
        const s = get().session;
        if (!s || Date.now() - s.startedAt <= SESSION_TTL_MS) return;
        // 입력한 세트가 있으면 버리지 않고 저장 대기열로 옮긴다 (다음 실행에서 서버로 올라간다)
        const uid = get().ownerUid;
        const log = uid ? logFromSession(s, uid) : null;
        if (log && log.totalSets > 0) {
          set((st) => ({ session: null, pendingLogs: [...st.pendingLogs, log] }));
        } else {
          set({ session: null });
        }
      },

      queuePending: (log) =>
        set((s) => (
          s.pendingLogs.some((l) => l.createdAt === log.createdAt)
            ? {}
            : { pendingLogs: [...s.pendingLogs, log] }
        )),
      dropPending: (createdAt) =>
        set((s) => ({ pendingLogs: s.pendingLogs.filter((l) => l.createdAt !== createdAt) })),

      addLog: (log) =>
        set((s) => ({ logs: [log, ...s.logs.filter((l) => l.createdAt !== log.createdAt)] })),
      setLogs: (logs) => set({ logs }),
      addWeight: (w) =>
        set((s) => ({ weights: [w, ...s.weights.filter((x) => !w.createdAt || x.createdAt !== w.createdAt)] })),
      setWeights: (ws) => set({ weights: ws }),
      setSyncMark: (key, at) => set((s) => ({ syncMarks: { ...s.syncMarks, [key]: at } })),

      setDiet: (d) => set({ diet: d }),
      setDietLoading: (v) => set({ dietLoading: v }),

      addChat: (msg) => set((s) => ({ chat: [...s.chat, msg].slice(-CHAT_KEEP) })),
      clearChat: () => set({ chat: [] }),
      setChatBusy: (v) => set({ chatBusy: v }),

      setAnalysis: (a) => set({ analysis: a }),
      setProject: (p) => set((s) => ({
        project: p,
        // 다른 프로젝트로 바뀌면 이전 체크인은 화면에 남기지 않는다
        checkins: p && s.project?.id === p.id ? s.checkins : [],
      })),
      setCheckins: (list) => set({ checkins: list.slice(0, 12) }),

      // 로그아웃. pendingLogs 는 userId 가 붙어 있으니 남긴다 — 다시 로그인하면 올라간다.
      resetAll: () =>
        set({
          ownerUid: null, cachedUser: null, profile: null, plan: null,
          session: null, summary: null,
          logs: [], weights: [],
          diet: null, dietLoading: false,
          chat: [], chatBusy: false,
          analysis: null, project: null, checkins: [],
          syncMarks: NO_SYNC,
        }),
    }),
    {
      name: 'mt-app-store',
      storage: createJSONStorage(() => AsyncStorage),
      // 유실되면 안 되는 것(session/pendingLogs)과, 오프라인 재시작 때 화면을 채울
      // 캐시(cachedUser/profile/plan/logs/weights)를 기기에 남긴다.
      // 캐시는 서버 응답이 오면 덮어쓴다 — 원본은 언제나 서버다.
      partialize: (s) => ({
        ownerUid: s.ownerUid,
        cachedUser: s.cachedUser,
        profile: s.profile,
        plan: s.plan,
        logs: s.logs.slice(0, 60),
        weights: s.weights.slice(0, 30),
        session: s.session,
        pendingLogs: s.pendingLogs,
        diet: s.diet,
        chat: s.chat,
        syncMarks: s.syncMarks,
        analysis: s.analysis,
        project: s.project,
        checkins: s.checkins,
      }),
      version: 3,
      migrate: (persisted, version) => {
        // v1 에는 ownerUid·pendingLogs 가 없었다 — 소유자 불명이므로 폐기한다
        if (version < 2) return { ownerUid: null, session: null, pendingLogs: [], diet: null, chat: [] };
        // v2 → v3: 캐시 필드가 추가됐을 뿐이라 그대로 쓴다.
        // syncMarks 처럼 나중에 더한 칸은 저장본에 없으면 초기값이 남는다(persist 의 얕은 병합) — 버전을 올리지 않았다.
        return persisted as never;
      },
      onRehydrateStorage: () => (state) => {
        state?.pruneSession();
      },
    }
  )
);

export const hasHydrated = () => useAppStore.persist.hasHydrated();

/** persist 복원이 끝날 때까지 기다린다 — onAuthChange 가 저장된 세션·대기열을 읽기 전에 호출 */
export function waitForHydration(): Promise<void> {
  if (useAppStore.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useAppStore.persist.onFinishHydration(() => { unsub(); resolve(); });
  });
}
