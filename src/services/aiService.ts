/**
 * AI 기능은 전부 Cloud Functions(asia-northeast3) 프록시를 통해 호출한다.
 * 앱 번들에는 Anthropic API 키가 들어가지 않는다.
 * 함수가 아직 배포되지 않았거나 호출에 실패하면 로컬 폴백으로 조용히 전환된다.
 */
import { httpsCallable, FunctionsError } from 'firebase/functions';
import { functions } from './firebase';
import { BodyProject, BodyReportBody, CheckinResult, DietPlan, Plan, UserProfile } from '../types';
import { buildLocalPlan, planFromAI } from '../utils/planner';
import { calcBodyStats, FOOD_LABEL, GOAL_LABEL } from '../utils/body';
import type { BodyStats } from '../types';
import { exFilter, PART_LABEL } from '../data/exercises';

export const FALLBACK_DIET: DietPlan = {
  meals: [
    { t: '아침', m: '그릭요거트 + 그래놀라 + 바나나', k: '약 450kcal · 단백질 25g 내외' },
    { t: '점심', m: '닭가슴살 샐러드 랩 + 삶은 달걀 2개', k: '약 550kcal · 단백질 45g 내외' },
    { t: '저녁', m: '잡곡밥 + 구운 생선/닭다리살 + 나물 반찬', k: '약 650kcal · 단백질 40g 내외' },
    { t: '간식', m: '프로틴 음료 1개 + 견과류 한 줌', k: '약 300kcal · 단백질 20g 내외' },
  ],
  tip: '연결에 실패해 기본 예시 식단을 표시합니다. 다시 시도하면 조건에 맞게 새로 구성합니다.',
  src: 'LOCAL',
};

export class AIUnavailable extends Error {}

/**
 * 서버가 구독을 요구했다. 화면 게이트를 우회했거나 대기 중에 구독이 끝난 경우.
 * 조용히 로컬 폴백으로 넘기지 않고 구독 안내를 띄우기 위해 따로 구분한다.
 */
export class SubscriptionRequired extends Error {
  readonly feature: string;
  constructor(message: string, feature: string) {
    super(message);
    this.feature = feature;
  }
}

function asSubRequired(e: unknown): SubscriptionRequired | null {
  const err = e as FunctionsError;
  if (err?.code !== 'functions/permission-denied') return null;
  const d = err.details as { reason?: string; feature?: string } | undefined;
  if (d?.reason !== 'subscription_required') return null;
  return new SubscriptionRequired(err.message || '구독이 필요합니다.', d.feature ?? '');
}

/** 한도 종류 — functions/src/quota.ts 의 QuotaKind 와 같은 값 */
export type QuotaKind = 'coach' | 'plan' | 'diet' | 'report';

/** AI 사용 한도를 다 썼다 — 코치·플랜·식단(하루), 체크인 리포트(월). kind 로 구분한다 */
export class QuotaExceeded extends Error {
  readonly limit: number;
  readonly kind: QuotaKind;
  constructor(message: string, limit: number, kind: QuotaKind) {
    super(message);
    this.limit = limit;
    this.kind = kind;
  }
}
/** 하위 호환 — 코치 화면이 이 이름으로 판별한다 */
export const CoachQuotaExceeded = QuotaExceeded;
export type CoachQuotaExceeded = QuotaExceeded;

function asQuotaExceeded(e: unknown): QuotaExceeded | null {
  const err = e as FunctionsError;
  if (err?.code !== 'functions/resource-exhausted') return null;
  const d = err.details as { reason?: string; limit?: number } | undefined;
  const kind: QuotaKind | null = d?.reason === 'coach_quota_exceeded' ? 'coach'
    : d?.reason === 'plan_quota_exceeded' ? 'plan'
    : d?.reason === 'diet_quota_exceeded' ? 'diet'
    : d?.reason === 'report_quota_exceeded' ? 'report' : null;
  if (!kind) return null;
  return new QuotaExceeded(err.message || 'AI 사용 한도를 모두 사용했습니다.', Number(d?.limit) || 0, kind);
}

