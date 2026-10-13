/**
 * 온보딩 입력(문자열) → 엔진 입력(숫자). 검증 · 정확도 판정도 여기서 한 번만.
 * 허리 · 인바디는 범위 안일 때만 엔진에 넘긴다(범위 밖이면 다음 단계로 못 간다).
 */
import { accuracyOf, type Accuracy } from '../../utils/bodyComp';
import {
  checkInbodyDate, parseNum, validateBodyFat, validateSmm, validateWaist,
} from '../../utils/body';
import type { AnalysisInput } from '../../utils/bodyAnalysis';
import type { UserProfile } from '../../types';
import type { InbodyDraft } from '../../stores/onboardDraft';
import type { BodyErrors } from './StepBody';

interface DraftLike {
  profile: UserProfile;
  waist: string;
  inbody: InbodyDraft;
}

const heightOf = (d: DraftLike) => parseNum(d.profile.height);

export function validateBodyDraft(d: DraftLike): BodyErrors {
  const e: BodyErrors = {};
  if (d.waist.trim()) e.waist = validateWaist(d.waist, heightOf(d));
  if (d.inbody.on) {
    e.bf = validateBodyFat(d.inbody.bf);
    e.smm = validateSmm(d.inbody.smm, parseNum(d.profile.weight));
    const dt = checkInbodyDate(d.inbody.date);
    e.date = dt.error;
    e.stale = dt.stale;
  }
  return e;
}

const waistOk = (d: DraftLike): number | undefined =>
  d.waist.trim() && !validateWaist(d.waist, heightOf(d)) ? parseNum(d.waist) : undefined;

const inbodyOk = (d: DraftLike): AnalysisInput['inbody'] => {
  if (!d.inbody.on) return undefined;
  const e = validateBodyDraft({ ...d, waist: '' });
  if (e.bf || e.smm || e.date) return undefined;
  return { bfPct: parseNum(d.inbody.bf), smmKg: parseNum(d.inbody.smm), date: d.inbody.date };
};

/** 지금 입력으로 정해지는 정확도 — 미터가 실시간으로 따라간다 */
export function draftAccuracy(d: DraftLike): Accuracy {
  return accuracyOf({ waistCm: waistOk(d), inbody: inbodyOk(d) });
}

export function buildAnalysisInput(d: DraftLike): AnalysisInput {
  const p = d.profile;
  const waistCm = waistOk(d);
  const inbody = inbodyOk(d);
  return {
    sex: p.sex,
    age: parseNum(p.age),
    heightCm: parseNum(p.height),
    weightKg: parseNum(p.weight),
    ...(waistCm ? { waistCm } : {}),
    ...(inbody ? { inbody } : {}),
    level: p.level,
    days: p.days,
    env: p.env,
    food: p.food,
  };
}
