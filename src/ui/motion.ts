/**
 * 모션 값 — 한 곳에서. 값은 smiscamp 앱(같은 RN 0.86)에서 써 본 것 그대로.
 * 움직임은 reanimated 로 화면 스레드에서 돌린다 (JS 가 바빠도 끊기지 않게).
 * 장식으로 계속 도는 것은 동작 줄이기면 멈춘다 (useReducedMotion). 휴식 고리처럼 정보인 것은 계속 움직인다.
 */
import { Easing } from 'react-native-reanimated';

export const SPRING = {
  /** 놓았을 때 튕겨 돌아옴 — 모든 누르는 것 */
  press: { damping: 9, stiffness: 260, mass: 0.7 },
  /** 출렁이지 않고 도착 — 탭 판 · 세그먼트 */
  snap: { damping: 30, stiffness: 320, mass: 0.9 },
  /** 톡 튀어나옴 — 체크 · 배지 · PR */
  pop: { damping: 7, stiffness: 300, mass: 1 },
  /** 아이콘 튀기 */
  bounce: { damping: 6, stiffness: 320, mass: 1 },
  /** 막대가 차오름 */
  fill: { damping: 18, stiffness: 140, mass: 1 },
} as const;

export const DURATION = {
  pressIn: 110,
  fast: 180,
  base: 240,
  slow: 400,
  count: 900,
} as const;

export const EASE = {
  /** 테마 막 · 일반 전환 */
  standard: Easing.bezier(0.4, 0, 0.2, 1),
  out: Easing.out(Easing.cubic),
} as const;

/** 눌렸을 때 크기 — 큰 카드 · 버튼 · 작은 버튼 */
export const PRESS_SCALE = { card: 0.98, button: 0.96, small: 0.94 } as const;
