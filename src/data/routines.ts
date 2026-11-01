/**
 * 루틴 프리셋
 * 탐색 흐름:  루틴 목록 → 루틴(푸시풀레그) → 데이(푸시데이) → 운동 종목
 */
import { Exercise, exByIds, Place } from './exercises';

export interface RoutineDay {
  id: string;
  name: string;
  focus: string;
  desc: string;
  exIds: string[];
}

export interface Routine {
  id: string;
  name: string;
  short: string;
  subtitle: string;
  desc: string;
  daysPerWeek: number;
  level: 1 | 2 | 3;
  place: Place[];
  tags: string[];
  days: RoutineDay[];
}

export const ROUTINES: Routine[] = [
  {
    id: 'ppl',
    name: '푸시 풀 레그',
    short: 'PPL',
    subtitle: '주 3일 · 미는 동작 / 당기는 동작 / 하체',
    desc: '동작 방향으로 나누는 가장 검증된 3분할. 한 부위를 72시간 간격으로 자극해 회복과 빈도의 균형이 좋습니다.',
    daysPerWeek: 3,
    // 바벨 스쿼트·바벨로우·풀업이 들어가는 구성이라 입문(1)이 아니라 중급으로 표기한다.
    // 입문자는 recommendRoutine 이 fullbody 로 보낸다.
    level: 2,
    place: ['gym'],
    tags: ['3분할', '헬스장', '밸런스'],
    days: [
      {
        id: 'push',
        name: '푸시데이',
        focus: '가슴 · 어깨 · 삼두',
        desc: '몸에서 바깥으로 미는 동작. 큰 근육(가슴)부터 작은 근육(삼두) 순서로 배치합니다.',
        exIds: ['bench', 'incdbpress', 'dbshoulderpress', 'latraise', 'pushdown', 'ohext'],
      },
      {
        id: 'pull',
        name: '풀데이',
        focus: '등 · 이두',
        desc: '몸쪽으로 당기는 동작. 수직 당기기와 수평 당기기를 함께 넣어 광배와 등 두께를 같이 키웁니다.',
        exIds: ['pullup', 'bbrow', 'cablerow', 'facepull', 'bbcurl', 'hammercurl'],
      },
      {
        id: 'legs',
        name: '레그데이',
        focus: '하체 · 코어',
        desc: '스쿼트 계열 + 힌지 계열을 한 번씩. 마지막에 종아리와 코어로 마무리합니다.',
        exIds: ['backsquat', 'rdlleg', 'legpress', 'legcurl', 'calfraise', 'plank'],
      },
    ],
  },
  {
    id: 'ppl6',
    name: '푸시 풀 레그 6일',
    short: 'PPL×2',
    subtitle: '주 6일 · 더블 PPL',
    desc: 'PPL을 주 2회전 돌리는 고빈도 루틴. A/B 세션의 종목을 다르게 구성해 중복 피로를 줄였습니다.',
    daysPerWeek: 6,
    level: 3,
    place: ['gym'],
    tags: ['6분할', '고빈도', '상급'],
    days: [
      { id: 'pushA', name: '푸시 A', focus: '가슴 중심', desc: '수평 프레스 위주의 푸시 세션.', exIds: ['bench', 'incdbpress', 'dbshoulderpress', 'latraise', 'ropepushdown'] },
      { id: 'pullA', name: '풀 A', focus: '등 두께 중심', desc: '데드리프트로 후면사슬을 열고 수평 당기기를 더합니다.', exIds: ['deadlift', 'pullup', 'cablerow', 'facepull', 'bbcurl'] },
      { id: 'legA', name: '레그 A', focus: '대퇴사두 중심', desc: '스쿼트 계열로 앞벅지에 집중합니다.', exIds: ['backsquat', 'legpress', 'legcurl', 'calfraise', 'hanginglegraise'] },
      { id: 'pushB', name: '푸시 B', focus: '어깨 중심', desc: '인클라인과 측면삼각에 볼륨을 더한 세션.', exIds: ['inclinebench', 'dbbench', 'arnold', 'cablelatraise', 'skullcrusher'] },
      { id: 'pullB', name: '풀 B', focus: '광배 중심', desc: '수직 당기기와 단일 팔 동작으로 좌우 불균형을 잡습니다.', exIds: ['latpull', 'bbrow', 'onearmdbrow', 'reversefly', 'incdbcurl'] },
      { id: 'legB', name: '레그 B', focus: '둔근 · 햄스트링', desc: '힌지와 런지 계열로 후면과 단일 다리를 공략합니다.', exIds: ['frontsquat', 'rdlleg', 'bulgarian', 'seatedcalf', 'cablecrunch'] },
    ],
  },
  {
    id: 'upperlower',
    name: '상하체 2분할',
    short: 'U/L',
    subtitle: '주 4일 · 상체 / 하체',
    desc: '주 4일로 각 부위를 2회씩 자극합니다. 시간 대비 효율이 가장 좋은 중급자 루틴.',
    daysPerWeek: 4,
    level: 2,
    place: ['gym'],
    tags: ['2분할', '주4일', '효율'],
    days: [
      { id: 'upperA', name: '상체 A', focus: '가슴 · 등 · 어깨', desc: '수평 프레스와 수평 로우를 짝지어 배치합니다.', exIds: ['bench', 'bbrow', 'dbshoulderpress', 'latpull', 'bbcurl', 'pushdown'] },
      { id: 'lowerA', name: '하체 A', focus: '대퇴사두 중심', desc: '스쿼트를 메인으로 두고 보조 종목을 더합니다.', exIds: ['backsquat', 'rdlleg', 'legext', 'legcurl', 'calfraise'] },
      { id: 'upperB', name: '상체 B', focus: '인클라인 · 수직 당기기', desc: 'A와 각도를 바꿔 같은 부위를 다른 결로 자극합니다.', exIds: ['inclinebench', 'cablerow', 'latraise', 'pullup', 'hammercurl', 'ohext'] },
      { id: 'lowerB', name: '하체 B', focus: '둔근 · 햄스트링', desc: '힙 힌지와 단일 다리 위주로 구성합니다.', exIds: ['legpress', 'hipthrust', 'bulgarian', 'seatedcalf', 'hanginglegraise'] },
    ],
  },
  {
    id: 'ul2',
    name: '상하체 2일',
    short: '2일',
    subtitle: '주 2일 · 상체 / 하체',
    desc: '바쁜 주에 맞춘 최소 루틴. 상체 하루 · 하체 하루로 큰 근육을 모두 한 번씩 자극합니다.',
    daysPerWeek: 2,
    level: 1,
    place: ['gym'],
    tags: ['2분할', '주2일', '바쁜 주'],
    days: [
      { id: 'upper2', name: '상체', focus: '가슴 · 등 · 어깨 · 팔', desc: '미는 동작과 당기는 동작을 짝지어 배치합니다.', exIds: ['bench', 'latpull', 'dbshoulderpress', 'cablerow', 'bbcurl', 'pushdown'] },
      { id: 'lower2', name: '하체', focus: '하체 · 코어', desc: '스쿼트와 힌지를 하나씩, 고립 종목으로 마무리합니다.', exIds: ['backsquat', 'rdlleg', 'legpress', 'legcurl', 'calfraise'] },
    ],
  },
  {
    id: 'bro5',
    name: '부위별 5분할',
    short: '5분할',
    subtitle: '주 5일 · 가슴 / 등 / 하체 / 어깨 / 팔',
    desc: '하루에 한 부위를 집중적으로 터는 고전 분할. 볼륨은 높지만 부위당 빈도는 낮습니다.',
    daysPerWeek: 5,
    level: 2,
    place: ['gym'],
    tags: ['5분할', '고볼륨', '부위별'],
    days: [
      { id: 'chest', name: '가슴', focus: '벤치 · 인클라인 · 플라이', desc: '고중량 프레스 → 각도 변화 → 머신 → 플라이 → 딥스 순서로 가슴 전 영역을 덮습니다.', exIds: ['bench', 'inclinebench', 'chestpressmc', 'pecdeck', 'dipschest'] },
      { id: 'back', name: '등', focus: '로우 · 랫풀다운 · 케이블', desc: '바벨로우로 두께를 먼저 잡고 수직 · 수평 당기기를 더합니다.', exIds: ['bbrow', 'latpull', 'cablerow', 'onearmdbrow', 'straightarmpull'] },
      { id: 'legs', name: '하체', focus: '스쿼트 · 레그프레스 · 힌지', desc: '스쿼트 · 힌지 · 고립을 한 세션에 담습니다.', exIds: ['backsquat', 'legpress', 'rdlleg', 'legext', 'legcurl', 'calfraise'] },
      { id: 'shoulders', name: '어깨', focus: '전·측·후면 삼각', desc: '프레스 1개 + 측면 두 번 + 후면으로 삼각근을 두릅니다.', exIds: ['dbshoulderpress', 'latraise', 'cablelatraise', 'reardeltfly', 'facepullsh'] },
      { id: 'arms', name: '팔', focus: '이두 · 삼두', desc: '이두와 삼두를 번갈아 수행하면 밀도가 올라갑니다.', exIds: ['bbcurl', 'closegripbench', 'hammercurl', 'pushdown', 'ohext'] },
    ],
  },
  {
    id: 'fullbody',
    name: '전신 3일',
    short: '전신',
    subtitle: '주 3일 · 입문자 전신 루틴',
    desc: '한 세션에 전신을 고루 자극합니다. 운동 경력 3개월 미만이라면 여기서 시작하세요.',
    daysPerWeek: 3,
    level: 1,
    place: ['gym'],
    tags: ['입문', '전신', '주3일'],
    days: [
      { id: 'fullA', name: '전신 A', focus: '스쿼트 · 프레스 · 로우', desc: '기본 패턴을 하나씩 익히는 세션.', exIds: ['goblet', 'dbbench', 'onearmdbrow', 'dbshoulderpress', 'plank'] },
      { id: 'fullB', name: '전신 B', focus: '머신 위주', desc: '머신 중심으로 안전하게 무게를 올립니다.', exIds: ['legpress', 'chestpressmc', 'latpull', 'latraise', 'deadbug'] },
      { id: 'fullC', name: '전신 C', focus: '런지 · 케이블', desc: '단일 다리와 케이블로 균형과 가동범위를 채웁니다.', exIds: ['lunge', 'inclinepushup', 'cablerow', 'facepull', 'crunch'] },
    ],
  },
  {
    id: 'home3',
    name: '홈트 3일',
    short: '홈트',
    subtitle: '주 3일 · 맨몸 + 덤벨 + 밴드',
    desc: '집에서 덤벨 한 쌍과 밴드만으로 돌리는 푸시·풀·레그. 장비가 없으면 맨몸 대체 동작을 사용합니다.',
    daysPerWeek: 3,
    level: 1,
    place: ['home'],
    tags: ['홈트', '맨몸', '덤벨'],
    days: [
      { id: 'homePush', name: '홈 푸시', focus: '가슴 · 어깨 · 삼두', desc: '푸시업 변형을 축으로 어깨와 삼두를 더합니다.', exIds: ['pushup', 'incdbpress', 'dbshoulderpress', 'latraise', 'benchdip'] },
      { id: 'homePull', name: '홈 풀', focus: '등 · 이두', desc: '인버티드 로우와 밴드로 당기는 볼륨을 채웁니다.', exIds: ['invertedrow', 'onearmdbrow', 'bandedpulldown', 'facepull', 'dbcurl'] },
      { id: 'homeLegs', name: '홈 레그', focus: '하체 · 코어', desc: '단일 다리 동작으로 맨몸에서도 충분한 강도를 만듭니다.', exIds: ['bwsquat', 'bulgarian', 'glutebridge', 'calfraise', 'plank'] },
    ],
  },
  {
    id: 'core',
    name: '코어 10분',
    short: '코어',
    subtitle: '주 2~3일 · 10분 복근 서킷',
    desc: '메인 운동 후 붙이는 짧은 코어 서킷. 세트 간 휴식을 30초로 줄여 서킷처럼 돌립니다. A·B 두 세션을 번갈아 합니다.',
    daysPerWeek: 2,
    level: 1,
    place: ['gym', 'home'],
    tags: ['코어', '10분', '서킷'],
    days: [
      { id: 'coreA', name: '코어 A', focus: '상복부 · 하복부', desc: '위아래 복직근을 번갈아 자극합니다.', exIds: ['crunch', 'legraise', 'plank', 'bicyclecrunch', 'deadbug'] },
      { id: 'coreB', name: '코어 B', focus: '복사근 · 안정화', desc: '회전과 버티기 위주의 세션.', exIds: ['sideplank', 'russiantwist', 'hollowhold', 'pallofpress', 'flutterkick'] },
    ],
  },
];

