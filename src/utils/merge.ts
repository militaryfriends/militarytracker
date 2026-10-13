/**
 * 서버에서 새로 받은 기록을 기기 캐시와 합치는 순수 함수들 (session.ts 의 증분 동기화).
 * 같은 createdAt 은 같은 기록이다 — 서버 것이 기기 임시본(local-…)을 이긴다.
 */

/** 기기에만 있는(아직 못 올린) 기록의 임시 id */
export const isLocalId = (id?: string): boolean => !id || id.startsWith('local-');

/** 서버에서 받은 것 중 가장 최근 createdAt — 없으면 null (그때는 통째로 받는다) */
export function latestServerCreatedAt(list: { id?: string; createdAt?: string }[]): string | null {
  let max: string | null = null;
  for (const x of list) {
    if (isLocalId(x.id) || !x.createdAt) continue;
    if (!max || x.createdAt > max) max = x.createdAt;
  }
  return max;
}

type Stamped = { id?: string; createdAt?: string };
/** 같은 기록인지 가르는 열쇠 — createdAt (아주 옛 체중 문서엔 없을 수 있어 그때는 id) */
const keyOf = (x: Stamped): string => x.createdAt ?? `id:${x.id ?? ''}`;
const newestFirst = (a: Stamped, b: Stamped): number => {
  const x = a.createdAt ?? '', y = b.createdAt ?? '';
  return x < y ? 1 : x > y ? -1 : 0;
};

/**
 * fresh(서버) + cached(기기)를 createdAt 으로 합친다. 최신순, keep 개까지.
 * 서버 것이 같은 createdAt 의 기기 것을 대체한다.
 */
export function mergeByCreatedAt<T extends Stamped>(fresh: T[], cached: T[], keep: number): T[] {
  const byKey = new Map<string, T>();
  for (const x of cached) byKey.set(keyOf(x), x);
  for (const x of fresh) {
    const had = byKey.get(keyOf(x));
    // 서버 것(id 가 실제 문서 id)이 이긴다. 둘 다 서버 것이면 새로 받은 쪽
    if (!had || isLocalId(had.id) || !isLocalId(x.id)) byKey.set(keyOf(x), x);
  }
  return [...byKey.values()].sort(newestFirst).slice(0, keep);
}

/**
 * 통째로 다시 받았을 때 — 받은 것(fresh)이 서버의 진실이다. 기기 쪽은
 *  - 아직 못 올린 것(local-)과
 *  - 받은 것 중 가장 새것보다 나중 것(받는 사이에 저장된 것)만 남긴다.
 * 받은 게 하나도 없으면 기기 것을 그대로 둔다(빈 응답으로 기록을 지우지 않는다).
 */
export function replaceWithFresh<T extends Stamped>(fresh: T[], cached: T[], keep: number): T[] {
  if (!fresh.length) return mergeByCreatedAt(fresh, cached, keep);
  const newest = fresh.reduce((m, x) => ((x.createdAt ?? '') > m ? (x.createdAt ?? '') : m), '');
  const survivors = cached.filter((c) => isLocalId(c.id) || (c.createdAt ?? '') > newest);
  return mergeByCreatedAt(fresh, survivors, keep);
}

/**
 * 문서 id — 사용자 + 만든 시각(ms). 같은 기록을 다시 올려도(타임아웃 뒤 재시도) 같은 문서를 덮어써
 * 중복이 생기지 않는다. 규칙은 본인 문서 update 를 허용한다(firestore.rules workoutLogs/weights).
 */
export function stableDocId(uid: string, createdAt: string): string {
  const ms = Date.parse(createdAt);
  return `${uid}_${Number.isFinite(ms) ? ms : createdAt.replace(/[^0-9]/g, '')}`;
}

/** users 문서에서 기기 기록용 칸(lastLoginAt)만 바뀐 알림은 화면을 다시 그리지 않는다 */
export function userSignature(u: object): string {
  const { lastLoginAt: _skip, ...rest } = u as Record<string, unknown>;
  return JSON.stringify(rest);
}
