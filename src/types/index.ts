import type { Part, Place } from '../data/exercises';
import type { BodyComp, Coord, InbodyInput } from '../utils/bodyComp';
import type { MonthPoint, Nutrition, Phase, PhaseSpan, Project } from '../utils/projection';
import type { AnalysisGap, AnalysisGoal, AnalysisInput } from '../utils/bodyAnalysis';

// ─── Auth / User ───────────────────────────────────────────────────────────
export type Role = 'user' | 'admin';

// ─── Subscription ──────────────────────────────────────────────────────────
export type PlanTier = 'free' | 'pro';
/** canceled = 해지했지만 기간은 남음, grace = 결제 실패 유예 */
export type SubStatus = 'none' | 'trial' | 'active' | 'grace' | 'expired' | 'canceled';
export type SubSource = 'none' | 'ios' | 'android' | 'promo' | 'admin';

/**
 * users/{uid}.sub — 서버(Cloud Functions)만 쓴다.
 * 보안 규칙이 클라이언트의 sub 수정을 막고 있으므로, 앱에서 이 값을 바꿔도
 * 저장되지 않는다. 실제 권한 판정도 서버가 다시 한다.
 */
export interface Subscription {
  tier: PlanTier;
  status: SubStatus;
  /** ISO. null 이면 만료 없음(관리자 지급) */
  expiresAt: string | null;
  source: SubSource;
  productId: string | null;
  /** 무료 체험을 이미 사용했는지 — 재발급 방지 */
  trialUsed: boolean;
  updatedAt: string;
}

/**
 * users/{uid}.stats — 개인 기록 요약. 클라이언트가 로그 저장 직후 갱신한다.
 * 앱은 최근 로그 일부만 불러오므로, 오래된 PR 과 누적치는 여기서 읽는다.
 */
export interface UserStats {
  /** exId → 역대 최고 세트 (맨몸/시간 종목은 w=0, r 최대) */
  pr: Record<string, { w: number; r: number; date: string }>;
  totalLogs: number;
  totalVolume: number;
}

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  authProvider: 'email' | 'google';
  /** 'admin' 인 계정은 보안 규칙에서 전체 권한을 가진다 */
  role: Role;
  onboardingDone: boolean;
  /** 온보딩에서 저장된 신체·목표 정보 (콜드스타트 시 복원용) */
  profile?: UserProfile | null;
  /** 구독 상태 — 서버 전용 필드 */
  sub?: Subscription | null;
  /** 개인 기록 요약 — 클라이언트가 로그 저장 시 갱신 */
  stats?: UserStats;
  createdAt: string;
  lastLoginAt: string;
}

// ─── Onboarding Profile ────────────────────────────────────────────────────
export type Goal = 'muscle' | 'cut' | 'habit';
export type Level = 1 | 2 | 3;
export type FoodEnv = 'convenience' | 'self' | 'family' | 'out';

export interface UserProfile {
  sex: 'male' | 'female';
  age: string;
  height: string;
  weight: string;
  goal: Goal;
  env: Place;
  days: 2 | 3 | 4 | 5 | 6;
  level: Level;
  food: FoodEnv;
  allergy: string;
  /** 허리둘레(cm) — O3 권장 입력. 체성분 추정 정확도를 '좋음'으로 올린다 */
  waistCm?: number;
  /** O2 에서 고른 목표 체형 카드 id ('m_lean' 등). 습관 경로·추천받기면 없음 */
  goalArchetypeId?: string;
}

// ─── Plan ──────────────────────────────────────────────────────────────────
export interface PlanDay {
  id: string;
  name: string;
  focus: string;
  ids: string[];
}

export interface Plan {
  routineId?: string | null;
  days: PlanDay[];
  planSrc: 'AI' | 'LOCAL' | 'PRESET';
  planReason: string;
  updatedAt?: string;
}

// ─── Session / Workout Log ─────────────────────────────────────────────────
export interface SetRecord {
  w: string;
  r: string;
  done: boolean;
}

