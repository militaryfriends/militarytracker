/**
 * 로고 고리 위치 — m-mark.png · m-texture.png 와 같은 1024 좌표 (scripts/brand-assets.py 가 출력한 값).
 * 로고 원본을 바꾸면 그 스크립트를 다시 돌리고 이 숫자를 맞춘다.
 *
 * 고리는 그림이 아니라 선으로 그린다 — 위에서부터 양쪽으로 그려지는 모션 · 진행 표시를 하려고.
 * 원본처럼 아래 끝은 M 다리 안쪽에서 끝나 다리 뒤로 숨는다.
 */
export const RING = { cx: 512.85, cy: 482.06, r: 334.24, stroke: 11.5 } as const;

const TOP = { x: RING.cx, y: RING.cy - RING.r };
const LEFT_END = { x: 286.7, y: 728.2 };
const RIGHT_END = { x: 716.8, y: 746.9 };

/** 위 가운데 → 왼쪽 아래(다리 안) */
export const ARC_LEFT = `M ${TOP.x} ${TOP.y} A ${RING.r} ${RING.r} 0 0 0 ${LEFT_END.x} ${LEFT_END.y}`;
/** 위 가운데 → 오른쪽 아래(다리 안) */
export const ARC_RIGHT = `M ${TOP.x} ${TOP.y} A ${RING.r} ${RING.r} 0 0 1 ${RIGHT_END.x} ${RIGHT_END.y}`;

/** 한 바퀴 — 위 가운데에서 시계 방향 (성공 때 고리가 완성되는 모션) */
export const RING_FULL = `M ${TOP.x} ${TOP.y} A ${RING.r} ${RING.r} 0 1 1 ${TOP.x} ${RING.cy + RING.r} A ${RING.r} ${RING.r} 0 1 1 ${TOP.x} ${TOP.y}`;

const sweep = (end: { x: number; y: number }) => {
  // 화면 좌표(아래가 +) 각도 차 — 위(-90°)에서 끝점까지
  const a = Math.atan2(end.y - RING.cy, end.x - RING.cx);
  return Math.abs(a - -Math.PI / 2) > Math.PI ? 2 * Math.PI - Math.abs(a + Math.PI / 2) : Math.abs(a + Math.PI / 2);
};

/** 호 길이 (점선 애니메이션용) */
export const ARC_LEFT_LEN = RING.r * sweep(LEFT_END);
export const ARC_RIGHT_LEN = RING.r * sweep(RIGHT_END);
export const RING_LEN = 2 * Math.PI * RING.r;
