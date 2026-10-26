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

export type MorphKey = 'fat_up' | 'fat_down' | 'mus_up' | 'mus_down';
export type Morph = Record<MorphKey, number>;

/** 성별별 3D 모델 — 없는 성별은 2D 실루엣으로 그린다 */
export const MODEL_SEXES: readonly Sex[] = ['male', 'female'];

/**
 * 기본 몸의 좌표. 남성 모델(.blend 원본)은 복근이 선명한 근육질 — 체지방 약 11% · 근육 M4.
 * 남성 모프는 스크립트가 만든 임시 모프(셰이프 키를 조각하면 교체). 여성은 MakeHuman 근육 0.55 · 체중 0.38 기본 몸 +
 * 실제 체중 · 근육 타깃(scripts/build-avatar-female.py).
 */
export const BASE: Record<Sex, Coord> = {
  male: { f: 1.6, m: 4.0 },
  female: { f: 2.0, m: 3.0 },
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function morphFor(sex: Sex, c: Coord): Morph {
  const b = BASE[sex];
  const f = clamp(c.f, 1, 5);
  const m = clamp(c.m, 1, 5);
  return {
    fat_up: f > b.f ? (f - b.f) / (5 - b.f) : 0,
    fat_down: f < b.f ? (b.f - f) / (b.f - 1) : 0,
    mus_up: m > b.m ? (m - b.m) / (5 - b.m) : 0,
    mus_down: m < b.m ? (b.m - m) / (b.m - 1) : 0,
  };
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
