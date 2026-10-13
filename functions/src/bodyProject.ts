/**
 * 내 변화 프로젝트 — 서버 쪽 도우미.
 *
 * 숫자(체지방·근육·체중·기간·칼로리·단백질)는 전부 결정론적 엔진(./engine, 앱의 src/utils 복사본)이
 * 저장된 원본 입력으로 다시 계산한다. 클라이언트가 보낸 숫자나 문서에 적어 둔 계산 결과는 믿지 않는다.
 * AI 는 이 파일이 만든 확정 숫자를 글로 바꾸기만 한다(index.ts 의 GUARD).
 *
 * 문서 형태 사본: src/types/index.ts "내 변화 프로젝트". 고칠 때 둘 다 고칠 것.
 */
import { HttpsError } from 'firebase-functions/v2/https';
import { db } from './entitlement';
import { roundTo, type BodyComp, type Coord } from './engine/bodyComp';
import {
  phaseSpans, type CheckinStatus, type MonthPoint, type Nutrition, type Phase, type PhaseSpan,
  type ProjectEnd, type ProjectKind,
} from './engine/projection';
import type { AnalysisGoal, AnalysisInput, GoalPick } from './engine/bodyAnalysis';

export type ProjectStatus = 'active' | 'paused' | 'done' | 'abandoned';

/** bodyProjects/{id} — 서버(projectStart · aiReport)만 쓴다 */
export interface BodyProjectDoc {
  userId: string;
  analysisId: string;
  projectRefId: string;
  status: ProjectStatus;
  startedAt: string;
  name: string;
  months: number;
  kind: ProjectKind;
  goal: AnalysisGoal;
  baseline: BodyComp;
  input: AnalysisInput;
  track: MonthPoint[];
  trackOffset: number;
  trackHistory: { at: string; offset: number; track: MonthPoint[] }[];
  end: ProjectEnd;
  phases: PhaseSpan[];
  nutrition: Nutrition;
  lastCheckinId: string | null;
  engineVersion: string;
}

export interface ReportBody {
  headline: string;
  wins: string[];
  adjust: string[];
  nextFocus: string;
  planChange: 'none' | 'suggest';
}

/** 서버가 판정한 값 — 체크인 문서는 본인이 고칠 수 있으므로 다음 판정은 이쪽을 읽는다 */
export interface Judgement {
  status: CheckinStatus;
  expectedProgressPct: number;
  measuredProgressPct: number;
  comp: BodyComp;
  coord: Coord;
  cell: string;
  weightKg: number;
  /** 직전 판정의 체중(첫 체크인이면 시작 체중) — 리포트의 "직전 대비" */
  prevWeightKg: number;
  monthIndex: number;
  /** 이 체크인에서 완료 예상을 다시 계산했다 */
  recalculated: { delayMonths: number; months: number } | null;
}

/** bodyReports/{checkinId}_r — 서버만 쓴다 */
export interface BodyReportDoc {
  userId: string;
  projectId: string;
  checkinId: string;
  createdAt: string;
  model: string;
  report: ReportBody;
  fallback: boolean;
  judged: Judgement;
}

export const PHASE_LABEL: Record<Phase, string> = { cut: '감량', gain: '린벌크', keep: '유지' };
export const LEVEL_LABEL: Record<number, string> = { 1: '입문', 2: '중급', 3: '상급' };
export const FOOD_LABEL: Record<AnalysisInput['food'], string> = {
  convenience: '편의점', self: '자취 요리', family: '집밥', out: '외식',
};

// ─── 입력 검증 ─────────────────────────────────────────────────────────────
/** 문서 id — 경로 구분자나 빈 값으로 다른 문서를 가리키지 못하게 */
const DOC_ID = /^[A-Za-z0-9_-]{1,200}$/;

export function docId(v: unknown, what: string): string {
  const id = typeof v === 'string' ? v.trim() : '';
  if (!DOC_ID.test(id)) throw new HttpsError('invalid-argument', `${what} id 가 올바르지 않습니다.`);
  return id;
}

const num = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'number' ? v : Number.NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

const bad = (field: string): HttpsError =>
  new HttpsError('invalid-argument', `분석 입력값이 올바르지 않습니다 (${field}). 다시 분석해주세요.`);

/**
 * 저장된 분석 입력을 엔진에 넣기 전에 검사한다 — bodyAnalyses 는 본인이 쓰는 문서라
 * 범위 밖 값(키 1.75 등)이 들어 있을 수 있다. 범위는 앱의 PROFILE_RANGE 와 같다.
 * 값이 없는 선택 항목은 키 자체를 빼서 돌려준다(Firestore 는 undefined 를 저장하지 못한다).
 */
