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
 * 마무리 — 코드가 정한 것을 답에 얹는다.
 *  · focus(mention): 서버가 쓴 한 문장을 답 끝에. 모델은 이 내용을 쓰지 않도록 안내받는다(prompt <aside>).
 *  · win(cheer): 성과를 응원 줄로. 모델이 쓴 응원 줄보다 실제 기록이 낫다.
 *  · 앱 사용법 답에는 다음 행동을 붙이지 않는다.
 */
export function finishCoach(out: CoachOut, o: { intent: Intent; focus: Focus['focus']; win: Focus['win'] }): CoachOut {
  let { reply, cheer, next } = out;
  if (o.intent === 'app') next = null;
  // 모델이 이미 같은 말을 했으면 또 붙이지 않는다(<aside> 를 보여 주면 가끔 제 글에도 쓴다)
  if (o.focus?.mode === 'mention' && reply !== FALLBACK_REPLY && !SAID_ALREADY[o.focus.key]?.test(reply)) {
    reply = `${reply.trimEnd()} ${o.focus.say}`;
  }
  if (o.win?.where === 'cheer') cheer = o.win.say;
  return { ...out, reply, cheer, next };
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
