/**
 * 루틴 둘러보기 검색 — 이름 · 부제 · 꼬리표 · 설명 · 묶음 · 들어 있는 종목 이름에서 찾는다.
 * 띄어쓰기로 나눈 낱말이 모두 들어 있어야 한다("등 덤벨" → 덤벨로 등). 띄어쓰기 · 가운뎃점은 무시하고 비교한다.
 */
import { exById } from '../data/exercises';
import { LEVEL_LABEL, type Routine } from '../data/routines';

/** 같은 뜻으로 찾는 말 — 검색어를 이 말로 바꿔서 찾는다 */
const SYNONYM: Record<string, string> = { 턱걸이: '풀업', 친업: '풀업', 초보: '입문', 초보자: '입문', 복근운동: '복근', 엉덩이운동: '엉덩이' };

const norm = (s: string) => s.toLowerCase().replace(/[\s·・,/()]+/g, '');

const haystack = new Map<string, string>();
/** deep: 요일 구성 · 종목 이름까지(부위 집중용). 얕게는 이름 · 부제 · 꼬리표만(분할용 — "삼두"에 분할이 다 걸리지 않게) */
function textOf(r: Routine, deep: boolean): string {
  const key = `${r.id}|${deep ? 1 : 0}`;
  let t = haystack.get(key);
  if (t === undefined) {
    // 설명(desc)은 찾지 않는다 — "팔"이 '팔꿈치'에 걸리던 문제(11/28 검수)
    const base = [r.name, r.short, r.subtitle, r.group ?? '', LEVEL_LABEL[r.level], ...r.tags];
    const more = deep
      ? [...r.days.map((d) => `${d.name} ${d.focus}`), ...r.days.flatMap((d) => d.exIds.map((id) => exById(id)?.n ?? ''))]
      : [];
    t = norm([...base, ...more].join(' '));
    haystack.set(key, t);
  }
  return t;
}

export function searchRoutines<T extends Routine>(list: readonly T[], query: string, deep = true): T[] {
  const words = query.split(/\s+/).map(norm).filter(Boolean).map((w) => SYNONYM[w] ?? w);
  if (!words.length) return [...list];
  return list.filter((r) => {
    const t = textOf(r, deep);
    return words.every((w) => t.includes(w));
  });
}