export function sanitizeInput(raw: unknown): AnalysisInput {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const sex = d.sex === 'male' || d.sex === 'female' ? d.sex : null;
  if (!sex) throw bad('sex');
  const age = num(d.age, 10, 100);
  if (age === null) throw bad('age');
  const heightCm = num(d.heightCm, 100, 250);
  if (heightCm === null) throw bad('heightCm');
  const weightKg = num(d.weightKg, 25, 300);
  if (weightKg === null) throw bad('weightKg');
  const level = d.level === 1 || d.level === 2 || d.level === 3 ? d.level : null;
  if (!level) throw bad('level');
  const days = num(d.days, 2, 6);
  if (days === null || !Number.isInteger(days)) throw bad('days');
  const env = d.env === 'gym' || d.env === 'home' ? d.env : null;
  if (!env) throw bad('env');
  // `in` 은 'constructor' 같은 프로토타입 키도 통과시킨다
  const food = typeof d.food === 'string' && Object.prototype.hasOwnProperty.call(FOOD_LABEL, d.food)
    ? (d.food as AnalysisInput['food']) : null;
  if (!food) throw bad('food');

  const out: AnalysisInput = { sex, age, heightCm, weightKg, level, days, env, food };
  if (d.waistCm !== undefined && d.waistCm !== null) {
    const waistCm = num(d.waistCm, 50, 200);
    if (waistCm === null) throw bad('waistCm');
    out.waistCm = waistCm;
  }
  if (d.inbody !== undefined && d.inbody !== null) {
    const ib = (typeof d.inbody === 'object' ? d.inbody : {}) as Record<string, unknown>;
    const bfPct = num(ib.bfPct, 3, 60);
    if (bfPct === null) throw bad('inbody.bfPct');
    // 골격근량 · 날짜는 계산에 쓰지 않는다 — 형식만 맞춘다
    const smmKg = num(ib.smmKg, 0, 150) ?? 0;
    const date = typeof ib.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ib.date) ? ib.date : '';
    out.inbody = { bfPct, smmKg, date };
  }
  return out;
}

/** 저장된 목표 선택 — 카드 id 가 이상하면 엔진이 추천(auto)으로 바꾼다 */
export function sanitizePick(raw: unknown): GoalPick {
  const g = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const archetypeId = typeof g.archetypeId === 'string' ? g.archetypeId.slice(0, 40) : undefined;
  return g.mode === 'pick' && archetypeId ? { mode: 'pick', archetypeId } : { mode: 'auto' };
}

// ─── 프로젝트 읽기 ─────────────────────────────────────────────────────────
/** 본인의 진행 중인 프로젝트 — AI 플랜·식단은 여기 저장된 입력만 쓴다 */
export async function loadActiveProject(uid: string, rawId: unknown): Promise<{ id: string; data: BodyProjectDoc }> {
  const id = docId(rawId, '프로젝트');
  const snap = await db.collection('bodyProjects').doc(id).get();
  const data = snap.data() as BodyProjectDoc | undefined;
  if (!data || data.userId !== uid || data.status !== 'active' || !data.track?.length) {
    throw new HttpsError('failed-precondition', '진행 중인 프로젝트가 아닙니다.');
  }
  return { id, data };
}

/** 시작 후 몇 개월째인지(0부터) — 한 달 = 30.44일 */
export function monthsElapsed(startedAt: string, now = Date.now()): number {
  const t = Date.parse(startedAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 86_400_000 / 30.44));
}

/** "1~6개월 감량, 7~12개월 린벌크" */
export function timelineText(spans: readonly PhaseSpan[]): string {
  if (!spans.length) return '유지';
  return spans
    .map((s) => `${s.from === s.to ? s.from : `${s.from}~${s.to}`}개월 ${PHASE_LABEL[s.phase]}`)
    .join(', ');
}

/**
 * 재계산 뒤 단계표 — monthIndex 개월까지는 지나온 단계를 그대로 두고, 그 뒤는 새 트랙의 단계로 잇는다.
 * 새 트랙은 monthIndex 개월째에서 시작하므로 엔진이 준 구간(1부터)을 그만큼 민다.
 */