/** 콜러블 대기 상한 — 서버는 55초에 끊는다. 기본 70초를 기다리게 두면 화면이 그만큼 잠긴다 */
const CALL_TIMEOUT_MS = 40_000;
/**
 * 체크인 리포트는 형식이 틀리면 서버가 AI 를 한 번 더 부른다. 그 사이에 끊어도 서버는 결과를 저장하고,
 * 다시 요청하면 한도를 쓰지 않고 저장된 리포트를 돌려준다.
 */
const REPORT_TIMEOUT_MS = 90_000;

/**
 * 폴백이 없는 콜러블(프로젝트 시작 · 체크인 리포트)의 실패를 화면에 보여 줄 문장으로.
 * 서버가 직접 던진 사유(없음 · 권한 · 입력 · 상태)는 서버 문구가 한국어라 그대로 쓰고,
 * 연결 · 내부 오류는 SDK 문구(영어)라 대신 안내한다.
 */
function callFailure(e: unknown, fallback: string): Error {
  const err = e as FunctionsError;
  const own = [
    'functions/not-found', 'functions/permission-denied', 'functions/invalid-argument',
    'functions/failed-precondition',
  ];
  if (own.includes(err?.code ?? '') && err.message) return new Error(err.message);
  if (!isUnavailable(e)) console.warn('[ai]', e);
  return new Error(fallback);
}

function isUnavailable(e: unknown): boolean {
  const code = (e as FunctionsError)?.code ?? '';
  return (
    code === 'functions/not-found' ||
    code === 'functions/unavailable' ||
    code === 'functions/internal' ||
    code === 'functions/failed-precondition'
  );
}

/** AI 가 선택할 수 있는 종목 목록 (환경·난이도로 축소해 토큰 절약) */
function buildCatalog(p: UserProfile): string {
  return exFilter({ place: p.env, maxLevel: p.level })
    .map((e) => `${e.id}|${e.n}|${PART_LABEL[e.part]}|lv${e.lv}`)
    .join('\n');
}

// ─── 플랜 ──────────────────────────────────────────────────────────────────
export interface PlanResult {
  plan: Plan;
  /** AI 가 아니라 로컬 구성으로 대체됐는지 — 호출자가 사용자에게 알린다 */
  fallback: boolean;
  /** 폴백 사유(표시용) */
  reason?: string;
}

/**
 * AI 플랜. 실패하면 로컬 구성으로 대체하되 그 사실을 돌려준다 —
 * 온보딩·플랜 화면이 "AI 플랜" 이라고 잘못 안내하지 않도록.
 * 구독 없음(SubscriptionRequired)·한도 초과(QuotaExceeded)는 폴백하지 않고 던진다.
 */
export async function generatePlan(p: UserProfile, opts?: { projectId?: string }): Promise<PlanResult> {
  try {
    const call = httpsCallable(functions, 'aiPlan', { timeout: CALL_TIMEOUT_MS });
    // projectId 가 있으면 서버가 프로젝트에 저장된 입력 · 단계로 프롬프트를 만든다(프로필 숫자는 안 쓴다)
    const res = await call({
      profile: p,
      catalog: buildCatalog(p),
      ...(opts?.projectId ? { projectId: opts.projectId } : {}),
    });
    const plan = planFromAI(res.data, p);
    if (plan) return { plan, fallback: false };
    return { plan: buildLocalPlan(p), fallback: true, reason: 'AI 응답을 해석하지 못했습니다.' };
  } catch (e) {
    const need = asSubRequired(e);
    if (need) throw need;
    const over = asQuotaExceeded(e);
    if (over) throw over;
    if (!isUnavailable(e)) console.warn('[aiPlan]', e);
    return { plan: buildLocalPlan(p), fallback: true, reason: 'AI 연결에 실패했습니다.' };
  }
}

