/**
 * 자동 루틴 템플릿 — "헬스장 정석 루틴" (2026-11-01, 대표 피드백 10/31 3절).
 *
 * 원칙
 *  1. 레벨은 종목이 아니라 강도를 바꾼다(세트 · RIR — src/utils/prescription.ts). 종목은 같은 정석 종목.
 *     예외: 입문자는 바벨 대신 머신 · 덤벨로 시작하는 대체 종목(slot.beginner).
 *  2. 헬스장은 장비가 다 있다고 본다 — 바벨 · 머신 · 케이블 먼저. 맨몸 변형(아처 · 플라이오 · 스파이더맨 · 힌두 푸시업)은 홈트 · 라이브러리에만.
 *  3. 순서: 고중량 복합 → 각도 변화 → 머신 → 고립 → 마무리.
 *  4. 위험 종목(길로틴 프레스 · 비하인드넥 프레스)은 자동 배정하지 않는다(DANGER).
 *  5. 허리 부하 종목(LUMBAR)은 같은 날 1개만, 데드리프트 · 랙풀은 주 1회만.
 *  6. '자동 재구성'은 슬롯 안에서만 바꾼다(opts 의 다른 종목). 순서 · 슬롯 수는 그대로.
 *  7. 영상이 있는 종목을 먼저(같은 슬롯에 영상 있는 대체가 있으면 그걸).
 * 슬롯의 opts 첫 번째가 기본값이다.
 */
import type { Place } from './exercises';

export interface Slot {
  /** 이 자리에 올 수 있는 종목(앞이 기본) */
  opts: string[];
  /** 입문자 대체(바벨 → 머신 · 덤벨). 없으면 opts */
  beginner?: string[];
  /** 6번째 선택 슬롯(카프 · 복근) — 하루 종목 수가 5 를 넘을 때만 */
  optional?: boolean;
}

export interface DayTemplate {
  id: string;
  name: string;
  focus: string;
  slots: Slot[];
}

/** 자동 배정하지 않는 종목 — 라이브러리 · 자세 가이드에는 남긴다 */
export const DANGER = new Set(['guillotine', 'behindneckpress']);
/** 허리 부하 종목 — 같은 날 1개만 */
export const LUMBAR = new Set(['deadlift', 'rackpull', 'pendlay', 'bbrow', 'goodmorning']);
/** 주 1회만 */
export const WEEKLY_ONCE = new Set(['deadlift', 'rackpull']);

const S = (opts: string[], beginner?: string[], optional?: boolean): Slot => ({ opts, beginner, optional });

// ─── 헬스장 — 부위 데이 ───────────────────────────────────────────────────
// 가슴 순서는 대표가 정한 것: 벤치 → 인클라인 → 프레스 머신 → 플라이 → 딥스
const G_CHEST: DayTemplate = {
  id: 'chest', name: '가슴', focus: '벤치 · 인클라인 · 플라이',
  slots: [
    S(['bench', 'smithbench'], ['dbbench', 'smithbench']),
    S(['inclinebench', 'incdbpress'], ['incdbpress']),
    S(['chestpressmc']),
    S(['pecdeck', 'crossover', 'lowcablefly']),
    S(['dipschest', 'declinebench'], ['dbfly', 'crossover']),
    S(['calfraise', 'cablecrunch', 'legraise'], undefined, true),
  ],
};
const G_BACK: DayTemplate = {
  id: 'back', name: '등', focus: '로우 · 랫풀다운 · 케이블',
  slots: [
    S(['bbrow', 'tbarrow'], ['chestsupportedrow', 'tbarrow']),
    S(['latpull', 'pullup', 'widelatpull'], ['latpull', 'assistedpullup']),
    S(['cablerow', 'chestsupportedrow']),
    S(['onearmdbrow', 'dbrow']),
    S(['straightarmpull', 'cablepullover']),
    S(['cablecrunch', 'hanginglegraise', 'plank'], ['plank', 'crunch'], true),
  ],
};
const G_LEGS: DayTemplate = {
  id: 'legs', name: '하체', focus: '스쿼트 · 레그프레스 · 힌지',
  slots: [
    S(['backsquat', 'hacksquat', 'smithsquat'], ['goblet', 'smithsquat']),
    S(['legpress', 'hacksquat']),
    S(['rdlleg', 'hipthrust']),
    S(['legext']),
    S(['legcurl', 'lyinglegcurl', 'seatedlegcurl']),
    S(['calfraise', 'seatedcalf'], undefined, true),
  ],
};
const G_SHOULDERS: DayTemplate = {
  id: 'shoulders', name: '어깨', focus: '프레스 · 측면 · 후면',
  slots: [
    S(['dbshoulderpress', 'ohp', 'shoulderpressmc', 'smithshoulderpress'], ['shoulderpressmc', 'dbshoulderpress']),
    S(['latraise', 'onearmlatraise']),
    S(['cablelatraise', 'leaninglatraise'], ['cablelatraise']),
    S(['reardeltfly', 'cablereardelt', 'bentoverraise']),
    S(['facepullsh', 'facepull']),
    S(['shrug', 'bbshrug'], undefined, true),
  ],
};
const G_ARMS: DayTemplate = {
  id: 'arms', name: '팔', focus: '이두 · 삼두',
  slots: [
    S(['bbcurl', 'dbcurl']),
    S(['closegripbench', 'skullcrusher'], ['pushdown', 'ropepushdown']),
    S(['hammercurl', 'incdbcurl', 'cablehammer'], ['hammercurl', 'cablecurl']),
    S(['pushdown', 'ropepushdown']),
    S(['ohext', 'ohropeext']),
    S(['cablecrunch', 'legraise'], undefined, true),
  ],
};

