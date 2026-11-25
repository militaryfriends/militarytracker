import { create } from 'zustand';
import { User } from '../types';

interface AuthState {
  user: User | null;
  /** onAuthStateChanged 첫 응답 + 프로필/플랜 복원까지 끝났는지 */
  isInitialized: boolean;
  /**
   * 로그인 직후 플랜·기록을 서버에서 받아오는 중.
   * 이 동안 홈·운동 탭은 "플랜 없음" 대신 로딩을 보여준다 — 빈 상태에서 루틴을 고르면 기존 플랜을 덮어쓴다.
   */
  hydrating: boolean;
  /** 이 세션에서 서버 플랜을 한 번이라도 확인했는지(성공 · 실패 무관) — 그 전에는 '플랜 없음'을 보이지 않는다(검수 2) */
  planChecked: boolean;
  setPlanChecked: (v: boolean) => void;
  setUser: (user: User | null) => void;
  patchUser: (patch: Partial<User>) => void;
  setInitialized: (initialized: boolean) => void;
  setHydrating: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isInitialized: false,
  hydrating: false,
  planChecked: false,
  setPlanChecked: (planChecked) => set({ planChecked }),
  setUser: (user) => set({ user }),
  patchUser: (patch) => set((s) => (s.user ? { user: { ...s.user, ...patch } } : {})),
  setInitialized: (isInitialized) => set({ isInitialized }),
  setHydrating: (hydrating) => set({ hydrating }),
}));
