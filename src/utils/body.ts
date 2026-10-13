import { UserProfile, BodyStats, WeightRecord, BodyProject } from '../types';
import { expectedPoint, phaseNutrition } from './projection';

// ─── 추세 체중 ──────────────────────────────────────────────────────────────
/** 추세 계산에 사용할 기간과 표본 수 */
const TREND_WINDOW_DAYS = 14;
const TREND_SAMPLE = 7;
/** 기준 체중 갱신을 제안하는 차이 (kg) */
export const WEIGHT_DRIFT_THRESHOLD = 1.5;

/**
 * 최근 기록의 중앙값으로 계산한 추세 체중.
 *
 * 체중은 수분·식사·측정 시각에 따라 하루에도 1~2kg 움직인다.
 * 최신값을 그대로 쓰면 칼로리 목표가 매일 출렁이므로 평활화한다.
 * 평균 대신 중앙값을 쓰는 이유는 오타(예: 800) 한 건에 끌려가지 않기 위해서다.
 */
export function trendWeight(weights: WeightRecord[]): number | null {
  if (!weights?.length) return null;

  const cutoff = Date.now() - TREND_WINDOW_DAYS * 86_400_000;

  // 같은 날 여러 번 기록했으면 가장 최근 1건만 사용 (weights 는 createdAt desc 정렬)
  const byDate = new Map<string, number>();
  for (const w of weights) {
    if (!byDate.has(w.date) && Number.isFinite(w.kg) && w.kg > 0) byDate.set(w.date, w.kg);
  }

  const recent = [...byDate.entries()]
    .filter(([date]) => new Date(`${date}T00:00:00`).getTime() >= cutoff)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, TREND_SAMPLE)
    .map(([, kg]) => kg);

  if (!recent.length) return null;

  const sorted = [...recent].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(median * 10) / 10;
}

export interface EffectiveWeight {
  /** 실제 계산에 쓰인 체중 */
  kg: number;
  /** trend = 최근 기록 기반, profile = 온보딩/프로필에 저장된 기준 체중 */
  src: 'trend' | 'profile';
  /** 추세 체중 (기록이 없으면 null) */
  trend: number | null;
  /** 프로필에 저장된 기준 체중 */
  baseline: number;
  /** 기준과 추세의 차이 — 양수면 추세가 더 무겁다 */
  drift: number;
  /** 기준 체중 갱신을 제안할 만큼 벌어졌는지 */
  shouldUpdate: boolean;
}

export function effectiveWeight(
  profile: UserProfile | null | undefined,
  weights: WeightRecord[] = []
): EffectiveWeight | null {
  if (!profile) return null;
  const baseline = Number(profile.weight);
  if (!baseline) return null;

  const trend = trendWeight(weights);
  const kg = trend ?? baseline;
  const drift = trend !== null ? Math.round((trend - baseline) * 10) / 10 : 0;

  return {
    kg,
    src: trend !== null ? 'trend' : 'profile',
    trend,
    baseline,
    drift,
    shouldUpdate: trend !== null && Math.abs(drift) >= WEIGHT_DRIFT_THRESHOLD,
  };
}

// ─── 체형·칼로리 계산 ───────────────────────────────────────────────────────
/**
 * Mifflin-St Jeor + 활동계수 1.5.
 * weights 를 넘기면 추세 체중으로 계산하고, 없으면 프로필의 기준 체중을 쓴다.
 */
// ─── 입력 범위 ──────────────────────────────────────────────────────────────
/** 온보딩·내 정보·체중 입력이 공유하는 허용 범위. 화면마다 규칙이 달라지면 안 된다. */
export const PROFILE_RANGE = {
  age: { min: 10, max: 100, label: '나이', unit: '세' },
  height: { min: 100, max: 250, label: '키', unit: 'cm' },
  weight: { min: 25, max: 300, label: '체중', unit: 'kg' },
} as const;

export type ProfileField = keyof typeof PROFILE_RANGE;

/** '62,5' → 62.5, '72kg' → NaN (단위는 붙이지 않게 한다) */
export const parseNum = (v: string | number): number => {
  const n = Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

/** 범위 안이면 null, 아니면 사용자에게 보여줄 메시지 */
export function validateField(field: ProfileField, v: string | number): string | null {
  const r = PROFILE_RANGE[field];
  const n = parseNum(v);
  if (!Number.isFinite(n)) return `${r.label}를 숫자로 입력해주세요.`;
  if (n < r.min || n > r.max) return `${r.label}는 ${r.min}~${r.max}${r.unit} 사이로 입력해주세요.`;
  return null;
}

/** 프로필 세 수치를 한 번에 검사. 첫 오류 메시지를 돌려준다 */
export function validateProfile(p: Pick<UserProfile, 'age' | 'height' | 'weight'>): string | null {
  return validateField('age', p.age) ?? validateField('height', p.height) ?? validateField('weight', p.weight);
}

// ─── 현재 체형 상세 (온보딩 O3 · 체크인) ─────────────────────────────────────
/** 허리둘레 50~200cm, 그리고 키의 30~90% — 인치를 그대로 넣은 경우(32 → 32cm)를 걸러낸다 */
export function validateWaist(v: string, heightCm: number): string | null {
  const n = parseNum(v);
  if (!Number.isFinite(n) || n < 50 || n > 200 || (heightCm > 0 && (n < heightCm * 0.3 || n > heightCm * 0.9))) {
    return '허리둘레를 다시 확인해주세요 (cm 단위)';
  }
  return null;
}

export function validateBodyFat(v: string): string | null {
  const n = parseNum(v);
  return Number.isFinite(n) && n >= 3 && n <= 60 ? null : '체지방률은 3~60% 사이로 입력해주세요';
}

/** 골격근량 10~70kg, 그리고 체중의 60% 이하 */
export function validateSmm(v: string, weightKg: number): string | null {
  const n = parseNum(v);
  return Number.isFinite(n) && n >= 10 && n <= 70 && (!weightKg || n <= weightKg * 0.6) ? null : '골격근량을 다시 확인해주세요';
}

/** 측정일: 오늘 이전만. 60일이 넘었으면 경고만(진행은 된다) */
export function checkInbodyDate(v: string, today = new Date()): { error: string | null; stale: boolean } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { error: '측정일을 YYYY-MM-DD 로 입력해주세요', stale: false };
  const t = new Date(`${v}T00:00:00`).getTime();
  if (!Number.isFinite(t)) return { error: '측정일을 다시 확인해주세요', stale: false };
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (t > now) return { error: '측정일은 오늘 이전이어야 해요', stale: false };
  return { error: null, stale: now - t > 60 * 86_400_000 };
}