// ─── 헬스장 — 분할 데이 ───────────────────────────────────────────────────
const G_PUSH = (v: 'A' | 'B'): DayTemplate => ({
  id: v === 'A' ? 'push' : 'pushB', name: v === 'A' ? '푸시데이' : '푸시 B', focus: '가슴 · 어깨 · 삼두',
  slots: v === 'A'
    ? [S(['bench', 'smithbench'], ['dbbench', 'chestpressmc']), S(['incdbpress', 'inclinebench']), S(['dbshoulderpress', 'ohp', 'shoulderpressmc'], ['shoulderpressmc', 'dbshoulderpress']),
      S(['latraise', 'cablelatraise']), S(['pushdown', 'ropepushdown']), S(['ohext', 'ohropeext'], undefined, true)]
    : [S(['inclinebench', 'incdbpress'], ['incdbpress']), S(['chestpressmc', 'dbbench']), S(['ohp', 'shoulderpressmc', 'dbshoulderpress'], ['shoulderpressmc']),
      S(['cablelatraise', 'latraise']), S(['skullcrusher', 'ohropeext'], ['ropepushdown']), S(['pecdeck', 'crossover'], undefined, true)],
});
const G_PULL = (v: 'A' | 'B'): DayTemplate => ({
  id: v === 'A' ? 'pull' : 'pullB', name: v === 'A' ? '풀데이' : '풀 B', focus: '등 · 이두',
  slots: v === 'A'
    ? [S(['latpull', 'pullup'], ['latpull', 'assistedpullup']), S(['bbrow', 'tbarrow'], ['chestsupportedrow']), S(['cablerow', 'chestsupportedrow']),
      S(['facepull', 'reversefly']), S(['bbcurl', 'dbcurl']), S(['hammercurl', 'cablehammer'], undefined, true)]
    : [S(['deadlift', 'rdl'], ['rdl']), S(['pullup', 'latpull'], ['latpull', 'assistedpullup']), S(['onearmdbrow', 'cablerow']),
      S(['straightarmpull', 'cablepullover']), S(['incdbcurl', 'cablecurl'], ['cablecurl']), S(['facepull', 'reversefly'], undefined, true)],
});
const G_LEGDAY = (v: 'A' | 'B'): DayTemplate => ({
  id: v === 'A' ? 'legs' : 'legsB', name: v === 'A' ? '레그데이' : '레그 B', focus: '하체 · 코어',
  slots: v === 'A'
    ? [S(['backsquat', 'hacksquat'], ['goblet', 'smithsquat']), S(['rdlleg', 'hipthrust']), S(['legpress', 'hacksquat']),
      S(['legcurl', 'seatedlegcurl']), S(['legext']), S(['calfraise', 'seatedcalf'], undefined, true)]
    : [S(['hacksquat', 'frontsquat', 'smithsquat'], ['legpress', 'smithsquat']), S(['hipthrust', 'glutebridge']), S(['bulgarian', 'walkinglunge'], ['lunge']),
      S(['lyinglegcurl', 'legcurl']), S(['seatedcalf', 'calfraise']), S(['cablecrunch', 'hanginglegraise'], ['plank'], true)],
});
const G_UPPER = (v: 'A' | 'B'): DayTemplate => ({
  id: v === 'A' ? 'upper' : 'upperB', name: v === 'A' ? '상체' : '상체 B', focus: '가슴 · 등 · 어깨 · 팔',
  slots: v === 'A'
    ? [S(['bench', 'smithbench'], ['dbbench', 'chestpressmc']), S(['bbrow', 'tbarrow'], ['chestsupportedrow']), S(['dbshoulderpress', 'ohp', 'shoulderpressmc'], ['shoulderpressmc']),
      S(['latpull', 'pullup'], ['latpull']), S(['bbcurl', 'dbcurl']), S(['pushdown', 'ropepushdown'])]
    : [S(['incdbpress', 'inclinebench']), S(['cablerow', 'chestsupportedrow']), S(['latraise', 'cablelatraise']),
      S(['pullup', 'latpull'], ['latpull', 'assistedpullup']), S(['hammercurl', 'incdbcurl']), S(['ohext', 'ohropeext'])],
});
const G_LOWER = (v: 'A' | 'B'): DayTemplate => ({
  id: v === 'A' ? 'lower' : 'lowerB', name: v === 'A' ? '하체' : '하체 B', focus: '하체 · 코어',
  slots: v === 'A'
    ? [S(['backsquat', 'hacksquat'], ['goblet', 'smithsquat']), S(['rdlleg', 'hipthrust']), S(['legext']), S(['legcurl', 'seatedlegcurl']), S(['calfraise', 'seatedcalf']), S(['plank', 'cablecrunch'], undefined, true)]
    : [S(['legpress', 'hacksquat']), S(['hipthrust', 'glutebridge']), S(['bulgarian', 'reverselunge'], ['lunge']), S(['lyinglegcurl', 'legcurl']), S(['seatedcalf', 'calfraise']), S(['hanginglegraise', 'cablecrunch'], ['legraise'], true)],
});

