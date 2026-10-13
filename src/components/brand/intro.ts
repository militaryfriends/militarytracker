/**
 * 로그인 인트로 시간표 (ms) — 디자인 캔버스 "밀리터리트래커 로그인 모션"과 같은 값.
 *
 * 화면은 시계 하나(clock: 0 → END)로 움직인다. 요소마다 자기 구간(d ~ d+dur)의 진행률을 계산해 쓴다.
 * 그래서 건너뛰기 = 시계를 끝으로, 다시 보기 = 시계를 0으로, 동작 줄이기 = 처음부터 끝.
 *
 *   0.15s  고리가 위에서부터 양쪽으로 그려진다
 *   0.45s  연기 낀 질감 M 이 깜빡이며 점화
 *   0.98s  흰 M 이 찍히고(스탬프) 1.0s 충격파
 *   1.35s  워드마크 — 넓은 자간이 좁혀진다
 *   1.95s  로고 · 워드마크가 위로 (크기 240 → 132)
 *   2.45s~ 소개 문구 · 입력칸 · 버튼이 70ms 간격으로 올라온다
 *   2.7s   대기 — 고리 위로 빛이 6초마다 한 번
 */
export const INTRO = {
  arc: { d: 150, dur: 750 },
  ignite: { d: 450, dur: 900 },
  stamp: { d: 980, dur: 540 },
  shock: { d: 1000, dur: 700 },
  track: { d: 1350, dur: 680 },
  rise: { d: 1950, dur: 680 },
  up: { d: 2450, step: 70, dur: 520 },
  glint: 2700,
  end: 3300,
  /** 두 번째부터(로그아웃 뒤 등)는 로고가 다 그려진 데서 시작한다 */
  short: 1900,
} as const;

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
