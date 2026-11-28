/**
 * 루틴 프리셋
 * 탐색 흐름:  루틴 목록 → 루틴(푸시풀레그) → 데이(푸시데이) → 운동 종목
 *
 * 두 종류(2026-11-28 대표 결정)
 *  · 분할 루틴(kind 없음): 일주일을 짜 준다 → '내 플랜으로 바꾸기' = 플랜 전체 교체. 둘러보기 맨 위.
 *  · 부위 집중 루틴(kind 'focus'): 운동하는 날 끝에 얹는 2~5동작 → '○○데이에 붙이기' 또는 '지금 한 번만 하기'. 플랜은 그대로.
 *    주제는 목적별 루틴 계정(fitonomy.coach 등)에서 많이 찾는 것들을 골라 우리 종목으로 다시 짰다 — 문구 · 구성은 우리 것,
 *    효과를 약속하는 말 대신 어디에 관여하는지만 쓴다.
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
  /** 없으면 분할 루틴 */
  kind?: 'focus';
  /** 부위 집중 루틴 묶음(둘러보기 소제목) */
  group?: FocusGroup;
  /** 붙이기 좋은 요일의 부위 낱말(utils/planAddons suggestDay) */
  attach?: string[];
}

export type FocusGroup = '등' | '가슴' | '어깨' | '팔' | '하체' | '코어' | '홈트' | '조건';
export const FOCUS_GROUPS: readonly FocusGroup[] = ['등', '가슴', '어깨', '팔', '하체', '코어', '홈트', '조건'];

