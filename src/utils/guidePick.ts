/**
 * 오늘의 가이드 고르기 — 하루 한 편, 날마다 바뀐다(2026-11-28 대표 지시: 최신 VO 운동 꿀팁 릴스를 하나씩).
 *  · 오늘 운동(plan day 의 이름 + focus)에서 부위를 읽는다. focus 는 "벤치 · 인클라인 · 플라이" 같은 종목 이름일 때가 많아서
 *    종목 · 요일 이름 낱말을 부위로 옮기는 표(PART_WORDS)를 쓴다.
 *  · 맞는 편이 2편 이상이면 그중에서 돌린다. 1편뿐이면 이틀에 한 번만 그 편, 나머지 날은 전체에서(매번 같은 영상 방지).
 *  · 같은 날에는 언제 열어도 같은 편이다(날짜로 정한다).
 */
export interface Pickable {
  id: string;
  tags: readonly string[];
}

/** 낱말(일부만 들어 있어도) → 부위. 위에서부터 본다 */
const PART_WORDS: readonly [RegExp, readonly string[]][] = [
  [/레그|하체|스쿼트|레그프레스|런지|힌지|데드|대퇴|둔근|햄스트링|종아리|카프/, ['하체']],
  [/풀\s?데이|(^|\s)풀(\s|$)|등|로우|랫풀|풀업|턱걸이|광배/, ['등', '이두']],
  [/푸시|가슴|벤치|인클라인|플라이|딥스|체스트/, ['가슴', '삼두']],
  [/어깨|숄더|레이즈|오버헤드|밀리터리/, ['어깨']],
  [/팔\s?데이|(^|\s)팔(\s|$)|이두|삼두|컬|암\s?데이/, ['이두', '삼두']],
  [/코어|복근|플랭크|할로우/, ['코어']],
  [/홈|맨몸|푸시업|팔굽혀/, ['맨몸']],
  [/전신|풀바디/, ['전신']],
];

/** 오늘 운동 이름 · focus → 부위 낱말들(순서 유지, 중복 없음) */
export function partsOf(text: string | undefined): string[] {
  const out: string[] = [];
  for (const [re, parts] of PART_WORDS) {
    if (text && re.test(text)) for (const p of parts) if (!out.includes(p)) out.push(p);
  }
  return out;
}

/** 로컬 날짜 → 일 수(달력 하루마다 1씩 는다) */
export function dayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

export interface Picked<T> {
  guide: T;
  /** 오늘 운동과 맞춰 골랐으면 그 부위(카드 머리글 "오늘 하체 날") — 아니면 undefined */
  part?: string;
}

export function pickGuide<T extends Pickable>(list: readonly T[], today: string | undefined, date: Date = new Date()): Picked<T> | null {
  if (!list.length) return null;
  const n = dayNumber(date);
  const parts = partsOf(today);
  const match = parts.length ? list.filter((g) => g.tags.some((t) => parts.includes(t))) : [];
  const partOf = (g: T) => parts.find((p) => g.tags.includes(p));
  if (match.length >= 2) {
    const g = match[n % match.length];
    return { guide: g, part: partOf(g) };
  }
  if (match.length === 1 && n % 2 === 0) return { guide: match[0], part: partOf(match[0]) };
  const rest = match.length === 1 ? list.filter((g) => g !== match[0]) : list;
  const pool = rest.length ? rest : list;
  return { guide: pool[n % pool.length] };
}
