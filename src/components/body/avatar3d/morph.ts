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

export type MorphKey = 'fat_up' | 'fat_down' | 'mus_up' | 'mus_down' | 'soft';
/**
 * soft = 근육 결 · 복근 칸을 지운 몸(밀프 원본 남성만 가진 키 — 없는 모델은 무시된다).
 * 실제 사람은 체지방이 15% 를 넘으면 복근이 거의 안 보이고, 근육이 적으면 결이 없다 — 그 곡선을 여기서 정한다.
 */
export type Morph = Record<MorphKey, number>;

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

export function morphFor(sex: Sex, c: Coord): Morph {
  const b = BASE[sex];
  const f = clamp(c.f, 1, 5);
  const m = clamp(c.m, 1, 5);
  return {
    fat_up: f > b.f ? Math.pow((f - b.f) / (5 - b.f), FAT_CURVE[sex]) : 0,
    fat_down: f < b.f ? (b.f - f) / (b.f - 1) : 0,
    mus_up: m > b.m ? (m - b.m) / (5 - b.m) : 0,
    mus_down: m < b.m ? (b.m - m) / (b.m - 1) : 0,
    soft: softFor(sex, f, m),
  };
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