// 입문 전신(주 3일 이하 · 입문) — 머신 · 덤벨 위주
const G_FULL = (v: 'A' | 'B' | 'C'): DayTemplate => ({
  id: `full${v}`, name: `전신 ${v}`, focus: v === 'A' ? '스쿼트 · 프레스 · 로우' : v === 'B' ? '머신 위주' : '런지 · 케이블',
  slots: v === 'A'
    ? [S(['goblet', 'legpress']), S(['dbbench', 'chestpressmc']), S(['latpull']), S(['dbshoulderpress', 'shoulderpressmc']), S(['plank', 'deadbug'])]
    : v === 'B'
      ? [S(['legpress']), S(['chestpressmc', 'dbbench']), S(['cablerow', 'chestsupportedrow']), S(['latraise']), S(['deadbug', 'crunch'])]
      : [S(['lunge', 'reverselunge']), S(['incdbpress', 'inclinepushup']), S(['onearmdbrow', 'cablerow']), S(['facepull']), S(['crunch', 'plank'])],
});

// ─── 홈트 — 맨몸 · 덤벨 · 밴드 ─────────────────────────────────────────────
const H_PUSH: DayTemplate = {
  id: 'homePush', name: '홈 푸시', focus: '가슴 · 어깨 · 삼두',
  slots: [S(['pushup', 'dbbench', 'floorpress']), S(['incdbpress', 'declinepushup'], ['incdbpress', 'inclinepushup']), S(['dbshoulderpress', 'pikepushupsh'], ['dbshoulderpress']),
    S(['latraise', 'bandedlatraise']), S(['benchdip', 'ohext'], ['ohext', 'kickback']), S(['diamondpushup', 'kickback'], ['kickback'], true)],
};
const H_PULL: DayTemplate = {
  id: 'homePull', name: '홈 풀', focus: '등 · 이두',
  slots: [S(['invertedrow', 'chinup'], ['invertedrow', 'dbrow']), S(['onearmdbrow', 'dbrow']), S(['bandedpulldown', 'reversefly']),
    S(['facepull', 'reversefly']), S(['dbcurl', 'hammercurl']), S(['hammercurl', 'concentrationcurl'], undefined, true)],
};
const H_LEGS: DayTemplate = {
  id: 'homeLegs', name: '홈 레그', focus: '하체 · 코어',
  slots: [S(['dbsquat', 'goblet', 'bwsquat'], ['bwsquat', 'goblet']), S(['bulgarian', 'reverselunge'], ['lunge', 'reverselunge']), S(['rdl', 'sldl'], ['glutebridge']),
    S(['glutebridge', 'hipthrust']), S(['calfraise']), S(['plank', 'deadbug'], undefined, true)],
};
const H_UPPER: DayTemplate = {
  id: 'homeUpper', name: '홈 상체', focus: '가슴 · 등 · 어깨',
  slots: [S(['pushup', 'dbbench']), S(['invertedrow', 'onearmdbrow'], ['onearmdbrow']), S(['dbshoulderpress']), S(['bandedpulldown', 'dbrow']), S(['dbcurl', 'hammercurl']), S(['ohext', 'benchdip'], ['ohext'], true)],
};
const H_LOWER: DayTemplate = {
  id: 'homeLower', name: '홈 하체', focus: '하체 · 코어',
  slots: [S(['goblet', 'dbsquat'], ['bwsquat']), S(['rdl', 'sldl'], ['glutebridge']), S(['reverselunge', 'stepup']), S(['glutebridge', 'hipthrust']), S(['calfraise']), S(['plank', 'deadbug'], undefined, true)],
};

