/**
 * 3D 아바타 — 엔진 좌표(체지방 f · 근육 m, 1.0~5.0) → 모델 모프 값.
 *
 * 모델(assets/avatar/avatar_{m|f}.glb, scripts/build-avatar-3d.py)은 기본 몸 하나에 모프 4개를 가진다.
 *   fat_up   기본 → F5     fat_down 기본 → F1
 *   mus_up   기본 → M5     mus_down 기본 → M1
 * 기본 몸이 지도에서 어디인지(BASE)는 모델마다 다르다 — 모델을 바꾸면 여기 값도 맞춘다.
 * 숫자는 엔진이 정하고, 3D 는 그 좌표를 몸으로 보여주기만 한다(AI 없음).
 */
import { parseCell, toCoord, type Coord, type Sex } from '../../../utils/bodyComp';

export type MorphKey =
  | 'fat_up' | 'fat_down' | 'mus_up' | 'mus_down' | 'soft'
  // 체형 축 (scripts/avatar-shape-axes.py, 2026-11-15) — 없는 모델은 무시된다
  | 'belly' | 'lower' | 'mus_bias' | 'shoulder' | 'pelvis' | 'fat_xl';
/**
 * soft = 근육 결 · 복근 칸을 지운 몸(밀프 원본 남성만 가진 키 — 없는 모델은 무시된다).
 * 실제 사람은 체지방이 15% 를 넘으면 복근이 거의 안 보이고, 근육이 적으면 결이 없다 — 그 곡선을 여기서 정한다.
 */
export type Morph = Record<MorphKey, number>;

/**
 * 체형 축 — 체지방 · 근육 좌표만으로는 못 그리는 몸(뱃살형 · 하체형 · 어깨 넓은 몸 · 고도 비만).
 * 전부 0(생략)이면 지금까지와 같은 몸이다. **그리기에만 쓴다** — 숫자(체지방 · 칼로리 · 기간)는 엔진이 좌표로만 계산한다.
 *   belly    배 집중: 1 = 허리 +12cm(키 176 환산), 팔다리는 그대로      (-0.5 ~ 1)
 *   lower    하체 집중: 1 = 엉덩이 +8cm                                (-0.5 ~ 1)
 *   musBias  근육 분포: +1 상체형 · -1 하체형                          (-1 ~ 1)
 *   shoulder 어깨 너비: 1 = 좌우 +2cm 씩                               (-1 ~ 1)
 *   pelvis   골반 너비: 1 = 좌우 +1.5cm 씩                             (-1 ~ 1)
 *   xl       고도 체지방: 체지방 좌표 5(남 28% · 여 38%) 너머. 1 = 약 +10%p (0 ~ 1) — xlFor()
 */
export interface Shape {
  belly?: number;
  lower?: number;
  musBias?: number;
  shoulder?: number;
  pelvis?: number;
  xl?: number;
}

/** 성별별 3D 모델 — 없는 성별은 2D 실루엣으로 그린다 */
export const MODEL_SEXES: readonly Sex[] = ['male', 'female'];

/**
 * 기본 몸의 좌표. 남녀 모두 MakeHuman(CC0) 기본 메시 + 진짜 체중 · 근육 매크로 타깃(scripts/build-avatar-mh.py, 2026-11-01).
 * 남 = 중간 체형(근육 0.5 · 체중 0.5 ≈ F3M3) — 근육 결이 은은한 몸에서 빼고 더한다. 여 = 근육 0.55 · 체중 0.38 ≈ F2M3.
 */
