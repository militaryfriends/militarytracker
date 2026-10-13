/**
 * 체성분 계산 엔진 (1/2) — 현재 몸을 지도 위의 한 점으로 바꾼다.
 *
 * 결정론적: 같은 입력 = 같은 출력. 결과 문서에 ENGINE_VERSION 을 남겨 공식을 바꿔도 재현할 수 있게 한다.
 * 이 파일과 projection.ts 는 서버(functions/src/engine/)에 같은 내용으로 복사돼 있다 —
 * 고치면 `npm run engine:sync` 로 맞추고 `npm test` 로 예시 A~E 를 확인한다.
 * React Native · Firebase 를 import 하지 않는다(서버에서도 돌아야 한다).
 *
 * 명세: "아바타 체형 변화 예측 기능 — 개발 인수인계 명세 v1" 3장.
 */
export const ENGINE_VERSION = 'body-1.0.0';

export type Sex = 'male' | 'female';

/**
 * 지도 — 가로축 체지방률(F1~F5), 세로축 근육(nFFMI, M1~M5). 칸마다 중심값.
 * ceil·base: 근육이 base 를 넘으면 늘어나는 속도가 ceil 까지 선형으로 줄어든다.
 * bfMin: 이 체지방률 밑으로는 어떤 목표도 잡지 않는다.
 * 여성 값은 보수적으로 잡은 초기값 — 프리셋 렌더 후 눈으로 한 번 더 맞춘다.
 */
export const GRID = {
  male: { fat: [9, 13, 17, 22, 28], mus: [17, 18.5, 20, 21.5, 23], ceil: 25, base: 18, bfMin: 8 },
  female: { fat: [18, 22, 27, 32, 38], mus: [14, 15.25, 16.5, 17.75, 19], ceil: 21, base: 15, bfMin: 16 },
} as const;

/** 근육 칸 표기 (M1~M5) */
export const MUSCLE_LABEL = ['일반', '탄탄', '운동한 몸', '근육질', '매우 근육질'] as const;

export interface InbodyInput {
  bfPct: number;
  /** 골격근량 — v1 에서는 표시·교차검증용으로만 저장한다 */
  smmKg: number;
  /** YYYY-MM-DD */
  date: string;
}

export interface BodyInput {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  waistCm?: number;
  inbody?: InbodyInput;
}

/** weight = 체크인 체중만으로 직전 체성분에서 나눠 계산 */
export type CompSrc = 'inbody' | 'rfm' | 'bmi' | 'weight';
export type Accuracy = 'high' | 'good' | 'basic';

export interface BodyComp {
  bfPct: number;
  fmKg: number;
  ffmKg: number;
  nffmi: number;
  src: CompSrc;
  accuracy: Accuracy;
}

export interface Coord {
  /** 체지방 1.0~5.0 */
  f: number;
  /** 근육 1.0~5.0 */
  m: number;
}

/**
 * 표시용 반올림(소수 n자리) — 참조 구현(engine.py)과 같은 "딱 절반이면 짝수 쪽"(Python round).
 * 예: RFM 35.25 → 35.2. Math.round 로 하면 35.3 이 되어 검산표와 어긋난다. 계산 중간에는 쓰지 않는다.
 */
export function roundTo(v: number, digits = 1): number {
  const p = 10 ** digits;
  const x = v * p;
  const f = Math.floor(x);
  if (Math.abs(x - f - 0.5) < 1e-9) return (f % 2 === 0 ? f : f + 1) / p;
  return Math.round(x) / p;
}

/** 키 차이를 보정한 제지방지수 — 키가 큰 사람이 근육이 많아 보이는 착시를 없앤다 */
export const nffmiOf = (ffmKg: number, heightCm: number): number => {
  const m = heightCm / 100;
  return ffmKg / (m * m) + 6.1 * (1.8 - m);
};

/** 입력이 많을수록 위 순서가 우선 — 인바디 > 허리(RFM) > 키·체중(BMI) */
export const accuracyOf = (i: Pick<BodyInput, 'waistCm' | 'inbody'>): Accuracy =>
  i.inbody ? 'high' : i.waistCm ? 'good' : 'basic';

export const ACCURACY_LABEL: Record<Accuracy, string> = { high: '높음', good: '좋음', basic: '기본' };

export function estimateBodyComp(i: BodyInput): BodyComp {
  let bfPct: number;
  let src: CompSrc;
  let accuracy: Accuracy;
  if (i.inbody) {
    bfPct = i.inbody.bfPct;
    src = 'inbody';
    accuracy = 'high';
  } else if (i.waistCm) {
    // RFM (Woolcott 2018, DXA 대비 검증)
    bfPct = (i.sex === 'male' ? 64 : 76) - (20 * i.heightCm) / i.waistCm;
    src = 'rfm';
    accuracy = 'good';
  } else {
    // Deurenberg BMI 공식
    const bmi = i.weightKg / (i.heightCm / 100) ** 2;
    bfPct = 1.2 * bmi + 0.23 * i.age - 10.8 * (i.sex === 'male' ? 1 : 0) - 5.4;
    src = 'bmi';
    accuracy = 'basic';
  }
  bfPct = Math.min(60, Math.max(3, bfPct));
  const fmKg = (i.weightKg * bfPct) / 100;
  const ffmKg = i.weightKg - fmKg;
  return { bfPct, fmKg, ffmKg, nffmi: nffmiOf(ffmKg, i.heightCm), src, accuracy };
}

