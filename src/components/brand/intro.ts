/**
 * 로그인 인트로 시간표 (ms) — 디자인 캔버스 "밀리터리트래커 로그인 모션"과 같은 값.
 *
 * 화면은 시계 하나(clock: 0 → end)로 움직인다. 요소마다 자기 구간(d ~ d+dur)의 진행률을 계산해 쓴다.
 * 그래서 건너뛰기 = 시계를 끝으로, 다시 보기 = 시계를 0으로, 동작 줄이기 = 처음부터 끝.
 * 시간표는 두 벌 — 처음부터 그리는 INTRO, 스플래시를 이어받는 HANDOFF.
 */
type Span = { readonly d: number; readonly dur: number };

export type Timeline = {
  /** 고리가 위에서부터 양쪽으로 그려진다 */
  readonly arc: Span;
  /** 연기 낀 질감 M 이 형광등처럼 깜빡이며 켜진다 */
  readonly ignite: Span;
  /** 흰 M 이 찍힌다 */
  readonly stamp: Span;
  /** 찍힐 때 퍼지는 충격파 */
  readonly shock: Span;
  /** 워드마크 — 넓은 자간이 좁혀진다 */
  readonly track: Span;
  /** 로고 · 워드마크가 위로 (크기 BIG → 132) */
  readonly rise: Span;
  /** 소개 문구 · 입력칸 · 버튼이 step 간격으로 올라온다 */
  readonly up: Span & { readonly step: number };
  /** 대기 — 고리 위로 빛이 처음 지나가는 때 (그 뒤 6초마다) */
  readonly glint: number;
  readonly end: number;
  /** 두 번째부터(로그아웃 뒤 등)는 여기서 시작한다 — 로고가 다 켜진 상태 */
  readonly short: number;
};

/** 처음부터 — 빈 화면에서 고리 → 질감 M → 흰 M 스탬프. 웹 첫 화면 · 로고를 눌러 다시 볼 때 */
export const INTRO: Timeline = {
  arc: { d: 150, dur: 750 },
  ignite: { d: 450, dur: 900 },
  stamp: { d: 980, dur: 540 },
  shock: { d: 1000, dur: 700 },
  track: { d: 1350, dur: 680 },
  rise: { d: 1950, dur: 680 },
  up: { d: 2450, step: 70, dur: 520 },
  glint: 2700,
  end: 3300,
  short: 1900,
};

/**
 * 스플래시에서 이어받기 — 앱을 켜면 스플래시의 흰 로고(고리 + M)가 같은 자리 · 같은 크기로 그대로 남고,
 * 거기서 질감 M 이 켜지고 → 빛이 고리를 지나고 → 위로 올라가며 입력칸이 나온다.
 * 고리 · 흰 M · 충격파는 이미 끝난 상태(구간을 0 앞에 둔다). 스플래시가 걷히는 200ms 뒤에 질감이 켜진다.
 */
export const HANDOFF: Timeline = {
  arc: { d: -1, dur: 1 },
  ignite: { d: 250, dur: 800 },
  stamp: { d: -1, dur: 1 },
  shock: { d: -1, dur: 1 },
  track: { d: 1000, dur: 600 },
  rise: { d: 1200, dur: 680 },
  up: { d: 1650, step: 70, dur: 520 },
  glint: 500,
  end: 2550,
  short: 1050,
};

/** 구간 진행률 0~1 */
export function seg(t: number, d: number, dur: number): number {
  'worklet';
  return Math.min(1, Math.max(0, (t - d) / dur));
}

export function easeOutCubic(x: number): number {
  'worklet';
  return 1 - Math.pow(1 - x, 3);
}

export function easeOutQuart(x: number): number {
  'worklet';
  return 1 - Math.pow(1 - x, 4);
}

export function easeInOutCubic(x: number): number {
  'worklet';
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function easeInOutQuart(x: number): number {
  'worklet';
  return x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2;
}
