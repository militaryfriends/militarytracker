/**
 * 답 검증 — AI 가 데이터에 없는 kcal · g · kg · % 숫자를 만들었는지, 금지어를 썼는지 코드로 본다.
 * 위반이면 aiCoach 가 한 번 다시 쓰게 하고, 그래도 틀리면 그 문장을 뺀다.
 * 분 · 세트 · 회 같은 운동 처방 숫자는 보지 않는다(코칭에 필요하고 위험하지 않다).
 */

const NUM_UNIT = /(\d[\d,]*(?:\.\d+)?)\s?(kcal|킬로칼로리|칼로리|kg|킬로그램|킬로|g(?![a-z])|그램|%|퍼센트)/gi;
const ANY_NUM = /\d[\d,]*(?:\.\d+)?/g;

/** 금지 — 결과 약속 · 약물 · 극단 식단 */
const BANNED = [
  /보장/, /확실히\s?(빠|늘|됩|될)/, /100\s?%\s?(빠|성공|효과)/,
  /스테로이드|아나볼릭|펜터민|식욕\s?억제제|이뇨제|지방\s?분해\s?주사|삭센다|위고비|마운자로|SARMs?/i,
  /(물|단)\s?단식|굶(어|으)|하루\s?한\s?끼만/,
];

const toNum = (s: string) => Number(s.replace(/,/g, ''));

/** 허용 숫자 — 데이터 · 신호 · 사용자 말 · 서버가 계산한 카드에 나온 모든 숫자 */
export function allowedNumbers(...sources: (string | number | null | undefined)[]): number[] {
  const out: number[] = [];
  for (const s of sources) {
    if (s === null || s === undefined) continue;
    if (typeof s === 'number') {
      if (Number.isFinite(s)) out.push(s);
      continue;
    }
    for (const m of s.match(ANY_NUM) ?? []) {
      const n = toNum(m);
      if (Number.isFinite(n)) out.push(n);
    }
  }
  return out;
}

const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.05, Math.abs(a) * 0.01);

export interface Check {
  ok: boolean;
  /** 데이터에 없는 숫자 토큰 ("2,500kcal") */
  badNumbers: string[];
  banned: string[];
}

export function checkText(text: string, allowed: number[]): Check {
  const badNumbers: string[] = [];
  for (const m of text.matchAll(NUM_UNIT)) {
    const n = toNum(m[1]);
    if (!Number.isFinite(n)) continue;
    if (!allowed.some((a) => close(a, n))) badNumbers.push(m[0]);
  }
  const banned = BANNED.flatMap((r) => {
    const m = text.match(r);
    return m ? [m[0]] : [];
  });
  return { ok: !badNumbers.length && !banned.length, badNumbers, banned };
}

/** 위반 토큰이 든 문장을 뺀다(마지막 수단) */
export function stripSentences(text: string, tokens: string[]): string {
  if (!tokens.length) return text;
  const parts = text.split(/(?<=[.!?。]|다\.|요\.)\s+/);
  const kept = parts.filter((p) => !tokens.some((t) => p.includes(t)));
  return kept.join(' ').trim();
}
