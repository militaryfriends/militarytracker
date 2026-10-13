/**
 * 온보딩 입력 중인 값 — 기기에 저장하지 않는다(앱을 다시 켜면 처음부터).
 * 화면이 나뉘어 있어서(O1~O5 · O6 분석 · O7 비교) 한곳에 모아 둔다.
 * O7 의 "허리둘레를 넣으면 더 정확해져요" 는 resume='body' 로 O3 에 돌아간다.
 */
import { create } from 'zustand';
import type { Plan, UserProfile } from '../types';
import type { GoalPick } from '../utils/bodyAnalysis';
import { localDate } from '../services/workoutService';

export type StepKey = 'basic' | 'goal' | 'body' | 'env' | 'food' | 'routine';

export interface InbodyDraft {
  on: boolean;
  bf: string;
  smm: string;
  /** YYYY-MM-DD */
  date: string;
}

export const DEFAULT_PROFILE: UserProfile = {
  sex: 'male', age: '', height: '', weight: '',
  goal: 'muscle', env: 'gym', days: 3, level: 1,
  food: 'convenience', allergy: '',
};

interface DraftState {
  profile: UserProfile;
  waist: string;
  inbody: InbodyDraft;
  /** O2 선택 — null 이면 아직 */
  pick: GoalPick | null;
  /** "체형보다 운동 습관이 먼저예요" — O3 · O6~O8 을 건너뛰고 기존 루틴 선택으로 */
  habit: boolean;
  /** 흐름 화면이 열릴 때 이 단계로 (한 번 쓰고 지운다) */
  resume: StepKey | null;
  /** 흐름을 이미 채웠는지 — 다시 열 때 프로필로 덮어쓰지 않게 */
  seeded: boolean;
  /** O6 "맞춤 루틴" 단계에서 만든 무료 자동 구성 플랜 — 거절하면 이걸로 시작한다 */
  localPlan: Plan | null;

  patch: (p: Partial<Omit<DraftState, 'patch' | 'reset' | 'setProfile'>>) => void;
  setProfile: <K extends keyof UserProfile>(k: K, v: UserProfile[K]) => void;
  reset: (seed?: Partial<Pick<DraftState, 'profile' | 'waist' | 'pick'>>) => void;
}

const empty = () => ({
  profile: DEFAULT_PROFILE,
  waist: '',
  inbody: { on: false, bf: '', smm: '', date: localDate() },
  pick: null,
  habit: false,
  resume: null,
  seeded: false,
  localPlan: null,
});

export const useOnboardDraft = create<DraftState>()((set) => ({
  ...empty(),
  patch: (p) => set(p),
  setProfile: (k, v) => set((s) => ({ profile: { ...s.profile, [k]: v } })),
  reset: (seed) => set({ ...empty(), ...seed, seeded: true }),
}));
