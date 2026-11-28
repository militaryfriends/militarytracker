/**
 * 부위 집중 루틴 붙이기 · 떼기 (2026-11-28 대표 결정: 분할 루틴은 플랜 전체 교체, 부위 집중 루틴은 "○○데이에 붙이기 + 지금 한 번만 하기").
 * 순수 함수 — 단위 테스트 대상. 저장은 화면에서 savePlan.
 */
import type { Plan, PlanDay } from '../types';
import { partsOf } from './guidePick';

export interface AddonSource {
  rid: string;
  name: string;
  ids: readonly string[];
  /** 어느 요일에 붙이면 맞는지(부위 낱말: 등 · 가슴 · 하체 · 어깨 · 이두 · 삼두 · 코어 …) */
  attach: readonly string[];
}

/** 요일 이름에 부위가 직접 안 써 있을 때 보는 말(팔 날 · 레그데이 · 풀데이 …) */
const ALIAS: Record<string, string[]> = {
  이두: ['팔'], 삼두: ['팔'], 하체: ['레그', '다리'], 등: ['풀', '당기'], 가슴: ['푸시', '미는'], 어깨: ['숄더'], 코어: ['복근'],
};

/**
 * 붙이기 좋은 요일 — 점수가 가장 높은 요일, 같으면 종목이 적은 요일(11/28 검수: 넓게 묶은 부위로 고르면 이두가 푸시데이로 갔다)
 *  3: 요일 이름 · focus 에 부위 낱말이 그대로 있다("등 · 이두", "가슴·삼두")
 *  2: 별칭이 있다(팔 · 레그 · 풀 …)
 *  1: 넓은 부위 읽기(partsOf)로만 맞는다
 */
export function suggestDay(plan: Plan, src: Pick<AddonSource, 'attach'>): number {
  if (!plan.days.length) return 0;
  const score = (d: PlanDay) => {
    const t = `${d.name} ${d.focus}`;
    if (src.attach.some((a) => t.includes(a))) return 3;
    if (src.attach.some((a) => (ALIAS[a] ?? []).some((w) => t.includes(w)))) return 2;
    if (partsOf(t).some((p) => src.attach.includes(p))) return 1;
    return 0;
  };
  let best = 0;
  plan.days.forEach((d, i) => {
    const a = score(d); const b = score(plan.days[best]);
    if (a > b || (a === b && d.ids.length < plan.days[best].ids.length)) best = i;
  });
  return best;
}

/** 사실상 같은 동작(도구 · 손잡이만 다름) — 그날 하나가 있으면 다른 하나는 붙이지 않는다 */
const SIMILAR: readonly string[][] = [
  ['pushdown', 'ropepushdown', 'bandedpushdown'],
  ['facepull', 'facepullsh'],
  ['reversefly', 'reardeltfly', 'inclinereardelt'],
  ['ohext', 'ohropeext', 'onearmohext'],
  ['rdl', 'rdlleg'],
  ['hammercurl', 'cablehammer'],
  ['dipschest', 'dipstri'],
  ['pikepushup', 'pikepushupsh'],
  ['diamondpushup', 'diamondpushuptri'],
  ['shrug', 'bbshrug'],
  ['latpull', 'widelatpull'],
  ['pullup', 'assistedpullup', 'negativepullup'],
];
const familyOf = new Map<string, string[]>();
for (const g of SIMILAR) for (const id of g) familyOf.set(id, g);
/** 그날 종목 중에 같은 동작(또는 같은 종목)이 이미 있는가 */
export const hasSimilar = (dayIds: readonly string[], id: string): boolean =>
  dayIds.includes(id) || (familyOf.get(id) ?? []).some((x) => dayIds.includes(x));

/**
 * 그 요일 끝에 묶음을 붙인다. 이미 그날에 있는 종목 · 같은 동작은 다시 넣지 않는다. 같은 묶음을 다시 붙이면 바꾸지 않는다.
 * skip: 화면이 정하는 추가 거르기(집에서 못 하는 종목 · 허리 부하 종목이 이미 있는 날 등)
 */
export function attachAddon(plan: Plan, dayIdx: number, src: AddonSource, skip?: (id: string, dayIds: readonly string[]) => boolean): Plan {
  const day = plan.days[dayIdx];
  if (!day || day.addons?.some((a) => a.rid === src.rid)) return plan;
  const add: string[] = [];
  for (const id of src.ids) {
    const now = [...day.ids, ...add];
    if (hasSimilar(now, id) || skip?.(id, now)) continue;
    add.push(id);
  }
  if (!add.length) return plan;
  const next: PlanDay = {
    ...day,
    ids: [...day.ids, ...add],
    addons: [...(day.addons ?? []), { rid: src.rid, name: src.name, ids: add }],
  };
  return { ...plan, days: plan.days.map((d, i) => (i === dayIdx ? next : d)) };
}

/** 묶음을 뗀다 — 그 묶음이 더한 종목만 빠진다 */
export function detachAddon(plan: Plan, dayIdx: number, rid: string): Plan {
  const day = plan.days[dayIdx];
  const addon = day?.addons?.find((a) => a.rid === rid);
  if (!day || !addon) return plan;
  const rest = (day.addons ?? []).filter((a) => a.rid !== rid);
  const next: PlanDay = { ...day, ids: day.ids.filter((id) => !addon.ids.includes(id)) };
  if (rest.length) next.addons = rest;
  else delete next.addons;
  return { ...plan, days: plan.days.map((d, i) => (i === dayIdx ? next : d)) };
}

/** 이 묶음이 붙어 있는 요일 번호(없으면 -1) */
export const attachedDay = (plan: Plan | null | undefined, rid: string): number =>
  plan ? plan.days.findIndex((d) => d.addons?.some((a) => a.rid === rid)) : -1;

/**
 * 새 플랜으로 바뀔 때(재구성 · 분할 루틴 교체) 붙여 둔 묶음을 새 플랜의 맞는 요일로 옮긴다(11/28 대표: "재구성에도 안내").
 * sources: rid → 묶음 정보(종목 · 붙일 부위). 루틴 데이터에서 다시 찾는다 — 못 찾으면 옛 묶음 종목 그대로, 부위 없이(종목 가장 적은 요일).
 * 돌려주는 moved = 옮긴 묶음 이름들(안내 문구용).
 */
export function carryAddons(
  oldPlan: Plan | null | undefined, newPlan: Plan, sources: (rid: string) => AddonSource | undefined,
  skip?: (id: string, dayIds: readonly string[]) => boolean,
): { plan: Plan; moved: string[] } {
  let plan = newPlan;
  const moved: string[] = [];
  for (const d of oldPlan?.days ?? []) {
    for (const a of d.addons ?? []) {
      const src = sources(a.rid) ?? { rid: a.rid, name: a.name, ids: a.ids, attach: [] };
      const next = attachAddon(plan, suggestDay(plan, src), src, skip);
      if (next !== plan) { plan = next; moved.push(src.name); }
    }
  }
  return { plan, moved };
}