// ─── 식단 ──────────────────────────────────────────────────────────────────
/**
 * opts.projectId 가 있으면 내 변화 프로젝트 식단 — 칼로리 · 단백질 · 끼니별 표기는 서버가 지금 단계로 정하고
 * (클라이언트 수치는 보내지 않는다), 결과의 target 에 그 하루 목표가 실린다.
 */
export async function generateDiet(
  p: UserProfile, stats?: BodyStats, opts?: { projectId?: string },
): Promise<DietPlan> {
  const projectId = opts?.projectId;
  // 호출 측에서 추세 체중이 반영된 stats 를 넘기면 그대로 쓴다
  const st = projectId ? null : stats ?? calcBodyStats(p);
  if (!projectId && !st) return FALLBACK_DIET;
  try {
    const call = httpsCallable(functions, 'aiDiet', { timeout: CALL_TIMEOUT_MS });
    const res = await call(
      st
        ? {
            bodyType: st.bodyType,
            goal: GOAL_LABEL[p.goal],
            kcal: st.kcal,
            protein: st.protein,
            carb: st.carb,
            fat: st.fat,
            foodEnv: FOOD_LABEL[p.food],
            allergy: p.allergy || '없음',
          }
        : { projectId, allergy: p.allergy || '없음' },
    );
    const j = normalizeDiet(res.data);
    if (j) return { ...j, src: 'AI', createdAt: new Date().toISOString() };
  } catch (e) {
    const need = asSubRequired(e);
    if (need) throw need;
    const over = asQuotaExceeded(e);
    if (over) throw over;
    if (!isUnavailable(e)) console.warn('[aiDiet]', e);
  }
  return FALLBACK_DIET;
}

/**
 * 서버 응답을 화면이 안전하게 렌더할 수 있는 형태로 정리한다.
 * diet 는 persist 되므로 여기서 걸러내지 않으면 잘못된 응답이 재시작마다 크래시를 일으킨다.
 */
function normalizeDiet(raw: unknown): DietPlan | null {
  const d = (raw ?? {}) as Partial<DietPlan>;
  const meals = (Array.isArray(d.meals) ? d.meals : [])
    .filter((m) => !!m && typeof m === 'object')
    .slice(0, 8)
    .map((m) => ({
      t: String((m as { t?: unknown }).t ?? '').slice(0, 20),
      m: String((m as { m?: unknown }).m ?? '').slice(0, 300),
      k: String((m as { k?: unknown }).k ?? '').slice(0, 60),
    }))
    .filter((m) => m.t && m.m);
  if (!meals.length) return null;
  const target = normalizeTarget(raw);
  return { meals, tip: typeof d.tip === 'string' ? d.tip.slice(0, 200) : '', ...(target ? { target } : {}) };
}

