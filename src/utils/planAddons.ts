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

/** 붙이기 좋은 요일 — 요일 이름 · focus 에서 읽은 부위가 attach 와 겹치는 첫 요일, 없으면 종목이 가장 적은 요일 */
export function suggestDay(plan: Plan, src: Pick<AddonSource, 'attach'>): number {
  if (!plan.days.length) return 0;
  const hit = plan.days.findIndex((d) => partsOf(`${d.name} ${d.focus}`).some((p) => src.attach.includes(p)));
  if (hit >= 0) return hit;
  let best = 0;
  plan.days.forEach((d, i) => { if (d.ids.length < plan.days[best].ids.length) best = i; });
  return best;
}

/** 그 요일 끝에 묶음을 붙인다. 이미 그날에 있는 종목은 다시 넣지 않는다. 같은 묶음을 다시 붙이면 바꾸지 않는다 */
export function attachAddon(plan: Plan, dayIdx: number, src: AddonSource): Plan {
  const day = plan.days[dayIdx];
  if (!day || day.addons?.some((a) => a.rid === src.rid)) return plan;
  const add = src.ids.filter((id) => !day.ids.includes(id));
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