/** 주 운동 일수 → 활동계수 (Mifflin-St Jeor 관행값) */
export function activityFactor(days: number): number {
  if (days <= 2) return 1.375;
  if (days <= 4) return 1.55;
  return 1.725;
}

/** 감량 시 하한 — 이 아래로 내려가면 식단 제안이 위험해진다 */
const KCAL_FLOOR = { male: 1500, female: 1200 } as const;

/** 단계 이름 — 칼로리 줄에 붙인다 */
const PHASE_WORD = { cut: '감량', gain: '린벌크', keep: '유지' } as const;

/**
 * project: 진행 중인 내 변화 프로젝트가 있으면 목표 ± 고정값 대신 지금 단계(감량 · 린벌크 · 유지)의 칼로리 ·
 * 단백질을 엔진(phaseNutrition)으로 쓴다 — 같은 TDEE 에서 출발한다. 없으면 예전 그대로.
 */
export function calcBodyStats(
  p: UserProfile | null | undefined,
  weights: WeightRecord[] = [],
  project?: BodyProject | null,
): BodyStats | null {
  if (!p) return null;
  // 범위 밖 프로필로는 계산하지 않는다 (키 1.75 → BMI 235102 같은 값이 화면에 나가면 안 된다)
  if (validateProfile(p)) return null;
  const eff = effectiveWeight(p, weights);
  const W = eff?.kg ?? parseNum(p.weight);
  const H = parseNum(p.height);
  const A = parseNum(p.age);
  if (!W || !H || !A) return null;

  // 분류와 표시가 어긋나지 않게 소수 1자리로 맞춘 값으로 판정한다
  const bmi = Math.round((W / (H / 100) ** 2) * 10) / 10;
  const bodyType =
    bmi < 18.5 ? '마른 체형' : bmi < 23 ? '표준 체형' : bmi < 25 ? '과체중 경계' : '과체중';

  const bmr = 10 * W + 6.25 * H - 5 * A + (p.sex === 'male' ? 5 : -161);
  const factor = activityFactor(p.days);
  const tdee = Math.round(bmr * factor);

  let kcal = tdee;
  let tagline = '유지 칼로리';
  if (p.goal === 'muscle') {
    kcal = tdee + 300;
    tagline = '증량 (+300kcal)';
  }
  if (p.goal === 'cut') {
    kcal = tdee - 400;
    tagline = '감량 (-400kcal)';
    const floor = Math.max(KCAL_FLOOR[p.sex], Math.round(bmr));
    if (kcal < floor) {
      kcal = floor;
      tagline = `감량 (하한 ${floor}kcal 적용)`;
    }
  }

  let protein = Math.round(W * (p.goal === 'cut' ? 2.0 : 1.8));

  if (project && project.status === 'active') {
    const monthIndex = Math.round((Date.now() - Date.parse(project.startedAt)) / (30.44 * 86_400_000));
    const pt = expectedPoint(project.track, project.trackOffset, monthIndex);
    const n = phaseNutrition(pt.phase, { sex: p.sex, age: A, heightCm: H, weightKg: W, days: p.days, level: p.level });
    kcal = n.kcal;
    protein = n.proteinG;
    tagline = `${PHASE_WORD[pt.phase]} 단계 · 내 변화 프로젝트`;
  }

  const fat = Math.round((kcal * 0.25) / 9);
  const carb = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));

  return {
    bmi: bmi.toFixed(1),
    bodyType,
    tdee,
    activityFactor: factor,
    kcal,
    tagline,
    protein,
    fat,
    carb,
    weightUsed: Math.round(W * 10) / 10,
    weightSrc: eff?.src ?? 'profile',
  };
}

export const GOAL_LABEL: Record<UserProfile['goal'], string> = {
  muscle: '근성장',
  cut: '체지방 감량',
  habit: '운동 습관 만들기',
};

export const FOOD_LABEL: Record<UserProfile['food'], string> = {
  convenience: '편의점',
  self: '자취 요리',
  family: '집밥',
  out: '외식',
};