export const BASE: Record<Sex, Coord> = {
  // 남 = 밀리터리프렌즈 원본 몸(체지방 약 11% · 근육질 ≈ F1.6M4) + 대표 셰이프 키 4개 + soft (2026-11-10)
  male: { f: 1.6, m: 4.0 },
  female: { f: 2.0, m: 3.0 },
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * fat_up 곡선 — 실제 사람은 체지방이 낮을 때 허리가 천천히, 높을 때 빠르게 는다(RFM: 허리 ∝ 1/(64 − 체지방)).
 * 남 1.8 = 25칸 실측(scripts/avatar-measure.py, 키 176 환산)에서 허리가 F2 80 · F3 84 · F4 90 · F5 98cm 가 되는 값.
 */
const FAT_CURVE: Record<Sex, number> = { male: 1.8, female: 1 };

export function morphFor(sex: Sex, c: Coord, shape: Shape = {}): Morph {
  const b = BASE[sex];
  const f = clamp(c.f, 1, 5);
  const m = clamp(c.m, 1, 5);
  return {
    fat_up: f > b.f ? Math.pow((f - b.f) / (5 - b.f), FAT_CURVE[sex]) : 0,
    fat_down: f < b.f ? (b.f - f) / (b.f - 1) : 0,
    mus_up: m > b.m ? (m - b.m) / (5 - b.m) : 0,
    mus_down: m < b.m ? (b.m - m) / (b.m - 1) : 0,
    // 배가 나오면 복근 칸도 묻힌다
    soft: 1 - (1 - softFor(sex, f, m)) * (1 - 0.9 * clamp(shape.belly ?? 0, 0, 1)),
    belly: clamp(shape.belly ?? 0, -0.5, 1),
    lower: clamp(shape.lower ?? 0, -0.5, 1),
    mus_bias: clamp(shape.musBias ?? 0, -1, 1),
    shoulder: clamp(shape.shoulder ?? 0, -1, 1),
    pelvis: clamp(shape.pelvis ?? 0, -1, 1),
    // 고도 체지방은 살 좌표가 끝(5)까지 갔을 때만 — 그 전에는 fat_up 이 그린다
    fat_xl: f >= 5 ? clamp(shape.xl ?? 0, 0, 1) : 0,
  };
}

/** 지도 끝(남 28% · 여 38%)을 넘는 체지방률 → 고도 체지방 세기 0~1 (+10%p 에서 1) */
export const xlFor = (sex: Sex, bfPct: number): number => clamp((bfPct - (sex === 'male' ? 28 : 38)) / 10, 0, 1);

/**
 * 저장된 체형(내 몸 맞추기) → 이 좌표의 몸에 그릴 체형.
 *  · 뼈대(어깨 · 골반)와 근육 분포는 몸이 변해도 그대로 간다.
 *  · 살이 몰린 곳(배 · 하체)은 살이 빠지면 같이 줄어든다 — 체지방 좌표 3 이상이면 그대로, 1(가장 마름)이면 0.
 *    그래서 "지금" 몸에서 고른 뱃살이 "예상" 몸에서는 덜 나온다.
 *  · 고도 체지방은 저장값이 아니라 체지방률에서 바로 나온다(bfPct 를 주면).
 * 전부 0 이면 undefined(예전 그림 그대로).
 */
export function shapeAt(sex: Sex, stored: Omit<Shape, 'xl'> | null | undefined, c: Coord, bfPct?: number): Shape | undefined {
  const fat = clamp((clamp(c.f, 1, 5) - 1) / 2, 0, 1);
  const out: Shape = {
    belly: (stored?.belly ?? 0) * fat,
    lower: (stored?.lower ?? 0) * fat,
    musBias: stored?.musBias ?? 0,
    shoulder: stored?.shoulder ?? 0,
    pelvis: stored?.pelvis ?? 0,
    xl: bfPct === undefined ? 0 : xlFor(sex, bfPct),
  };
  return shapeKey(out) ? out : undefined;
}

/**
 * 결 지우기 세기 — 체지방: F1 0 · F2 약 0.3 · F3 약 0.8 · F4 이상 1 (남 9 · 13 · 17 · 22%),
 * 근육: M4 이상 0 · M3 0.25 · M2 0.5 · M1 0.7. 둘을 합칠 때는 1 - (1-a)(1-b).
 */
function softFor(sex: Sex, f: number, m: number): number {
  if (sex !== 'male') return 0;
  const fs = clamp((f - 1.6) / (3.6 - 1.6), 0, 1);
  const ms = clamp((4 - m) / 3, 0, 1) * 0.7;
  return 1 - (1 - Math.pow(fs, 0.85)) * (1 - ms);
}

/** 체지방률 · nFFMI → 좌표 */
export const coordOf = (sex: Sex, bfPct: number, nffmi: number): Coord => toCoord(sex, bfPct, nffmi);

/** 칸만 알 때 — 칸 중심 = 정수 좌표 (F2M4 → f 2, m 4) */
export const cellCoord = (cell: string): Coord => {
  const { f, m } = parseCell(cell);
  return { f, m };
};

export const lerpCoord = (a: Coord, b: Coord, t: number): Coord => ({ f: a.f + (b.f - a.f) * t, m: a.m + (b.m - a.m) * t });

export const coordKey = (c: Coord) => `${c.f.toFixed(2)}_${c.m.toFixed(2)}`;

/** 체형 축 값 묶음의 열쇠(캐시 · 의존성) — 전부 0 이면 빈 문자열 */
export const shapeKey = (s?: Shape): string => {
  if (!s) return '';
  const v = [s.belly, s.lower, s.musBias, s.shoulder, s.pelvis, s.xl].map((x) => (x ?? 0).toFixed(2));
  return v.every((x) => x === '0.00') ? '' : v.join('_');
};