/** 주 N일 × 장소 × 레벨 → 데이 템플릿 */
export function splitTemplates(place: Place, days: number, level: 1 | 2 | 3): DayTemplate[] {
  const d = Math.min(6, Math.max(2, Math.round(days)));
  if (place === 'home') {
    if (d === 2) return [H_UPPER, H_LOWER];
    if (d === 3) return [H_PUSH, H_PULL, H_LEGS];
    if (d === 4) return [H_UPPER, H_LOWER, H_PUSH, H_LEGS];
    if (d === 5) return [H_PUSH, H_PULL, H_LEGS, H_UPPER, H_LOWER];
    return [H_PUSH, H_PULL, H_LEGS, H_PUSH, H_PULL, H_LEGS];
  }
  if (level === 1 && d <= 3) return d === 2 ? [G_FULL('A'), G_FULL('B')] : [G_FULL('A'), G_FULL('B'), G_FULL('C')];
  if (d === 2) return [G_UPPER('A'), G_LOWER('A')];
  if (d === 3) return [G_PUSH('A'), G_PULL('A'), G_LEGDAY('A')];
  if (d === 4) return [G_UPPER('A'), G_LOWER('A'), G_UPPER('B'), G_LOWER('B')];
  if (d === 5) return [G_CHEST, G_BACK, G_LEGS, G_SHOULDERS, G_ARMS];
  return [G_PUSH('A'), G_PULL('A'), G_LEGDAY('A'), G_PUSH('B'), G_PULL('B'), G_LEGDAY('B')];
}

/** 분할 이름(설명용) */
export function splitLabel(place: Place, days: number, level: 1 | 2 | 3): string {
  const d = Math.min(6, Math.max(2, Math.round(days)));
  if (place === 'home') return d === 2 ? '홈 상하체 2분할' : d === 4 ? '홈 상하체 + 푸시 · 레그' : '홈 푸시 · 풀 · 레그';
  if (level === 1 && d <= 3) return '입문 전신';
  return d === 2 ? '상하체 2분할' : d === 3 ? '푸시 · 풀 · 레그' : d === 4 ? '상하체 2분할 × 2' : d === 5 ? '부위별 5분할' : '푸시 · 풀 · 레그 × 2';
}