const ROUTINE_MAP = new Map(ROUTINES.map((r) => [r.id, r]));

export const routineById = (id: string): Routine | undefined => ROUTINE_MAP.get(id);

export function routineDay(routineId: string, dayId: string): RoutineDay | undefined {
  return routineById(routineId)?.days.find((d) => d.id === dayId);
}

export function routineExercises(routineId: string, dayId: string): Exercise[] {
  const day = routineDay(routineId, dayId);
  return day ? exByIds(day.exIds) : [];
}

/** 루틴 전체 종목 수 */
export const routineExCount = (r: Routine): number =>
  r.days.reduce((sum, d) => sum + d.exIds.length, 0);

/** 온보딩 응답 기반 추천 루틴 */
export function recommendRoutine(opts: {
  place: Place;
  days: number;
  level: 1 | 2 | 3;
}): Routine {
  const { place, days, level } = opts;
  if (place === 'home') return routineById('home3')!;
  // 입문자는 주 4일 이하까지 풀바디 — 바벨 복합운동 위주 분할은 중급부터
  if (level === 1 && days <= 4) return routineById('fullbody')!;
  if (days <= 2) return routineById('ul2')!;
  if (days >= 6) return routineById('ppl6')!;
  if (days === 5) return routineById('bro5')!;
  if (days === 4) return routineById('upperlower')!;
  return routineById('ppl')!;
}