/** 프로젝트 식단의 하루 목표 — 숫자가 하나라도 이상하면 없는 것으로 본다 */
function normalizeTarget(raw: unknown): DietPlan['target'] | null {
  const d = (raw ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
  const kcal = n(d.kcal);
  const protein = n(d.protein);
  const carb = n(d.carb);
  const fat = n(d.fat);
  const phase = d.phase === 'cut' || d.phase === 'gain' || d.phase === 'keep' ? d.phase : null;
  if (kcal === null || protein === null || carb === null || fat === null || !phase) return null;
  return { kcal, protein, carb, fat, phase };
}

// ─── 코치 ──────────────────────────────────────────────────────────────────
export interface CoachMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** 남은 코치 대화 횟수 — 서버가 계산해서 내려 준다 (앱은 표시만) */
export interface CoachQuota {
  used: number;
  limit: number;
  remaining: number;
  unlimited?: boolean;
}

export interface CoachReply {
  reply: string;
  quota?: CoachQuota;
}

export async function askCoach(
  messages: CoachMessage[],
  context: string
): Promise<CoachReply> {
  try {
    const call = httpsCallable(functions, 'aiCoach', { timeout: CALL_TIMEOUT_MS });
    const res = await call({ messages: messages.slice(-20), context });
    const d = res.data as { reply?: string; quota?: CoachQuota };
    if (d?.reply) return { reply: d.reply, quota: d.quota };
    throw new AIUnavailable();
  } catch (e) {
    const need = asSubRequired(e);
    if (need) throw need;
    const over = asQuotaExceeded(e);
    if (over) throw over;
    if (!isUnavailable(e)) console.warn('[aiCoach]', e);
    throw new AIUnavailable('코치 연결에 실패했습니다. 잠시 후 다시 시도해주세요.');
  }
}

// ─── 내 변화 프로젝트 ──────────────────────────────────────────────────────
/**
 * 결제 후 프로젝트 시작. 서버가 분석 문서의 원본 입력으로 엔진을 다시 돌려 bodyProjects 를 만든다
 * (AI 호출 · 한도 없음). 같은 분석 · 같은 프로젝트로 다시 불러도 진행 중인 것 하나를 돌려준다.
 * 구독 없음은 SubscriptionRequired, 그 밖의 실패는 화면에 보여 줄 문장의 Error.
 */
export async function startProject(analysisId: string, projectId: string): Promise<BodyProject> {
  try {
    const call = httpsCallable(functions, 'projectStart', { timeout: CALL_TIMEOUT_MS });
    const res = await call({ analysisId, projectId });
    const d = res.data as BodyProject | null;
    if (!d || typeof d.id !== 'string' || !Array.isArray(d.track)) {
      throw new Error('프로젝트를 시작하지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
    return d;
  } catch (e) {
    const need = asSubRequired(e);
    if (need) throw need;
    if (e instanceof Error && !(e as FunctionsError).code) throw e;
    throw callFailure(e, '프로젝트를 시작하지 못했습니다. 잠시 후 다시 시도해주세요.');
  }
}

/**
 * 체크인 판정 + 리포트. 체크인 문서를 먼저 저장한 뒤 그 id 로 부른다.
 * 상태 · 진행률 · 재계산은 서버가 다시 계산한 값이고, 한도 초과 · AI 실패면 템플릿 리포트(fallback)가 온다.
 * 같은 체크인으로 다시 부르면 저장된 결과를 돌려준다(템플릿이었으면 AI 를 다시 시도).
 */
export async function requestCheckinReport(checkinId: string): Promise<CheckinResult> {
  try {
    const call = httpsCallable(functions, 'aiReport', { timeout: REPORT_TIMEOUT_MS });
    const res = await call({ checkinId });
    const r = normalizeCheckinResult(res.data);
    if (!r) throw new Error('리포트를 받지 못했습니다. 잠시 후 다시 시도해주세요.');
    return r;
  } catch (e) {
    const need = asSubRequired(e);
    if (need) throw need;
    const over = asQuotaExceeded(e);
    if (over) throw over;
    if (e instanceof Error && !(e as FunctionsError).code) throw e;
    throw callFailure(e, '리포트를 받지 못했습니다. 잠시 후 다시 시도해주세요.');
  }
}

function normalizeCheckinResult(raw: unknown): CheckinResult | null {
  const d = (raw ?? {}) as Partial<CheckinResult>;
  const r = (d.report ?? {}) as Partial<BodyReportBody>;
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  if (d.status !== 'ahead' && d.status !== 'on' && d.status !== 'behind') return null;
  if (typeof d.reportId !== 'string' || typeof r.headline !== 'string') return null;
  const rc = d.recalculated;
  return {
    report: {
      headline: r.headline,
      wins: strs(r.wins),
      adjust: strs(r.adjust),
      nextFocus: typeof r.nextFocus === 'string' ? r.nextFocus : '',
      planChange: r.planChange === 'suggest' ? 'suggest' : 'none',
    },
    reportId: d.reportId,
    status: d.status,
    expectedProgressPct: Number(d.expectedProgressPct) || 0,
    measuredProgressPct: Number(d.measuredProgressPct) || 0,
    recalculated: rc && typeof rc.months === 'number' && typeof rc.delayMonths === 'number'
      ? { delayMonths: rc.delayMonths, months: rc.months }
      : null,
    fallback: d.fallback === true,
  };
}