export const ROUTINES: Routine[] = [
  {
    id: 'ppl',
    name: '푸시 풀 레그',
    short: 'PPL',
    subtitle: '주 3일 · 미는 동작 / 당기는 동작 / 하체',
    desc: '미는 동작 · 당기는 동작 · 하체로 나눈 3분할. 한 부위를 주 1~2회 운동합니다.',
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
    id: 'split3',
    name: '3분할',
    short: '3분할',
    subtitle: '주 3일 · 가슴·삼두 / 등·이두 / 하체·어깨',
    desc: '같이 쓰이는 근육끼리 묶은 고전 3분할. 미는 날 · 당기는 날 · 하체 날 순서로 돌립니다.',
    daysPerWeek: 3,
    level: 2,
    place: ['gym'],
    tags: ['3분할', '헬스장', '고전'],
    days: [
      { id: 'chesttri', name: '가슴·삼두', focus: '가슴 · 삼두', desc: '가슴 프레스로 시작해 삼두로 마무리합니다.', exIds: ['bench', 'incdbpress', 'crossover', 'ropepushdown', 'ohext'] },
      { id: 'backbi', name: '등·이두', focus: '등 · 이두', desc: '수직 · 수평 당기기 후 이두.', exIds: ['latpull', 'bbrow', 'cablerow', 'bbcurl', 'hammercurl'] },
      { id: 'legsh', name: '하체·어깨', focus: '하체 · 어깨', desc: '하체를 먼저 하고 어깨로 마무리합니다.', exIds: ['backsquat', 'legpress', 'legcurl', 'ohp', 'latraise'] },
    ],
  },
  {
    id: 'split4',
    name: '4분할',
    short: '4분할',
    subtitle: '주 4일 · 가슴 / 등 / 하체 / 어깨·팔',
    desc: '하루 한두 부위에 볼륨을 몰아 주는 4분할. 부위당 주 1회, 회복 시간이 깁니다.',
    daysPerWeek: 4,
    level: 2,
    place: ['gym'],
    tags: ['4분할', '헬스장', '부위별'],
    days: [
      { id: 'chest', name: '가슴', focus: '가슴', desc: '프레스 두 가지와 플라이 · 딥스.', exIds: ['bench', 'incdbpress', 'dbfly', 'dipschest'] },
      { id: 'back', name: '등', focus: '등', desc: '수직 당기기 둘, 수평 당기기 둘.', exIds: ['pullup', 'bbrow', 'latpull', 'cablerow'] },
      { id: 'legs', name: '하체', focus: '하체', desc: '스쿼트 · 힌지 · 런지 · 종아리.', exIds: ['backsquat', 'rdlleg', 'legpress', 'lunge', 'calfraise'] },
      { id: 'armsh', name: '어깨·팔', focus: '어깨 · 이두 · 삼두', desc: '어깨 프레스 · 레이즈 후 이두 · 삼두.', exIds: ['ohp', 'latraise', 'reardeltfly', 'bbcurl', 'ropepushdown'] },
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
    tags: ['코어', '10분', '서킷', '복근'],
    kind: 'focus',
    group: '코어',
    attach: ['코어', '하체'],
    days: [
      { id: 'coreA', name: '코어 A', focus: '상복부 · 하복부', desc: '위아래 복직근을 번갈아 자극합니다.', exIds: ['crunch', 'legraise', 'plank', 'bicyclecrunch', 'deadbug'] },
      { id: 'coreB', name: '코어 B', focus: '복사근 · 안정화', desc: '회전과 버티기 위주의 세션.', exIds: ['sideplank', 'russiantwist', 'hollowhold', 'pallofpress', 'flutterkick'] },
    ],
  },
  {
    id: 'f-lat-width', kind: 'focus', group: '등', attach: ['등'],
    name: '넓은 등 · 광배', short: '광배', subtitle: '4동작 · 약 20분 · 주 1~2회',
    desc: '위에서 아래로 당기는 수직 당기기 위주. 팔꿈치를 옆구리 쪽으로 끌어내리며 광배 너비에 집중합니다.',
    daysPerWeek: 1, level: 2, place: ['gym'], tags: ['등', '광배', '너비', '역삼각형', '랫풀다운', '풀업'],
    days: [{ id: 'main', name: '넓은 등 · 광배', focus: '넓은 등 · 광배', desc: '위에서 아래로 당기는 수직 당기기 위주. 팔꿈치를 옆구리 쪽으로 끌어내리며 광배 너비에 집중합니다.', exIds: ['widelatpull', 'pullup', 'straightarmpull', 'cablepullover'] }],
  },
  {
    id: 'f-back-thick', kind: 'focus', group: '등', attach: ['등'],
    name: '등 두께', short: '두께', subtitle: '4동작 · 약 20분 · 주 1~2회',
    desc: '몸 쪽으로 당기는 수평 당기기 위주. 날개뼈를 모으며 등 가운데 두께에 집중합니다.',
    daysPerWeek: 1, level: 2, place: ['gym'], tags: ['등', '두께', '로우', '중부'],
    days: [{ id: 'main', name: '등 두께', focus: '등 두께', desc: '몸 쪽으로 당기는 수평 당기기 위주. 날개뼈를 모으며 등 가운데 두께에 집중합니다.', exIds: ['bbrow', 'chestsupportedrow', 'tbarrow', 'cablerow'] }],
  },
  {
    id: 'f-traps', kind: 'focus', group: '등', attach: ['등'],
    name: '승모 · 윗등', short: '승모', subtitle: '4동작 · 약 20분 · 주 1~2회',
    desc: '위 · 가운데 승모를 나눠서. 으쓱하는 동작과 뒤로 당기는 동작을 같이 넣었습니다.',
    daysPerWeek: 1, level: 1, place: ['gym'], tags: ['등', '승모', '윗등', '슈러그', '목'],
    days: [{ id: 'main', name: '승모 · 윗등', focus: '승모 · 윗등', desc: '위 · 가운데 승모를 나눠서. 으쓱하는 동작과 뒤로 당기는 동작을 같이 넣었습니다.', exIds: ['bbshrug', 'seatedshrug', 'facepull', 'reversefly'] }],
  },
  {
    id: 'f-db-back', kind: 'focus', group: '등', attach: ['등'],
    name: '덤벨로 등', short: '덤벨등', subtitle: '4동작 · 약 20분 · 주 1~2회',
    desc: '덤벨 한 쌍으로 광배 · 승모 · 뒤어깨까지. 머신이 없는 날이나 집에서도 됩니다.',
    daysPerWeek: 1, level: 1, place: ['gym', 'home'], tags: ['등', '덤벨', '홈트', '승모'],
    days: [{ id: 'main', name: '덤벨로 등', focus: '덤벨로 등', desc: '덤벨 한 쌍으로 광배 · 승모 · 뒤어깨까지. 머신이 없는 날이나 집에서도 됩니다.', exIds: ['onearmdbrow', 'dbrow', 'shrug', 'reversefly'] }],
  },
  {
    id: 'f-upper-chest', kind: 'focus', group: '가슴', attach: ['가슴'],
    name: '윗가슴', short: '윗가슴', subtitle: '4동작 · 약 20분 · 주 1~2회',
    desc: '벤치를 15~30도로 세운 프레스와 아래에서 위로 모으는 플라이. 가슴 위쪽에 집중합니다.',
    daysPerWeek: 1, level: 2, place: ['gym'], tags: ['가슴', '윗가슴', '인클라인', '쇄골'],
    days: [{ id: 'main', name: '윗가슴', focus: '윗가슴', desc: '벤치를 15~30도로 세운 프레스와 아래에서 위로 모으는 플라이. 가슴 위쪽에 집중합니다.', exIds: ['inclinebench', 'incdbpress', 'lowcablefly', 'incdbfly'] }],
  },
  {
    id: 'f-lower-chest', kind: 'focus', group: '가슴', attach: ['가슴'],
    name: '아랫가슴', short: '아랫가슴', subtitle: '3동작 · 약 15분 · 주 1~2회',
    desc: '디클라인 프레스 · 딥스 · 위에서 아래로 모으는 플라이로 가슴 아래쪽에 집중합니다.',
    daysPerWeek: 1, level: 2, place: ['gym'], tags: ['가슴', '아랫가슴', '디클라인', '딥스'],
    days: [{ id: 'main', name: '아랫가슴', focus: '아랫가슴', desc: '디클라인 프레스 · 딥스 · 위에서 아래로 모으는 플라이로 가슴 아래쪽에 집중합니다.', exIds: ['declinebench', 'dipschest', 'highcablefly'] }],
  },
  {
    id: 'f-chest-full', kind: 'focus', group: '가슴', attach: ['가슴'],
    name: '가슴 고르게', short: '가슴', subtitle: '4동작 · 약 20분 · 주 1~2회',
    desc: '무겁게 미는 프레스와 깊게 늘리는 플라이. 위 · 가운데를 한 번에 씁니다.',
    daysPerWeek: 1, level: 2, place: ['gym'], tags: ['가슴', '벤치', '플라이'],
    days: [{ id: 'main', name: '가슴 고르게', focus: '가슴 고르게', desc: '무겁게 미는 프레스와 깊게 늘리는 플라이. 위 · 가운데를 한 번에 씁니다.', exIds: ['bench', 'incdbpress', 'dbfly', 'crossover'] }],
  },
  {
    id: 'f-3d-shoulder', kind: 'focus', group: '어깨', attach: ['어깨'],
    name: '어깨 앞 · 옆 · 뒤', short: '3D', subtitle: '4동작 · 약 20분 · 주 1~2회',
    desc: '프레스로 앞어깨, 레이즈로 옆어깨, 플라이로 뒤어깨. 세 방향을 한 번에 씁니다.',
    daysPerWeek: 1, level: 1, place: ['gym'], tags: ['어깨', '3D', '삼각근', '숄더'],
    days: [{ id: 'main', name: '어깨 앞 · 옆 · 뒤', focus: '어깨 앞 · 옆 · 뒤', desc: '프레스로 앞어깨, 레이즈로 옆어깨, 플라이로 뒤어깨. 세 방향을 한 번에 씁니다.', exIds: ['dbshoulderpress', 'latraise', 'reardeltfly', 'frontraise'] }],
  },
  {
    id: 'f-side-delt', kind: 'focus', group: '어깨', attach: ['어깨'],
    name: '옆어깨', short: '옆어깨', subtitle: '3동작 · 약 15분 · 주 1~2회',
    desc: '옆어깨만 세 가지 각도로. 승모가 먼저 올라오지 않게 어깨를 내리고 팔꿈치로 이끕니다.',
    daysPerWeek: 1, level: 1, place: ['gym'], tags: ['어깨', '측면', '레터럴', '어깨 넓이'],
    days: [{ id: 'main', name: '옆어깨', focus: '옆어깨', desc: '옆어깨만 세 가지 각도로. 승모가 먼저 올라오지 않게 어깨를 내리고 팔꿈치로 이끕니다.', exIds: ['latraise', 'cablelatraise', 'leaninglatraise'] }],
  },
  {
    id: 'f-rear-delt', kind: 'focus', group: '어깨', attach: ['어깨', '등'],
    name: '뒤어깨', short: '뒤어깨', subtitle: '4동작 · 약 20분 · 주 1~2회',
    desc: '잘 안 하게 되는 뒤어깨. 가볍게, 끝에서 한 박자 멈추는 플라이 · 페이스풀 위주입니다.',
    daysPerWeek: 1, level: 1, place: ['gym'], tags: ['어깨', '후면', '리어델트', '자세'],
    days: [{ id: 'main', name: '뒤어깨', focus: '뒤어깨', desc: '잘 안 하게 되는 뒤어깨. 가볍게, 끝에서 한 박자 멈추는 플라이 · 페이스풀 위주입니다.', exIds: ['reversefly', 'cablereardelt', 'facepullsh', 'inclinereardelt'] }],
  },
  {
    id: 'f-cable-shoulder', kind: 'focus', group: '어깨', attach: ['어깨'],
    name: '케이블로 어깨', short: '케이블', subtitle: '3동작 · 약 15분 · 주 1~2회',
    desc: '케이블 하나로 앞 · 옆 · 뒤 어깨. 동작 내내 장력이 걸립니다.',
    daysPerWeek: 1, level: 1, place: ['gym'], tags: ['어깨', '케이블'],
    days: [{ id: 'main', name: '케이블로 어깨', focus: '케이블로 어깨', desc: '케이블 하나로 앞 · 옆 · 뒤 어깨. 동작 내내 장력이 걸립니다.', exIds: ['cablefrontraise', 'cablelatraise', 'cablereardelt'] }],
  },
  {
    id: 'f-triceps', kind: 'focus', group: '팔', attach: ['삼두'],
    name: '삼두 세 갈래', short: '삼두', subtitle: '3동작 · 약 15분 · 주 1~2회',
    desc: '머리 위로 늘리는 동작 · 밀어 내리는 동작 · 누워서 펴는 동작. 삼두 세 갈래를 고루 씁니다.',
    daysPerWeek: 1, level: 1, place: ['gym'], tags: ['팔', '삼두', '푸시다운', '익스텐션'],
    days: [{ id: 'main', name: '삼두 세 갈래', focus: '삼두 세 갈래', desc: '머리 위로 늘리는 동작 · 밀어 내리는 동작 · 누워서 펴는 동작. 삼두 세 갈래를 고루 씁니다.', exIds: ['ohropeext', 'ropepushdown', 'skullcrusher'] }],
  },
  {
    id: 'f-biceps', kind: 'focus', group: '팔', attach: ['이두'],
    name: '이두 각도별', short: '이두', subtitle: '3동작 · 약 15분 · 주 1~2회',
    desc: '팔을 뒤에 두는 컬 · 앞에 고정하는 컬 · 해머 그립. 팔 위치를 바꿔 이두를 여러 각도로 씁니다.',
    daysPerWeek: 1, level: 1, place: ['gym'], tags: ['팔', '이두', '컬'],
    days: [{ id: 'main', name: '이두 각도별', focus: '이두 각도별', desc: '팔을 뒤에 두는 컬 · 앞에 고정하는 컬 · 해머 그립. 팔 위치를 바꿔 이두를 여러 각도로 씁니다.', exIds: ['incdbcurl', 'preachercurl', 'hammercurl'] }],
  },
  {
    id: 'f-arms-front', kind: 'focus', group: '팔', attach: ['이두'],
    name: '앞에서 보는 팔', short: '팔앞', subtitle: '3동작 · 약 15분 · 주 1~2회',
    desc: '이두 · 상완근 · 전완을 함께. 바벨컬 · 해머컬 · 리버스컬 세 가지 그립입니다.',
    daysPerWeek: 1, level: 1, place: ['gym'], tags: ['팔', '이두', '상완근', '전완', '굵은 팔'],
    days: [{ id: 'main', name: '앞에서 보는 팔', focus: '앞에서 보는 팔', desc: '이두 · 상완근 · 전완을 함께. 바벨컬 · 해머컬 · 리버스컬 세 가지 그립입니다.', exIds: ['bbcurl', 'hammercurl', 'reversecurl'] }],
  },
  {
    id: 'f-forearm', kind: 'focus', group: '팔', attach: ['이두', '등'],
    name: '전완근 · 악력', short: '전완', subtitle: '3동작 · 약 15분 · 주 1~2회',
    desc: '엄지가 위 · 아래를 향하는 그립으로 전완 바깥쪽과 손목을 씁니다.',
    daysPerWeek: 1, level: 1, place: ['gym'], tags: ['팔', '전완', '악력', '손목'],
    days: [{ id: 'main', name: '전완근 · 악력', focus: '전완근 · 악력', desc: '엄지가 위 · 아래를 향하는 그립으로 전완 바깥쪽과 손목을 씁니다.', exIds: ['reversecurl', 'hammercurl', 'cablehammer'] }],
  },
  {
    id: 'f-arms-all', kind: 'focus', group: '팔', attach: ['이두', '삼두'],
    name: '팔 전체', short: '팔', subtitle: '4동작 · 약 20분 · 주 1~2회',
    desc: '이두 둘 · 삼두 둘을 번갈아. 한쪽이 쉬는 동안 반대쪽을 합니다.',
    daysPerWeek: 1, level: 1, place: ['gym'], tags: ['팔', '이두', '삼두', '팔뚝'],
    days: [{ id: 'main', name: '팔 전체', focus: '팔 전체', desc: '이두 둘 · 삼두 둘을 번갈아. 한쪽이 쉬는 동안 반대쪽을 합니다.', exIds: ['bbcurl', 'closegripbench', 'hammercurl', 'ohext'] }],
  },
  {
    id: 'f-legs-full', kind: 'focus', group: '하체', attach: ['하체'],
    name: '하체 전체', short: '하체', subtitle: '5동작 · 약 25분 · 주 1~2회',
    desc: '앞벅지 · 뒷벅지 · 엉덩이 · 종아리를 한 번에. 따로 하루를 잡아도 되는 분량입니다.',
    daysPerWeek: 1, level: 2, place: ['gym'], tags: ['하체', '다리', '허벅지', '스쿼트'],
    days: [{ id: 'main', name: '하체 전체', focus: '하체 전체', desc: '앞벅지 · 뒷벅지 · 엉덩이 · 종아리를 한 번에. 따로 하루를 잡아도 되는 분량입니다.', exIds: ['backsquat', 'rdlleg', 'bulgarian', 'legcurl', 'calfraise'] }],
  },
  {
    id: 'f-glutes', kind: 'focus', group: '하체', attach: ['하체'],
    name: '엉덩이', short: '둔근', subtitle: '4동작 · 약 20분 · 주 1~2회',
    desc: '힙쓰러스트로 무겁게, 불가리안 · 킥백 · 어브덕션으로 엉덩이 위 · 옆까지.',
    daysPerWeek: 1, level: 1, place: ['gym'], tags: ['하체', '엉덩이', '둔근', '힙'],
    days: [{ id: 'main', name: '엉덩이', focus: '엉덩이', desc: '힙쓰러스트로 무겁게, 불가리안 · 킥백 · 어브덕션으로 엉덩이 위 · 옆까지.', exIds: ['hipthrust', 'bulgarian', 'glutekickback', 'hipabduction'] }],
  },
  {
    id: 'f-quads', kind: 'focus', group: '하체', attach: ['하체'],
    name: '앞벅지', short: '앞벅지', subtitle: '3동작 · 약 15분 · 주 1~2회',
    desc: '무릎이 앞으로 나가는 스쿼트 계열과 레그익스텐션으로 앞벅지에 집중합니다.',
    daysPerWeek: 1, level: 2, place: ['gym'], tags: ['하체', '앞벅지', '대퇴사두'],
    days: [{ id: 'main', name: '앞벅지', focus: '앞벅지', desc: '무릎이 앞으로 나가는 스쿼트 계열과 레그익스텐션으로 앞벅지에 집중합니다.', exIds: ['frontsquat', 'hacksquat', 'legext'] }],
  },
  {
    id: 'f-calves', kind: 'focus', group: '하체', attach: ['하체'],
    name: '종아리', short: '종아리', subtitle: '2동작 · 약 10분 · 주 1~2회',
    desc: '선 자세(비복근)와 앉은 자세(가자미근)를 둘 다. 바닥에서 튕기지 말고 끝까지 늘립니다.',
    daysPerWeek: 1, level: 1, place: ['gym'], tags: ['하체', '종아리', '카프'],
    days: [{ id: 'main', name: '종아리', focus: '종아리', desc: '선 자세(비복근)와 앉은 자세(가자미근)를 둘 다. 바닥에서 튕기지 말고 끝까지 늘립니다.', exIds: ['calfraise', 'seatedcalf'] }],
  },
  {
    id: 'f-adductor', kind: 'focus', group: '하체', attach: ['하체'],
    name: '안쪽 허벅지 · 고관절', short: '내전근', subtitle: '3동작 · 약 15분 · 주 1~2회',
    desc: '옆으로 넓게 서는 동작 위주. 안쪽 허벅지와 고관절을 씁니다.',
    daysPerWeek: 1, level: 1, place: ['gym'], tags: ['하체', '내전근', '안쪽 허벅지', '고관절'],
    days: [{ id: 'main', name: '안쪽 허벅지 · 고관절', focus: '안쪽 허벅지 · 고관절', desc: '옆으로 넓게 서는 동작 위주. 안쪽 허벅지와 고관절을 씁니다.', exIds: ['sidelunge', 'sumosquat', 'goblet'] }],
  },
  {
    id: 'f-lower-abs', kind: 'focus', group: '코어', attach: ['코어'],
    name: '아랫배', short: '아랫배', subtitle: '4동작 · 약 20분 · 주 1~2회',
    desc: '골반을 말아 올리는 동작 위주. 반동 없이 허리를 바닥에 붙인 채로 합니다.',
    daysPerWeek: 1, level: 1, place: ['gym'], tags: ['코어', '아랫배', '하복부', '복근'],
    days: [{ id: 'main', name: '아랫배', focus: '아랫배', desc: '골반을 말아 올리는 동작 위주. 반동 없이 허리를 바닥에 붙인 채로 합니다.', exIds: ['revcrunch', 'legraise', 'hanginglegraise', 'deadbug'] }],
  },
  {
    id: 'f-obliques', kind: 'focus', group: '코어', attach: ['코어'],
    name: '옆구리', short: '옆구리', subtitle: '4동작 · 약 20분 · 주 1~2회',
    desc: '버티기 · 비틀기 · 대각선으로 당기기. 옆구리(복사근)를 세 방향으로 씁니다.',
    daysPerWeek: 1, level: 1, place: ['gym'], tags: ['코어', '옆구리', '복사근'],
    days: [{ id: 'main', name: '옆구리', focus: '옆구리', desc: '버티기 · 비틀기 · 대각선으로 당기기. 옆구리(복사근)를 세 방향으로 씁니다.', exIds: ['sideplank', 'russiantwist', 'cablewoodchop', 'bicyclecrunch'] }],
  },
  {
    id: 'f-abs-full', kind: 'focus', group: '코어', attach: ['코어'],
    name: '복근 전체', short: '복근', subtitle: '4동작 · 약 20분 · 주 1~2회',
    desc: '윗배 · 아랫배 · 옆구리 · 버티기를 한 번씩. 운동 끝에 붙이기 좋은 분량입니다.',
    daysPerWeek: 1, level: 1, place: ['gym'], tags: ['코어', '복근', '식스팩', '뱃살'],
    days: [{ id: 'main', name: '복근 전체', focus: '복근 전체', desc: '윗배 · 아랫배 · 옆구리 · 버티기를 한 번씩. 운동 끝에 붙이기 좋은 분량입니다.', exIds: ['crunch', 'legraise', 'bicyclecrunch', 'plank'] }],
  },
  {
    id: 'f-home-back', kind: 'focus', group: '홈트', attach: ['등'],
    name: '집에서 등', short: '홈등', subtitle: '3동작 · 약 15분 · 주 1~2회',
    desc: '책상 · 밴드 · 덤벨로 하는 등 운동. 철봉이 없어도 됩니다.',
    daysPerWeek: 1, level: 1, place: ['home'], tags: ['홈트', '등', '맨몸', '밴드'],
    days: [{ id: 'main', name: '집에서 등', focus: '집에서 등', desc: '책상 · 밴드 · 덤벨로 하는 등 운동. 철봉이 없어도 됩니다.', exIds: ['invertedrow', 'bandedpulldown', 'reversefly'] }],
  },
  {
    id: 'f-home-shoulder', kind: 'focus', group: '홈트', attach: ['어깨'],
    name: '집에서 어깨', short: '홈어깨', subtitle: '3동작 · 약 15분 · 주 1~2회',
    desc: '파이크 푸시업으로 각도를 세우고 덤벨로 마무리합니다.',
    daysPerWeek: 1, level: 1, place: ['home'], tags: ['홈트', '어깨', '맨몸', '덤벨'],
    days: [{ id: 'main', name: '집에서 어깨', focus: '집에서 어깨', desc: '파이크 푸시업으로 각도를 세우고 덤벨로 마무리합니다.', exIds: ['pikepushupsh', 'dbshoulderpress', 'latraise'] }],
  },
  {
    id: 'f-home-tri', kind: 'focus', group: '홈트', attach: ['삼두'],
    name: '집에서 삼두', short: '홈삼두', subtitle: '3동작 · 약 15분 · 주 1~2회',
    desc: '의자 딥스 · 다이아몬드 푸시업 · 덤벨 킥백. 팔꿈치를 뒤로 고정합니다.',
    daysPerWeek: 1, level: 1, place: ['home'], tags: ['홈트', '삼두', '맨몸', '의자'],
    days: [{ id: 'main', name: '집에서 삼두', focus: '집에서 삼두', desc: '의자 딥스 · 다이아몬드 푸시업 · 덤벨 킥백. 팔꿈치를 뒤로 고정합니다.', exIds: ['benchdip', 'diamondpushuptri', 'kickback'] }],
  },
  {
    id: 'f-pushup-steps', kind: 'focus', group: '홈트', attach: ['가슴'],
    name: '푸시업 단계별', short: '푸시업', subtitle: '3동작 · 약 15분 · 주 1~2회',
    desc: '쉬운 각도부터 어려운 각도까지. 몸을 일자로 유지할 수 있는 단계에서 시작합니다.',
    daysPerWeek: 1, level: 1, place: ['home', 'gym'], tags: ['홈트', '푸시업', '맨몸', '가슴'],
    days: [{ id: 'main', name: '푸시업 단계별', focus: '푸시업 단계별', desc: '쉬운 각도부터 어려운 각도까지. 몸을 일자로 유지할 수 있는 단계에서 시작합니다.', exIds: ['inclinepushup', 'pushup', 'declinepushup'] }],
  },
  {
    id: 'f-chair', kind: 'focus', group: '홈트', attach: ['전신'],
    name: '의자 하나로', short: '의자', subtitle: '4동작 · 약 20분 · 주 1~2회',
    desc: '의자 하나로 하체 · 삼두 · 가슴. 흔들리지 않는 의자를 벽에 붙여 씁니다.',
    daysPerWeek: 1, level: 1, place: ['home'], tags: ['홈트', '의자', '맨몸', '전신'],
    days: [{ id: 'main', name: '의자 하나로', focus: '의자 하나로', desc: '의자 하나로 하체 · 삼두 · 가슴. 흔들리지 않는 의자를 벽에 붙여 씁니다.', exIds: ['stepup', 'benchdip', 'inclinepushup', 'bulgarian'] }],
  },
  {
    id: 'f-short', kind: 'focus', group: '조건', attach: ['전신'],
    name: '짧게 20분', short: '20분', subtitle: '4동작 · 약 20분 · 주 1~2회',
    desc: '시간 없는 날 전신 네 동작. 큰 동작부터 순서대로, 세트 사이 휴식은 짧게.',
    daysPerWeek: 1, level: 1, place: ['gym', 'home'], tags: ['짧게', '20분', '전신', '바쁜 날'],
    days: [{ id: 'main', name: '짧게 20분', focus: '짧게 20분', desc: '시간 없는 날 전신 네 동작. 큰 동작부터 순서대로, 세트 사이 휴식은 짧게.', exIds: ['goblet', 'pushup', 'dbrow', 'plank'] }],
  },
  {
    id: 'f-balance', kind: 'focus', group: '조건', attach: ['전신'],
    name: '좌우 균형 · 한쪽씩', short: '한쪽씩', subtitle: '4동작 · 약 20분 · 주 1~2회',
    desc: '한쪽씩 하는 동작만. 약한 쪽부터 하고, 강한 쪽은 약한 쪽 횟수에 맞춥니다.',
    daysPerWeek: 1, level: 2, place: ['gym', 'home'], tags: ['좌우', '불균형', '한쪽', '균형'],
    days: [{ id: 'main', name: '좌우 균형 · 한쪽씩', focus: '좌우 균형 · 한쪽씩', desc: '한쪽씩 하는 동작만. 약한 쪽부터 하고, 강한 쪽은 약한 쪽 횟수에 맞춥니다.', exIds: ['onearmdbrow', 'bulgarian', 'onearmlatraise', 'sldl'] }],
  },
];

const ROUTINE_MAP = new Map(ROUTINES.map((r) => [r.id, r]));

/** 분할 루틴(플랜 전체) · 부위 집중 루틴(붙이기 · 한 번 하기) */
export const SPLIT_ROUTINES = ROUTINES.filter((r) => r.kind !== 'focus');
export const FOCUS_ROUTINES = ROUTINES.filter((r) => r.kind === 'focus');
export const isFocus = (r: Routine): boolean => r.kind === 'focus';

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