/** 두 중심값 사이를 선형 보간한 연속 좌표 (범위 밖은 1.0/5.0) */
const interp = (v: number, arr: readonly number[]): number => {
  if (v <= arr[0]) return 1;
  if (v >= arr[4]) return 5;
  for (let k = 0; k < 4; k++) if (v <= arr[k + 1]) return k + 1 + (v - arr[k]) / (arr[k + 1] - arr[k]);
  return 5;
};

export const toCoord = (sex: Sex, bf: number, nf: number): Coord => ({
  f: interp(bf, GRID[sex].fat),
  m: interp(nf, GRID[sex].mus),
});

/** 중심값이 가장 가까운 칸 (1~5) */
const nearest = (v: number, arr: readonly number[]): number =>
  arr.reduce((best, c, k) => (Math.abs(c - v) < Math.abs(arr[best] - v) ? k : best), 0) + 1;

/** 표시 칸 'F2M4' — 아바타 이미지는 이 값으로 고른다 */
export const toCell = (sex: Sex, bf: number, nf: number): string =>
  `F${nearest(bf, GRID[sex].fat)}M${nearest(nf, GRID[sex].mus)}`;

export const parseCell = (cell: string): { f: number; m: number } => {
  const r = /^F([1-5])M([1-5])$/.exec(cell);
  return r ? { f: Number(r[1]), m: Number(r[2]) } : { f: 3, m: 3 };
};

export const cellName = (f: number, m: number): string => `F${f}M${m}`;

/** 칸의 중심 체지방률 · nFFMI */
export const cellCenter = (sex: Sex, cell: string): { bfPct: number; nffmi: number } => {
  const { f, m } = parseCell(cell);
  return { bfPct: GRID[sex].fat[f - 1], nffmi: GRID[sex].mus[m - 1] };
};

/**
 * 체크인 때 아바타가 칸 경계에서 왔다 갔다 하지 않도록 — 이전 칸에서 경계를 margin 이상 넘어야 칸을 바꾼다.
 * 경계는 연속 좌표에서 두 칸 사이(예: 2.5). 이전 칸이 없으면 그냥 가장 가까운 칸.
 */
export function cellWithHysteresis(sex: Sex, bf: number, nf: number, prevCell: string | null, margin = 0.15): string {
  const next = parseCell(toCell(sex, bf, nf));
  if (!prevCell) return cellName(next.f, next.m);
  const prev = parseCell(prevCell);
  const c = toCoord(sex, bf, nf);
  const axis = (cur: number, prv: number, nxt: number): number => {
    if (nxt === prv) return prv;
    // 이전 칸 중심에서 경계(±0.5)를 margin 이상 넘었을 때만 이동
    return Math.abs(cur - prv) >= 0.5 + margin ? nxt : prv;
  };
  return cellName(axis(c.f, prev.f, next.f), axis(c.m, prev.m, next.m));
}

/** 목표 체지방률 · nFFMI 에 해당하는 체중 (근육 목표는 최소치 — 지금이 더 많으면 지금 값을 쓴다) */
export function targetBody(heightCm: number, bfPct: number, nffmi: number, currentFfmKg = 0): {
  weightKg: number; ffmKg: number; fmKg: number;
} {
  const h = heightCm / 100;
  const ffmGoal = (nffmi - 6.1 * (1.8 - h)) * h * h;
  const ffmKg = Math.max(ffmGoal, currentFfmKg);
  const weightKg = ffmKg / (1 - bfPct / 100);
  return { weightKg, ffmKg, fmKg: weightKg - ffmKg };
}

/**
 * 체크인 · 주간 체중으로 체성분 갱신 (명세 6-2).
 *  1) 인바디 입력 → 그 값.
 *  2) 체중만 → 직전 체성분에서 체중 변화를 나눈다. 감소면 85% 를 체지방, 증가면 29%(= 0.4 ÷ 1.4) 를 체지방으로.
 *  3) 허리둘레는 체지방률로 다시 환산하지 않는다 — RFM 은 사람 사이 비교엔 맞지만 한 사람의 변화엔 둔하다
 *     (허리 9cm 가 줄어도 4%p 정도만 바뀐다 → 잘하고 있는 사람이 "뒤처짐"으로 나온다).
 */
export function updateComp(prev: BodyComp, heightCm: number, weightKg: number, inbodyBfPct?: number): BodyComp {
  if (inbodyBfPct !== undefined) {
    const bfPct = Math.min(60, Math.max(3, inbodyBfPct));
    const fmKg = (weightKg * bfPct) / 100;
    const ffmKg = weightKg - fmKg;
    return { bfPct, fmKg, ffmKg, nffmi: nffmiOf(ffmKg, heightCm), src: 'inbody', accuracy: 'high' };
  }
  const d = weightKg - (prev.fmKg + prev.ffmKg);
  const dFat = d < 0 ? 0.85 * d : (0.4 / 1.4) * d;
  const fmKg = Math.max(0.03 * weightKg, prev.fmKg + dFat);
  const ffmKg = weightKg - fmKg;
  const bfPct = (fmKg / weightKg) * 100;
  return { bfPct, fmKg, ffmKg, nffmi: nffmiOf(ffmKg, heightCm), src: 'weight', accuracy: prev.accuracy };
}
