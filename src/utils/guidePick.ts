/**
 * 오늘의 가이드 고르기 — 하루 한 편, 날마다 바뀐다(2026-11-28 대표 지시: 최신 VO 운동 꿀팁 릴스를 하나씩).
 *  · 오늘 운동 부위(plan day focus, 예: "하체 · 코어")와 맞는 편이 있으면 그중에서 고른다.
 *  · 없으면 전체에서 고른다. 같은 날에는 언제 열어도 같은 편이다(날짜로 정한다).
 */
export interface Pickable {
  id: string;
  tags: readonly string[];
}

/** 로컬 날짜 → 일 수(달력 하루마다 1씩 는다) */
export function dayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

export function pickGuide<T extends Pickable>(list: readonly T[], focus: string | undefined, date: Date = new Date()): T | null {
  if (!list.length) return null;
  const words = (focus ?? '').split(/[\s·,/]+/).filter(Boolean);
  const match = words.length ? list.filter((g) => g.tags.some((t) => words.includes(t))) : [];
  const pool = match.length ? match : list;
  return pool[dayNumber(date) % pool.length];
}
