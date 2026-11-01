import { exById, exFilter, type Place } from '../data/exercises';
import { DANGER, LUMBAR, WEEKLY_ONCE, splitLabel, splitTemplates, type DayTemplate, type Slot } from '../data/planTemplates';
import mediaSnapshot from '../data/mediaManifest.json';
import { routineById } from '../data/routines';
import { FocusPart, Plan, PlanDay, UserProfile } from '../types';

// ─── 시드 난수 (재생성 시마다 다른 구성) ───────────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── 프리셋 루틴 → 플랜 ────────────────────────────────────────────────────
export function planFromRoutine(routineId: string): Plan | null {
  const r = routineById(routineId);
  if (!r) return null;
  return {
    routineId: r.id,
    days: r.days.map<PlanDay>((d) => ({ id: d.id, name: d.name, focus: d.focus, ids: d.exIds })),
    planSrc: 'PRESET',
    planReason: `${r.name} — ${r.subtitle}`,
  };
}

// ─── 자동 생성 플랜 — 정석 템플릿 (AI 실패 시 폴백 / 무료 기본값 / 다시 생성) ───────────
// 무작위 생성은 쓰지 않는다: 레벨이 높을수록 변형 · 고난도 종목(길로틴 · 아처 · 플라이오)만 뽑히던 문제(10/31 피드백 3절).
// 템플릿(src/data/planTemplates.ts)의 슬롯을 채운다. seed 를 주면 슬롯 안의 대체 종목으로 바꾼다('자동 재구성').

const HAS_VIDEO: Set<string> = new Set(Object.keys((mediaSnapshot as { items?: Record<string, unknown> }).items ?? {}));

/** 이 슬롯에서 고를 수 있는 종목(장소 · 존재 · 위험 제외) — 영상 있는 것이 앞 */
function slotCandidates(slot: Slot, level: 1 | 2 | 3, place: Place): string[] {
  const base = level === 1 && slot.beginner ? slot.beginner : slot.opts;
  const ok = base.filter((id) => {
    const e = exById(id);
    return !!e && e.pl.includes(place) && !DANGER.has(id);
  });
  // 영상 있는 종목을 앞으로 — 같은 그룹 안에서는 원래 순서(정석 우선) 유지
  return [...ok.filter((id) => HAS_VIDEO.has(id)), ...ok.filter((id) => !HAS_VIDEO.has(id))];
}

/**
 * 템플릿 → 플랜. variant 0 = 기본(각 슬롯 첫 후보), 그 밖에는 슬롯마다 seed 로 다른 후보.
 * 허리 부하 종목은 같은 날 하나, 데드리프트 · 랙풀은 주 1회 — 어기면 그 슬롯의 다음 후보.
 */
export function planFromTemplates(
  templates: DayTemplate[], o: { level: 1 | 2 | 3; place: Place; perDay: number; seed?: number },
): PlanDay[] {
  const rnd = o.seed !== undefined ? mulberry32(o.seed) : null;
  const weekly = new Set<string>();
  return templates.map((t) => {
    const ids: string[] = [];
    let lumbar = false;
    const slots = t.slots.filter((sl) => !sl.optional || o.perDay > 5).slice(0, o.perDay);
    for (const sl of slots) {
      let cands = slotCandidates(sl, o.level, o.place).filter((id) => !ids.includes(id));
      cands = cands.filter((id) => !(LUMBAR.has(id) && lumbar) && !(WEEKLY_ONCE.has(id) && weekly.has(id)));
      if (!cands.length) continue;
      // 재구성도 영상 있는 후보 안에서만 바꾼다(영상 우선 원칙) — 영상 후보가 하나뿐이면 전체에서
      const withVideo = cands.filter((id) => HAS_VIDEO.has(id));
      const pool = withVideo.length >= 2 ? withVideo : cands;
      const pick = rnd ? pool[Math.floor(rnd() * pool.length)] : cands[0];
      ids.push(pick);
      if (LUMBAR.has(pick)) lumbar = true;
      if (WEEKLY_ONCE.has(pick)) weekly.add(pick);
    }
    return { id: t.id, name: t.name, focus: t.focus, ids };
  }).filter((d) => d.ids.length > 0);
}

