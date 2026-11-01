/**
 * 라이브러리 — 부위별 가이드 시리즈
 * 카드 탭 시 /library/[feedId] 상세로 이동하며, 연결된 종목은 종목 상세로 연결된다.
 * 표지는 실제 사람 사진을 쓰지 않는다 — 연결된 종목의 회색 아바타 썸네일(10/31 피드백 7-3).
 */
import mediaSnapshot from './mediaManifest.json';
import { EX_IMAGE } from './media';

const POSTERS = (mediaSnapshot as { items?: Record<string, { poster?: string }> }).items ?? {};

/** 표지로 쓸 종목 — 썸네일이 있는 첫 종목 */
export function coverExId(item: Pick<FeedItem, 'exIds'>): string {
  return item.exIds.find((id) => !!EX_IMAGE[id] || !!POSTERS[id]?.poster) ?? item.exIds[0];
}
export interface FeedSection {
  h: string;
  body: string;
}

export interface FeedItem {
  id: string;
  n: string;
  part: string;
  cnt: string;
  summary: string;
  sections: FeedSection[];
  exIds: string[];
}

export const FEED: FeedItem[] = [
  {
    id: 'back-grip',
    n: '등 그립별 타겟 부위',
    part: '등',
    cnt: '1편',
    summary: '같은 랫풀다운도 그립에 따라 자극 부위가 달라집니다.',
    sections: [
      { h: '와이드 오버그립', body: '광배 상부와 등 너비에 관여합니다. 팔꿈치를 아래로 내리는 느낌으로 당기세요.' },
      { h: '클로즈 / 뉴트럴', body: '광배 하부와 등 두께에 유리합니다. 가동범위가 커서 수축 구간이 깁니다.' },
      { h: '리버스(언더) 그립', body: '광배 하부와 이두 개입이 커집니다. 손목이 불편하면 EZ바를 사용하세요.' },
    ],
    exIds: ['widelatpull', 'closelatpull', 'revlatpull', 'latpull'],
  },
  {
    id: 'bench-angle',
    n: '벤치프레스 각도별 타겟',
    part: '가슴',
    cnt: '1편',
    summary: '벤치 각도 15도 차이가 상부·중부 자극을 바꿉니다.',
    sections: [
      { h: '플랫 (0도)', body: '가슴 중부에 가장 고르게 실립니다. 중량을 올리기 가장 좋은 각도.' },
      { h: '인클라인 (15~30도)', body: '가슴 상부(쇄골부) 비중이 커집니다. 45도를 넘기면 어깨가 일을 대신합니다.' },
      { h: '디클라인 (-15도)', body: '가슴 하부 라인을 잡습니다. 어깨 부담이 가장 적은 각도.' },
    ],
    exIds: ['bench', 'inclinebench', 'declinebench', 'incdbpress'],
  },
  {
    id: 'squat-variation',
    n: '바벨 스쿼트 5가지 변형',
    part: '하체',
    cnt: '5동작',
    summary: '바 위치와 발 간격만 바꿔도 타겟이 이동합니다.',
    sections: [
      { h: '하이바 / 로우바', body: '하이바는 대퇴사두, 로우바는 둔근·햄스트링 비중이 큽니다.' },
      { h: '프론트 스쿼트', body: '상체를 세워 대퇴사두에 집중. 코어 요구가 가장 높습니다.' },
      { h: '박스 · 스모 · 점프', body: '깊이 고정, 내전근 강조, 파워 발달 목적으로 각각 사용합니다.' },
    ],
    exIds: ['backsquat', 'frontsquat', 'boxsquat', 'sumosquat', 'jumpsquat'],
  },
  {
    id: 'home-chest',
    n: '홈트 가슴운동 · 덤벨',
    part: '가슴',
    cnt: '부위별',
    summary: '덤벨 한 쌍이면 가슴 전 영역을 덮을 수 있습니다.',
    sections: [
      { h: '프레스로 볼륨', body: '덤벨 벤치프레스와 인클라인 프레스로 중부·상부를 나눠 자극합니다.' },
      { h: '플라이로 마무리', body: '플라이는 늘어나는 구간이 핵심. 무겁게 들지 말고 가동범위를 우선하세요.' },
      { h: '벤치가 없다면', body: '바닥에서 하는 플로어 프레스로 대체 가능합니다. 가동범위는 줄지만 어깨는 더 안전합니다.' },
    ],
    exIds: ['dbbench', 'incdbpress', 'dbfly', 'floorpress', 'squeezepress'],
  },
  {
    id: 'biceps-3',
    n: '납작한 이두 살리는 3동작',
    part: '이두',
    cnt: '3동작',
    summary: '장두·단두·상완근을 나눠 공략하면 팔 두께가 달라집니다.',
    sections: [
      { h: '장두 — 인클라인 덤벨컬', body: '팔을 몸 뒤로 두어 장두를 늘린 상태에서 수축합니다. 이두 봉우리에 관여.' },
      { h: '단두 — 프리처 / 스파이더컬', body: '팔을 몸 앞에 고정해 반동을 없앱니다. 이두 폭을 만듭니다.' },
      { h: '상완근 — 해머컬', body: '이두 아래 근육을 키워 팔 전체를 두껍게 보이게 합니다.' },
    ],
    exIds: ['incdbcurl', 'preachercurl', 'hammercurl'],
  },
  {
    id: 'shoulder-routine',
    n: '어깨 루틴',
    part: '어깨',
    cnt: '6동작',
    summary: '프레스 1개 + 세 방향 레이즈가 기본 공식입니다.',
    sections: [
      { h: '프레스로 시작', body: '가장 무겁게 다룰 수 있는 종목을 맨 앞에. 오버헤드 프레스 또는 덤벨 숄더프레스.' },
      { h: '측면 → 후면 순서', body: '측면삼각은 어깨 너비, 후면삼각은 자세 개선에 직결됩니다. 후면은 보통 부족합니다.' },
      { h: '마무리 고반복', body: '레이즈류는 12~20회 범위가 효율적입니다. 반동이 생기면 무게를 낮추세요.' },
    ],
    exIds: ['ohp', 'dbshoulderpress', 'latraise', 'bentoverraise', 'facepullsh', 'shrug'],
  },
  {
    id: 'lat-width',
    n: '광배가 커지는 동작',
    part: '등',
    cnt: '5동작',
    summary: '등 너비는 수직 당기기에서 만들어집니다.',
    sections: [
      { h: '수직 당기기 우선', body: '풀업·랫풀다운처럼 위에서 아래로 당기는 동작이 광배 너비에 직결됩니다.' },
      { h: '견갑 하강이 먼저', body: '팔로 당기기 전에 어깨를 아래로 내리는 동작이 선행되어야 등에 실립니다.' },
      { h: '고립 한 종목', body: '스트레이트암 풀다운으로 이두 개입 없이 광배만 태웁니다.' },
    ],
    exIds: ['pullup', 'latpull', 'widelatpull', 'straightarmpull', 'cablepullover'],
  },
  {
    id: 'back-thickness',
    n: '등 두께 만드는 동작',
    part: '등',
    cnt: '6동작',
    summary: '두께는 수평 당기기(로우)에서 나옵니다.',
    sections: [
      { h: '로우 계열이 핵심', body: '바벨로우·케이블로우처럼 몸쪽으로 당기는 동작이 등 중부 밀도를 만듭니다.' },
      { h: '팔꿈치 경로', body: '팔꿈치를 몸통 뒤로 멀리 보낼수록 견갑 사이 근육이 개입합니다.' },
      { h: '후면삼각도 함께', body: '페이스풀·리버스 플라이를 넣으면 전체 실루엣이 정리됩니다.' },
    ],
    exIds: ['bbrow', 'pendlay', 'cablerow', 'tbarrow', 'chestsupportedrow', 'facepull'],
  },
  {
    id: 'squat-intro',
    n: '스쿼트 동작 소개',
    part: '하체',
    cnt: '3동작',
    summary: '맨몸 → 고블릿 → 바벨 순서로 올라가세요.',
    sections: [
      { h: '1단계 맨몸 스쿼트', body: '발목·고관절 가동범위부터 확보합니다. 뒤꿈치가 뜨면 아직 바벨 단계가 아닙니다.' },
      { h: '2단계 고블릿 스쿼트', body: '앞쪽에 무게를 들면 상체가 자연스럽게 세워져 자세가 교정됩니다.' },
      { h: '3단계 바벨 스쿼트', body: '빈 바부터 시작해 자세가 유지되는 범위에서만 중량을 올립니다.' },
    ],
    exIds: ['bwsquat', 'goblet', 'backsquat'],
  },
  {
    id: 'push-routine',
    n: '푸시데이 루틴',
    part: '가슴·어깨·삼두',
    cnt: '10동작',
    summary: '큰 근육 → 작은 근육 순서가 원칙입니다.',
    sections: [
      { h: '컴파운드 먼저', body: '벤치프레스·오버헤드 프레스처럼 여러 관절을 쓰는 종목을 앞에 둡니다.' },
      { h: '고립으로 채우기', body: '플라이·레이즈·푸시다운으로 남은 볼륨을 채웁니다.' },
      { h: '삼두는 마지막', body: '삼두가 먼저 지치면 프레스 중량이 떨어집니다.' },
    ],
    exIds: ['bench', 'incdbpress', 'dbshoulderpress', 'dbfly', 'latraise', 'pushdown', 'ohext', 'crossover', 'benchdip', 'pecdeck'],
  },
  {
    id: 'pull-routine',
    n: '풀데이 루틴',
    part: '등·이두',
    cnt: '10동작',
    summary: '수직·수평 당기기를 반드시 섞으세요.',
    sections: [
      { h: '수직 + 수평', body: '너비(수직)와 두께(수평)는 다른 동작에서 만들어집니다. 한 쪽만 하면 편중됩니다.' },
      { h: '이두는 후반부', body: '이두가 먼저 지치면 등 종목에서 그립이 먼저 풀립니다.' },
      { h: '스트랩 활용', body: '악력 때문에 등을 못 태운다면 스트랩을 사용하는 편이 낫습니다.' },
    ],
    exIds: ['pullup', 'bbrow', 'latpull', 'cablerow', 'onearmdbrow', 'facepull', 'bbcurl', 'hammercurl', 'incdbcurl', 'shrug'],
  },
  {
    id: 'dips-target',
    n: '딥스 — 삼두 vs 가슴 타겟',
    part: '가슴·삼두',
    cnt: '비교',
    summary: '상체 각도 하나로 타겟이 바뀝니다.',
    sections: [
      { h: '가슴 타겟', body: '상체를 앞으로 기울이고 팔꿈치를 약간 벌립니다. 가동범위를 깊게.' },
      { h: '삼두 타겟', body: '상체를 수직으로 세우고 팔꿈치를 몸통에 붙입니다.' },
      { h: '어깨 통증이 있다면', body: '내려가는 깊이를 줄이거나 벤치딥스로 대체하세요.' },
    ],
    exIds: ['dipschest', 'dipstri', 'benchdip'],
  },
];

const FEED_MAP = new Map(FEED.map((f) => [f.id, f]));
export const feedById = (id: string): FeedItem | undefined => FEED_MAP.get(id);