export interface ExerciseSession {
  id: string;
  sets: SetRecord[];
}

/** 완료된 한 세트의 실제 수치 */
export interface SetDetail {
  w: number;
  r: number;
}

export interface LoggedExercise {
  id: string;
  /** 완료한 세트 수 */
  sets: number;
  /** Σ(무게 × 반복) — 맨몸/시간 종목은 0 */
  volume: number;
  /** 완료 세트별 수치 — 다음 세션에서 "지난 기록"으로 보여준다 */
  detail?: SetDetail[];
  /** 그날의 최고 세트 (추정 1RM 기준) */
  best?: SetDetail;
}

export interface WorkoutLog {
  id?: string;
  userId: string;
  /** YYYY-MM-DD (로컬 기준) */
  date: string;
  dayIdx: number;
  dayName: string;
  exercises: LoggedExercise[];
  totalSets: number;
  totalVolume: number;
  durationSec: number;
  createdAt: string;
}

/** 운동 완료 직후 보여줄 요약 */
export interface SessionSummary {
  dayName: string;
  totalSets: number;
  totalVolume: number;
  durationSec: number;
  exercises: LoggedExercise[];
  /** 개인 기록을 갱신한 종목 id 목록 */
  prIds: string[];
  saved: boolean;
}

// ─── Weight ────────────────────────────────────────────────────────────────
export interface WeightRecord {
  id?: string;
  userId: string;
  date: string;
  kg: number;
  createdAt?: string;
}

// ─── Diet ──────────────────────────────────────────────────────────────────
export interface MealItem {
  t: string;
  m: string;
  k: string;
}

export interface DietPlan {
  meals: MealItem[];
  tip: string;
  src?: 'AI' | 'LOCAL';
  /** 생성 시점 — 오래된 식단인지 표시하는 데 사용 */
  createdAt?: string;
  /** 내 변화 프로젝트 식단 — 서버가 지금 단계로 정한 하루 목표(엔진 값). 끼니별 k 도 서버가 쓴다 */
  target?: { kcal: number; protein: number; carb: number; fat: number; phase: Phase };
}

// ─── Body Stats (computed) ────────────────────────────────────────────────
export interface BodyStats {
  bmi: string;
  bodyType: string;
  tdee: number;
  /** TDEE 계산에 쓴 활동계수 (주 운동 일수 기준) */
  activityFactor: number;
  kcal: number;
  tagline: string;
  protein: number;
  fat: number;
  carb: number;
  /** 실제 계산에 사용한 체중 */
  weightUsed: number;
  /** trend = 최근 체중 기록의 추세값, profile = 저장된 기준 체중 */
  weightSrc: 'trend' | 'profile';
}

// ─── Report ────────────────────────────────────────────────────────────────
export type PartVolume = Record<Part, number>;

// ─── 내 변화 프로젝트 (체형 예측) ─────────────────────────────────────────────
// 숫자는 전부 결정론적 엔진(src/utils/bodyComp.ts · projection.ts · bodyAnalysis.ts)이 계산한다.
// AI 는 이 숫자를 받아 루틴·식단·설명 글로 바꾸기만 한다.

/** 결제 전 분석 결과를 보고 고른 것 */
export type AnalysisDecision = 'pending' | 'started' | 'declined';

/** 저장용 프로젝트 — 트랙은 빼고(같은 입력으로 다시 계산된다) */
export type StoredProject = Omit<Project, 'track'>;

/** bodyAnalyses/{id} — 온보딩 O6 결과. 재분석할 때마다 새 문서. 본인이 쓴다 */
export interface BodyAnalysis {
  id: string;
  userId: string;
  createdAt: string;
  engineVersion: string;
  input: AnalysisInput;
  comp: BodyComp;
  coord: Coord;
  cell: string;
  goal: AnalysisGoal;
  gap: AnalysisGap;
  order: string;
  /** 0~24개월 */
  track: MonthPoint[];
  reachedAt: number | null;
  projects: StoredProject[];
  decision: AnalysisDecision;
  /** 기기에만 — 서버 저장이 아직 안 됐다 (재시도 대상) */
  pending?: boolean;
}