/** 신경 쓰이는 부위 → 그 부위가 있는 첫 데이에 더할 보조 종목(앞이 우선, 이미 있으면 다음) */
const FOCUS_EXTRA: Record<FocusPart, { parts: string[]; gym: string[]; home: string[] }> = {
  chest: { parts: ['chest'], gym: ['crossover', 'pecdeck', 'dbfly'], home: ['dbfly', 'pushup'] },
  back: { parts: ['back'], gym: ['straightarmpull', 'facepull', 'reversefly'], home: ['reversefly', 'facepull'] },
  shoulders: { parts: ['shoulders'], gym: ['cablelatraise', 'latraise', 'reardeltfly'], home: ['latraise', 'bandedlatraise'] },
  arms: { parts: ['biceps', 'triceps'], gym: ['hammercurl', 'ropepushdown', 'cablecurl'], home: ['hammercurl', 'kickback'] },
  abs: { parts: ['abs', 'legs', 'back'], gym: ['cablecrunch', 'hanginglegraise', 'plank'], home: ['plank', 'legraise', 'deadbug'] },
  legs: { parts: ['legs'], gym: ['hipthrust', 'legext', 'seatedcalf'], home: ['glutebridge', 'stepup'] },
};

function addFocus(days: PlanDay[], focus: FocusPart[] | undefined, place: Place): PlanDay[] {
  if (!focus?.length) return days;
  const out = days.map((d) => ({ ...d, ids: [...d.ids] }));
  for (const f of focus) {
    const spec = FOCUS_EXTRA[f];
    const day = out.find((d) => d.ids.length < 7 && d.ids.some((id) => spec.parts.includes(exById(id)?.part ?? '')));
    if (!day) continue;
    const pick = (place === 'home' ? spec.home : spec.gym).find((id) => !day.ids.includes(id) && exById(id)?.pl.includes(place));
    if (pick) day.ids.push(pick);
  }
  return out;
}

/**
 * AI 플랜에 보내는 데이 · 슬롯 구조 — AI 는 데이 순서 · 이름을 그대로 두고 슬롯마다 후보 하나를 고른다(프로 개인화).
 * 결과는 conformToTemplates 가 같은 구조로 다시 맞춘다(데이 순서가 같아야 AI 선택이 살아남는다).
 */
export function templateSlots(p: UserProfile): { name: string; focus: string; slots: string[][] }[] {
  const level = (p.level ?? 2) as 1 | 2 | 3;
  const perDay = p.goal === 'habit' ? 3 : 5;
  return splitTemplates(p.env, p.days, level).map((t) => ({
    name: t.name,
    focus: t.focus,
    slots: t.slots.filter((sl) => !sl.optional || perDay > 5).slice(0, perDay)
      .map((sl) => slotCandidates(sl, level, p.env).slice(0, 6))
      .filter((c) => c.length > 0),
  }));
}

/** seed 없으면 기본 정석 구성, 있으면 슬롯 안에서만 바꾼 구성('자동 재구성') */
export function buildLocalPlan(p: UserProfile, seed?: number): Plan {
  const level = (p.level ?? 2) as 1 | 2 | 3;
  const perDay = p.goal === 'habit' ? 3 : 5;
  const templates = splitTemplates(p.env, p.days, level);
  const days = addFocus(planFromTemplates(templates, { level, place: p.env, perDay, seed }), p.goal === 'habit' ? undefined : p.focus, p.env);
  return {
    routineId: null,
    days,
    planSrc: 'LOCAL',
    planReason:
      p.goal === 'habit'
        ? `습관 형성 목표 — ${splitLabel(p.env, p.days, level)} 구성을 하루 3종목으로 짧게 줄였습니다.`
        : `${p.env === 'home' ? '홈트' : '헬스장'} 주 ${p.days}일 · ${splitLabel(p.env, p.days, level)} 정석 구성입니다.`,
  };
}

/**
 * AI 플랜을 템플릿 슬롯에 맞춘다 — AI 는 같은 슬롯 안의 대체 종목만 고를 수 있다(프로 개인화).
 * 슬롯에 없는 종목 · 위험 종목 · 허리 부하 중복은 그 슬롯의 기본 종목으로 되돌린다.
 */
