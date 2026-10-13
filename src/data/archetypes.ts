/**
 * 목표 체형 카드 10장 (성별 5장씩) — 명세 3-3. 카드는 지도의 한 칸에 매핑된다.
 * 카드 이미지는 따로 만들지 않고 그 칸의 프리셋 아바타를 그대로 쓴다(src/data/avatarGrid.ts).
 *
 * functions/src/engine/archetypes.ts 에 같은 내용으로 복사돼 있다(서버가 프로젝트 이름을 다시 만든다).
 */
import { GRID, MUSCLE_LABEL, cellCenter, parseCell, type Sex } from '../utils/bodyComp';

export interface Archetype {
  id: string;
  sex: Sex;
  name: string;
  cell: string;
  bfPct: number;
  nffmi: number;
  /** 카드 한 줄 */
  line: string;
}

const a = (id: string, sex: Sex, name: string, cell: string, line: string): Archetype => {
  const c = cellCenter(sex, cell);
  return { id, sex, name, cell, bfPct: c.bfPct, nffmi: c.nffmi, line };
};

export const ARCHETYPES: readonly Archetype[] = [
  a('m_slim', 'male', '슬림 탄탄', 'F2M2', '군살 없이 가벼운 몸'),
  a('m_lean', 'male', '린 머슬', 'F2M4', '옷 위로도 티 나는 운동한 몸'),
  a('m_abs', 'male', '선명한 복근', 'F1M3', '복근이 보이는 균형 잡힌 몸'),
  a('m_physique', 'male', '피지크', 'F1M5', '무대급, 수년 단위 목표'),
  a('m_power', 'male', '파워 벌크', 'F3M5', '크고 두꺼운 몸'),
  a('f_slim', 'female', '슬림 라인', 'F2M2', '가늘고 가벼운 라인'),
  a('f_toned', 'female', '탄탄 라인', 'F2M3', '매끄럽고 탄력 있는 몸'),
  a('f_athletic', 'female', '에슬레틱', 'F2M4', '운동한 티가 나는 몸'),
  a('f_abs', 'female', '선명한 복근', 'F1M4', '복근 라인이 보이는 몸'),
  a('f_strong', 'female', '스트롱', 'F3M5', '힘 있고 단단한 몸'),
];

export const archetypeById = (id: string): Archetype | undefined => ARCHETYPES.find((x) => x.id === id);
export const archetypesFor = (sex: Sex): Archetype[] => ARCHETYPES.filter((x) => x.sex === sex);

/** 체지방 칸 설명 (명세 4-2 체크 포인트) */
export const FAT_LABEL = ['복근 선명', '복근 윤곽', '평평한 배', '배·옆구리 살', '배 나옴'] as const;

/** 칸 이름 — 카드가 있는 칸이면 그 이름, 아니면 "근육질 · 복근 윤곽" 처럼 */
export function cellLabel(sex: Sex, cell: string): string {
  const hit = ARCHETYPES.find((x) => x.sex === sex && x.cell === cell);
  if (hit) return hit.name;
  const { f, m } = parseCell(cell);
  return `${MUSCLE_LABEL[m - 1]} · ${FAT_LABEL[f - 1]}`;
}

/** 표시용 체지방률 — 카드의 "체지방률 약 N%" */
export const archetypeBf = (x: Archetype): number => x.bfPct;

/** 성별 체지방 하한 — 3-4 */
export const bfFloor = (sex: Sex): number => GRID[sex].bfMin;