export function mergePhases(
  old: readonly PhaseSpan[], track: MonthPoint[], monthIndex: number, months: number,
): PhaseSpan[] {
  const kept = old
    .filter((s) => s.from <= monthIndex)
    .map((s) => ({ ...s, to: Math.min(s.to, monthIndex) }));
  const next = phaseSpans(track, Math.max(0, months - monthIndex))
    .map((s) => ({ ...s, from: s.from + monthIndex, to: s.to + monthIndex }));
  const out: PhaseSpan[] = [];
  for (const s of [...kept, ...next]) {
    const last = out[out.length - 1];
    if (last && last.phase === s.phase && last.to + 1 >= s.from) last.to = Math.max(last.to, s.to);
    else out.push({ ...s });
  }
  return out;
}

// ─── 식단 ──────────────────────────────────────────────────────────────────
/** 끼니 나누기 — 서버가 정하고 AI 에게는 메뉴만 맡긴다 */
const MEAL_SPLIT = [
  { t: '아침', r: 0.25 },
  { t: '점심', r: 0.35 },
  { t: '저녁', r: 0.3 },
  { t: '간식', r: 0.1 },
] as const;

export interface MealTarget {
  t: string;
  kcal: number;
  protein: number;
}

export const mealTargets = (kcal: number, protein: number): MealTarget[] =>
  MEAL_SPLIT.map(({ t, r }) => ({ t, kcal: Math.round((kcal * r) / 10) * 10, protein: Math.round(protein * r) }));

export const mealK = (m: MealTarget): string => `약 ${m.kcal}kcal · 단백질 ${m.protein}g`;

/** 앱 calcBodyStats 와 같은 매크로 나누기 — 지방 25%, 나머지 탄수 */
export function macrosOf(kcal: number, protein: number): { fat: number; carb: number } {
  const fat = Math.round((kcal * 0.25) / 9);
  return { fat, carb: Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4)) };
}

// ─── 리포트 ────────────────────────────────────────────────────────────────
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const clip = (v: string, max: number): string => v.trim().slice(0, max);

/**
 * AI 리포트 형식 검사 — 새 의존성 없이 직접. 틀리면 null(호출자가 한 번 더 부르고, 그래도 틀리면 템플릿).
 * 길이는 잘라서 받아 주되, 제목이 40자를 넘거나 필수 칸이 비면 실패로 본다.
 */
export function validateReport(raw: unknown): ReportBody | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (!isStr(d.headline) || d.headline.trim().length > 40) return null;
  if (!Array.isArray(d.wins) || !Array.isArray(d.adjust)) return null;
  const wins = d.wins.filter(isStr).slice(0, 3).map((x) => clip(x, 150));
  const adjust = d.adjust.filter(isStr).slice(0, 3).map((x) => clip(x, 150));
  if (!wins.length) return null;
  if (!isStr(d.nextFocus)) return null;
  if (d.planChange !== 'none' && d.planChange !== 'suggest') return null;
  return {
    headline: d.headline.trim(),
    wins,
    adjust,
    nextFocus: clip(d.nextFocus, 200),
    planChange: d.planChange,
  };
}

/** AI 를 못 쓸 때(한도 · 장애 · 형식 오류) — 숫자를 지어내지 않는 고정 문구 */
export function templateReport(status: CheckinStatus, recalculated: boolean): ReportBody {
  if (status === 'ahead') {
    return {
      headline: '예상보다 빠르게 가고 있어요',
      wins: ['계획보다 앞서 변하고 있습니다. 지금 하는 운동과 식단이 잘 맞고 있어요.'],
      adjust: [],
      nextFocus: '속도를 더 올리기보다 지금 루틴과 식단을 그대로 이어가세요.',
      planChange: 'none',
    };
  }
  if (status === 'on') {
    return {
      headline: '계획대로 가고 있어요',
      wins: ['예상한 속도대로 변하고 있습니다.'],
      adjust: [],
      nextFocus: '다음 체크인까지 운동 일수와 식단을 지금처럼 지켜 주세요.',
      planChange: 'none',
    };
  }
  return {
    headline: '예상보다 조금 느려요',
    wins: ['체크인을 거르지 않고 기록을 남겼습니다. 이게 조정의 출발점이에요.'],
    adjust: recalculated
      ? ['지금 몸 상태에서 완료 예상을 다시 계산했습니다. 새 일정에 맞춰 이어가면 됩니다.']
      : ['지난 4주 운동 기록과 식단 중 지키기 어려웠던 한 가지를 먼저 바로잡아 보세요.'],
    nextFocus: '이번 4주는 계획한 운동 일수를 빠짐없이 채우는 데 집중해 보세요.',
    planChange: 'none',
  };
}

/** 프롬프트 표시용 — 엔진 값은 표시할 때만 반올림한다 */
export const r1 = (v: number): number => roundTo(v, 1);
export const signed = (v: number, unit: string): string => `${v > 0 ? '+' : ''}${r1(v)}${unit}`;