export type ProjectStatus = 'active' | 'paused' | 'done' | 'abandoned';

/** bodyProjects/{id} — 결제 후 시작된 프로젝트. 서버(projectStart)만 만들고 바꾼다 */
export interface BodyProject {
  id: string;
  userId: string;
  analysisId: string;
  /** 분석의 p1 · p2 */
  projectRefId: string;
  status: ProjectStatus;
  startedAt: string;
  name: string;
  months: number;
  kind: Project['kind'];
  goal: AnalysisGoal;
  /** 시작 체성분 */
  baseline: BodyComp;
  input: AnalysisInput;
  /** 예측 트랙 — trackOffset 개월째부터의 값 (재계산하면 바뀐다) */
  track: MonthPoint[];
  trackOffset: number;
  trackHistory: { at: string; offset: number; track: MonthPoint[] }[];
  end: StoredProject['end'];
  phases: PhaseSpan[];
  nutrition: Nutrition;
  lastCheckinId?: string | null;
  engineVersion: string;
}

export type CheckinStatus = 'ahead' | 'on' | 'behind';

/** checkins/{id} — 4주마다. 본인이 쓰고, 상태 판정은 서버(aiReport)가 다시 한다 */
export interface Checkin {
  id: string;
  userId: string;
  projectId: string;
  /** YYYY-MM-DD */
  date: string;
  createdAt: string;
  /** 프로젝트 시작 후 몇 개월째 체크인인지 (1, 2, …) */
  monthIndex: number;
  weightKg: number;
  waistCm?: number;
  inbody?: InbodyInput;
  comp: BodyComp;
  coord: Coord;
  cell: string;
  expectedProgressPct: number;
  measuredProgressPct: number;
  status: CheckinStatus;
  reportId?: string | null;
}

/** AI 월간 리포트 — functions 에서 형식 검증, 실패 시 1회 재시도 후 템플릿 */
export interface BodyReportBody {
  headline: string;
  wins: string[];
  adjust: string[];
  nextFocus: string;
  planChange: 'none' | 'suggest';
}

/**
 * 서버(aiReport)가 다시 판정한 값. 체크인 문서는 본인이 고칠 수 있으므로
 * 다음 체크인의 "직전 값"(체성분 · 연속 뒤처짐)은 이쪽을 읽는다.
 */
export interface CheckinJudgement {
  status: CheckinStatus;
  expectedProgressPct: number;
  measuredProgressPct: number;
  comp: BodyComp;
  coord: Coord;
  cell: string;
  weightKg: number;
  /** 직전 판정의 체중(첫 체크인이면 시작 체중) */
  prevWeightKg: number;
  monthIndex: number;
  /** 이 체크인에서 완료 예상을 다시 계산했다 */
  recalculated: { delayMonths: number; months: number } | null;
}

/** bodyReports/{checkinId}_r — 서버만 쓴다 */
export interface BodyReport {
  id: string;
  userId: string;
  projectId: string;
  checkinId: string;
  createdAt: string;
  /** AI 모델명, 템플릿이면 'template' */
  model: string;
  report: BodyReportBody;
  /** AI 실패 · 한도 초과로 템플릿 문구 (다시 요청하면 AI 를 다시 시도한다) */
  fallback?: boolean;
  judged?: CheckinJudgement;
}

/** aiReport 응답 — 서버가 다시 판정한 상태와 재계산 결과 */
export interface CheckinResult {
  report: BodyReportBody;
  reportId: string;
  status: CheckinStatus;
  expectedProgressPct: number;
  measuredProgressPct: number;
  /** 두 번 연속 뒤처져 완료 예상을 다시 계산했다 — 몇 개월 늦어졌는지 */
  recalculated?: { delayMonths: number; months: number } | null;
  fallback?: boolean;
}
