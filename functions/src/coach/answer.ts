/**
 * 코치 답을 만드는 순서 — 모델 호출만 밖에서 받는다(call). 서버(aiCoach)와 평가(scripts/coach-eval)가 같은 길을 탄다.
 *   모델 답 → 읽기(parseCoach) → 숫자 · 금지어 검사 → 틀리면 한 번 다시 → 그래도면 그 문장 삭제 → 마무리(finishCoach)
 * 마무리에서 코드가 붙이는 것: 끝에 한 문장(focus mention), 응원 줄(win), next 다듬기.
 * 순수 모듈 — Firebase 를 가져오지 않는다.
 */
import { normalizeCheer, normalizeMeal, normalizeWarning, type CoachMeal } from '../coachMeal';
import type { Intent } from './intent';
import { firstJson } from './parse';
import { SAID_ALREADY, type Focus } from './signals';
import { checkText, stripSentences } from './validate';
import { warnLine } from './know';

export interface CoachOut {
  reply: string;
  meal: CoachMeal | null;
  warning: string | null;
  cheer: string | null;
  next: string | null;
}

export interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

const clip = (x: unknown, max: number) => (typeof x === 'string' ? x : '').slice(0, max);

/** 할 일 한 줄 — 모델이 앞뒤에 붙인 따옴표 · 괄호 · 기호를 뗀다. 비었으면 null */
export function cleanNext(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/\s+/g, ' ').replace(/^[\s"'“”‘’`.,+\-–—:;()[\]{}]+/, '').replace(/[\s"'“”‘’`,;:([{]+$/, '').slice(0, 80);
  return s.length >= 3 && !/^(null|없음|none)$/i.test(s) ? s : null;
}

/** 모델 답(JSON) → 글 · 식단 카드 · 경고 · 응원 · 다음 행동. 깨진 JSON 을 회원에게 보여 주지 않는다(null → 실패 처리) */
export function parseCoach(raw: string, dayKcal?: number): CoachOut | null {
  // `{"next":"` 로 시작시켰는데 null 을 쓴 경우
  const fixed = raw.replace(/^\s*\{"next":"null\s*,\s*"text"/, '{"next":null,"text"');
  const d = firstJson(fixed);
  if (d) {
    const reply = clip(d.text, 1200).trim();
    const meal = normalizeMeal(d.meal, dayKcal);
    if (reply || meal) {
      return { reply: reply || '식단을 구성했습니다.', meal, warning: normalizeWarning(d.warning), cheer: normalizeCheer(d.cheer), next: cleanNext(d.next) };
    }
    return null;
  }
  // JSON 이 아니라 그냥 글로 답한 경우만 그대로 쓴다
  const plain = raw.replace(/```(json)?/g, '').trim();
  return plain && !/^\s*[{[]/.test(plain) && !plain.includes('"text"')
    ? { reply: plain.slice(0, 1200), meal: null, warning: null, cheer: null, next: null }
    : null;
}

/** 답의 kcal · g · kg · % 숫자 검사 — 서버가 계산한 식단 카드 숫자도 허용 목록에 */
export function checkCoach(o: CoachOut, allowed: number[]) {
  const mealNums = o.meal
    ? [o.meal.kcal, o.meal.p, o.meal.pct, o.meal.dayKcal ?? 0, ...o.meal.items.flatMap((i) => [i.q, i.kcal, i.p])]
    : [];
  const all = [...allowed, ...mealNums];
  const res = [o.reply, o.warning ?? '', o.cheer ?? '', o.next ?? ''].map((t) => checkText(t, all));
  return {
    ok: res.every((r) => r.ok),
    tokens: [...new Set(res.flatMap((r) => [...r.badNumbers, ...r.banned]))],
  };
}

export const FALLBACK_REPLY = '이 질문은 기록을 조금 더 보고 답드리겠습니다. 질문을 조금 더 구체적으로 해 주세요.';

export function stripCoach(o: CoachOut, tokens: string[]): CoachOut {
  const f = (t: string | null) => {
    if (!t) return t;
    const s = stripSentences(t, tokens);
    return s.length >= 4 ? s : null;
  };
  return { ...o, reply: f(o.reply) || FALLBACK_REPLY, warning: f(o.warning), cheer: f(o.cheer), next: f(o.next) };
}

/**
 * 못 먹는 음식 — 앱이 보낸 환경 줄("알레르기 · 못 먹는 음식 우유 · 유제품")에서 낱말을 뽑고, 흔한 것은 그 음식이 든 것까지 넓힌다.
 * 프롬프트에도 규칙이 있지만 식단 카드에 한 번이라도 섞이면 안 되므로 코드로 한 번 더 거른다.
 */
const ALLERGY_FAMILY: [RegExp, RegExp][] = [
  [/우유|유제품|유당|락토/, /우유|밀크|요거트|요구르트|치즈|라떼|유청|웨이|카제인|버터|크림|아이스크림|프로틴\s?(쉐이크|파우더)/],
  [/견과|땅콩|아몬드|호두/, /견과|아몬드|땅콩|호두|캐슈|피스타치오|피넛|잣|그래놀라/],
  [/계란|달걀|난류/, /계란|달걀|메추리알|마요/],
  [/밀|글루텐/, /빵|식빵|면|국수|파스타|라면|우동|시리얼|또띠아|베이글/],
  [/갑각|새우|꽃게/, /새우|게살|꽃게|대게|랍스터|크랩/],
  [/생선|해산물|어패/, /생선|연어|참치|고등어|새우|오징어|조개|굴|회덮밥|초밥/],
  [/콩|대두/, /두부|두유|콩|된장|낫토/],
  [/돼지/, /돼지|삼겹|목살|베이컨|햄|소시지/],
  [/소고기|쇠고기/, /소고기|쇠고기|불고기|스테이크|차돌/],
];

export function allergyFilter(data: string): RegExp | null {
  const m = data.match(/알레르기\s?·\s?못 먹는 음식\s*([^\n]*)/);
  const raw = (m?.[1] ?? '').trim();
  if (!raw || /^없음/.test(raw)) return null;
  const words = raw.split(/[·,\/\s]+/).map((w) => w.trim()).filter((w) => w.length >= 1 && w.length <= 10);
  const parts = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  for (const [key, family] of ALLERGY_FAMILY) if (key.test(raw)) parts.push(family.source);
  return parts.length ? new RegExp(parts.join('|')) : null;
}

/** 식단 카드에서 못 먹는 음식을 뺀다 — 두 가지 미만이 남으면 카드를 내지 않는다 */
export function dropAllergens(out: CoachOut, data: string, dayKcal?: number): CoachOut {
  const re = out.meal ? allergyFilter(data) : null;
  if (!re || !out.meal) return out;
  const items = out.meal.items.filter((i) => !re.test(i.n));
  if (items.length === out.meal.items.length) return out;
  return { ...out, meal: items.length >= 2 ? normalizeMeal({ t: out.meal.t, items }, dayKcal) : null };
}

/** 대표 승인 응원 문장 — 모델이 지어내지 않게 코드가 조건을 보고 고른다(밀프 말투 가이드 2026-11-12) */
export const CHEERS = {
  hard: '어려워서 가치가 있는 겁니다.',
  body: '몸 만드셔야죠.',
  near: '목표까지 얼마 안 남았습니다.',
  eat: '먹는 것도 훈련입니다.',
} as const;

export interface CheerCtx {
  question: string;
  phase?: string | null;
  /** 프로젝트 기간 75% 이상 + 엔진 예상 대비 계획 범위 안 */
  nearGoal?: boolean;
}

/**
 * 응원 줄 고르기. 순서: 목표 근접(데이터가 받칠 때만) → 기록 갱신 · 연속 달성(운동 질문) → 승인 문장 → 모델이 쓴 응원.
 * "목표까지 얼마 안 남았습니다" 는 근거가 없으면 절대 쓰지 않는다.
 */
export function pickCheer(out: CoachOut, o: { intent: Intent; win: Focus['win']; cheer?: CheerCtx }): string | null {
  const q = o.cheer?.question ?? '';
  const hard = o.intent === 'motivation' || /힘들|힘드|어렵|어려워|지쳤|지쳐|지치|버겁|하기\s?싫/.test(q);
  if (o.cheer?.nearGoal && (hard || o.intent === 'progress')) return CHEERS.near;
  if (o.win?.where === 'cheer') return o.win.say;
  if (o.intent === 'app' || o.intent === 'general') return out.cheer;
  if (hard) return CHEERS.hard;
  if (o.intent === 'diet' && out.meal && o.cheer?.phase === 'gain') return CHEERS.eat;
  if (o.intent === 'diet' && /치팅|폭식|과식|많이\s?먹|다시\s?시작/.test(q)) return CHEERS.body;
  // 운동 처방을 준 답(모델이 응원 줄을 붙였다는 것이 처방을 줬다는 표시)
  if (o.intent === 'workout' && out.cheer) return CHEERS.body;
  return out.cheer;
}

/**
 * 마무리 — 코드가 정한 것을 답에 얹는다.
 *  · focus(mention): 서버가 쓴 한 문장을 답 끝에. 모델은 이 내용을 쓰지 않도록 안내받는다(prompt <aside>).
 *  · win(cheer): 성과를 응원 줄로. 모델이 쓴 응원 줄보다 실제 기록이 낫다.
 *  · 앱 사용법 답에는 다음 행동을 붙이지 않는다.
 */
export function finishCoach(
  src: CoachOut, o: {
    intent: Intent; focus: Focus['focus']; win: Focus['win']; data?: string; dayKcal?: number;
    cheer?: CheerCtx; warnTarget?: string | null;
  },
): CoachOut {
  const out = o.data ? dropAllergens(src, o.data, o.dayKcal) : src;
  let { reply, next, warning } = out;
  // 감량 중 탄산 · 야식 · 매일 술을 물으면 승인 경고 문형 — 모델이 안 썼으면 코드가 채운다
  if (o.warnTarget && !(warning && /무조건 피하세요/.test(warning))) warning = warnLine(o.warnTarget);
  if (o.intent === 'app') next = null;
  // 모델이 이미 같은 말을 했으면 또 붙이지 않는다(<aside> 를 보여 주면 가끔 제 글에도 쓴다)
  if (o.focus?.mode === 'mention' && reply !== FALLBACK_REPLY && !SAID_ALREADY[o.focus.key]?.test(reply)) {
    reply = `${reply.trimEnd()} ${o.focus.say}`;
  }
  const cheer = pickCheer(out, o);
  return { ...out, reply, cheer, next, warning };
}

/**
 * 한 턴의 답을 끝까지 만든다. call 은 마지막에 assistant 프리필까지 붙여 모델을 부르고, 프리필을 포함한 원문을 돌려준다.
 * 못 읽는 답이면 null(한도를 쓰지 않게 호출한 쪽이 실패로 처리).
 */
export async function runCoach(o: {
  call: (msgs: Msg[]) => Promise<string>;
  messages: Msg[];
  allowed: number[];
  dayKcal?: number;
  intent: Intent;
  focus: Focus['focus'];
  win: Focus['win'];
  /** 앱이 보낸 회원 정보 — 못 먹는 음식을 카드에서 거르는 데 쓴다 */
  data?: string;
  /** 응원 문장 고르기 재료 */
  cheer?: CheerCtx;
  /** 승인 경고 문형을 쓸 대상(know.warnFor) */
  warnTarget?: string | null;
}): Promise<{ out: CoachOut | null; raw: string; retried: boolean; stripped: boolean }> {
  let raw = await o.call(o.messages);
  let out = raw ? parseCoach(raw, o.dayKcal) : null;
  let retried = false;
  if (!out) {
    // 형식이 깨진 답 — 한 번 더 받아 본다(같은 입력, 캐시가 살아 있어 싸다)
    retried = true;
    const again = await o.call(o.messages).catch(() => '');
    out = again ? parseCoach(again, o.dayKcal) : null;
    if (!out) return { out: null, raw, retried, stripped: false };
    raw = again;
  }
  let stripped = false;
  let chk = checkCoach(out, o.allowed);
  if (!chk.ok) {
    retried = true;
    const raw2 = await o.call([...o.messages, { role: 'assistant', content: raw }, {
      role: 'user',
      content: `규칙 위반: ${chk.tokens.join(', ')} — 자료(<data> · <status> · <focus> · <food_facts>)에 없는 숫자이거나 금지된 표현이다. `
        + '그 부분을 빼거나 자료의 숫자로 바꿔서, 같은 JSON 형식으로 답 전체를 다시 써라.',
    }]).catch(() => '');
    const out2 = raw2 ? parseCoach(raw2, o.dayKcal) : null;
    if (out2) {
      const chk2 = checkCoach(out2, o.allowed);
      // 다시 쓴 답이 더 나을 때만 바꾼다
      if (chk2.ok || chk2.tokens.length < chk.tokens.length) {
        out = out2;
        chk = chk2;
      }
    }
    if (!chk.ok) {
      stripped = true;
      out = stripCoach(out, chk.tokens);
    }
  }
  return { out: finishCoach(out, o), raw, retried, stripped };
}