export function conformToTemplates(ai: Plan, p: UserProfile): Plan {
  const level = (p.level ?? 2) as 1 | 2 | 3;
  const perDay = p.goal === 'habit' ? 3 : 5;
  const templates = splitTemplates(p.env, p.days, level);
  const base = planFromTemplates(templates, { level, place: p.env, perDay });
  const weekly = new Set<string>();
  const days: PlanDay[] = base.map((bd, di) => {
    const t = templates.find((x) => x.id === bd.id)!;
    const aiIds = new Set(ai.days[di]?.ids ?? []);
    const slots = t.slots.filter((sl) => !sl.optional || perDay > 5).slice(0, perDay);
    let lumbar = false;
    const ids: string[] = [];
    slots.forEach((sl, si) => {
      const cands = slotCandidates(sl, level, p.env);
      const want = cands.find((id) => aiIds.has(id)) ?? bd.ids[si] ?? cands[0];
      const ok = (id: string) => !!id && !ids.includes(id) && !(LUMBAR.has(id) && lumbar) && !(WEEKLY_ONCE.has(id) && weekly.has(id));
      const pick = ok(want) ? want : cands.find(ok);
      if (!pick) return;
      ids.push(pick);
      if (LUMBAR.has(pick)) lumbar = true;
      if (WEEKLY_ONCE.has(pick)) weekly.add(pick);
    });
    return { ...bd, ids };
  });
  return { ...ai, days: addFocus(days, p.goal === 'habit' ? undefined : p.focus, p.env) };
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * AI 응답(days/reason)을 검증해 Plan 으로 변환. 유효하지 않으면 null.
 * 타입·길이·중복·장소를 전부 여기서 거른다 — 이 값은 저장되고 화면에 그대로 렌더된다.
 * (planReason 이 object 로 저장되면 플랜 탭이 재시작마다 크래시한다)
 */
export function planFromAI(
  raw: unknown,
  fallbackProfile: UserProfile
): Plan | null {
  const j = (raw ?? {}) as { days?: unknown; reason?: unknown };
  if (!Array.isArray(j.days) || !j.days.length) return null;
  const allowed = new Set(exFilter({ place: fallbackProfile.env }).map((e) => e.id));
  const seen = new Set<string>();

  const days: PlanDay[] = j.days
    .slice(0, 7)
    .map((d, i) => {
      const x = (d ?? {}) as { id?: unknown; name?: unknown; focus?: unknown; ids?: unknown };
      const ids = (Array.isArray(x.ids) ? x.ids : [])
        .filter((id): id is string => typeof id === 'string' && allowed.has(id) && !seen.has(id))
        .slice(0, 10);
      ids.forEach((id) => seen.add(id));
      return {
        id: str(x.id, 24) || `day${i + 1}`,
        name: str(x.name, 24) || `Day ${i + 1}`,
        focus: str(x.focus, 40),
        ids,
      };
    })
    .filter((d) => d.ids.length > 0);

  if (!days.length) return null;
  return {
    routineId: null,
    days,
    planSrc: 'AI',
    planReason: str(j.reason, 200) || `주 ${fallbackProfile.days}일 목표에 맞춘 AI 구성입니다.`,
  };
}

/**
 * 구버전 플랜 문서 보정.
 * 이전 스키마의 PlanDay 에는 id 가 없어 key 가 NaN 이 되고 중복 키 에러가 발생한다.
 * 존재하지 않는 종목 id 도 함께 걸러낸다.
 */
export function normalizePlan(plan: Plan | null | undefined): Plan | null {
  if (!plan || !Array.isArray(plan.days) || plan.days.length === 0) return null;
  const days: PlanDay[] = plan.days
    .map((d, i) => ({
      id: str(d?.id, 24) || `day${i + 1}`,
      name: str(d?.name, 24) || `Day ${i + 1}`,
      focus: str(d?.focus, 40),
      // 같은 종목이 두 번 들어오면 세션에 같은 종목이 두 개 생기고 '지난 기록' 은 첫 것만 본다
      ids: Array.isArray(d?.ids) ? [...new Set(d.ids.filter((x) => typeof x === 'string' && !!exById(x)))] : [],
    }))
    // 종목이 하나도 남지 않은 데이는 버린다 — 화면에서 undefined 참조를 만든다
    .filter((d) => d.ids.length > 0);
  if (!days.length) return null;
  const planSrc: Plan['planSrc'] =
    plan.planSrc === 'AI' || plan.planSrc === 'PRESET' || plan.planSrc === 'LOCAL' ? plan.planSrc : 'LOCAL';
  return {
    ...plan,
    days,
    planSrc,
    planReason: str(plan.planReason, 300),
    routineId: typeof plan.routineId === 'string' ? plan.routineId : null,
  };
}
