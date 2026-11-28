/**
 * 결석 알림 — 운동을 3일 넘게 빼먹으면 정해 둔 운동 시간에 부르고, 쉴수록 말이 세진다(2026-11-27 대표 지시).
 * 여기는 '언제 · 무슨 말'만 정한다(순수 함수 — 단위 테스트 대상). 실제 예약은 services/reminders.ts.
 *
 * 규칙
 *  · 마지막 운동 뒤 3 · 4 · 5 · 7 · 10 · 14일째, 사용자가 고른 시간에 한 번씩. 14일째가 마지막이다(그 뒤로는 부르지 않는다).
 *  · 세기: 끔 · 순한맛 · 매운맛. 매운맛은 헬스장 트레이너가 회원을 부르는 말투로 점점 세진다.
 *  · 문구 끝의 한마디는 밀리터리프렌즈가 쓴 말이다 — 실제 인물의 명언처럼 이름을 붙이지 않는다(출처를 확인 못 한 인용 금지).
 *  · 숫자 · 효과를 약속하는 말은 쓰지 않는다("3일이면 근손실" 같은 문구 금지).
 */

export type NudgeLevel = 'off' | 'mild' | 'hot';
/** 고를 수 있는 시간(시) — 밤 9시 이후 · 아침 7시 이전에는 부르지 않는다 */
export const NUDGE_HOURS = [7, 12, 18, 20] as const;
export type NudgeHour = (typeof NUDGE_HOURS)[number];
export const NUDGE_DAYS = [3, 4, 5, 7, 10, 14] as const;

export const NUDGE_DEFAULT: { level: NudgeLevel; hour: NudgeHour } = { level: 'mild', hour: 18 };

export const NUDGE_HOUR_LABEL: Record<NudgeHour, string> = { 7: '아침 7시', 12: '점심 12시', 18: '저녁 6시', 20: '저녁 8시' };
export const NUDGE_LEVEL_LABEL: Record<NudgeLevel, string> = { off: '끔', mild: '순한맛', hot: '매운맛' };

export interface Nudge {
  days: number;
  title: string;
  body: string;
}

// 잠금화면은 본문을 4줄쯤에서 자른다 — 작은 폰(한 줄 18자)에서도 3줄 안에 들어가게 쓴다(테스트: fitsLockScreen).
// [제목, 본문, 오늘 할 운동 이름을 넣을 때의 본문(3일째만)]
const MILD: Record<number, [string, string, ((day: string) => string)?]> = {
  3: ['사흘 쉬었어요', '첫 종목만 해도 다시 이어져요.', (d) => `오늘은 ${d}. 첫 종목만 해도 이어져요.`],
  4: ['나흘째예요', '준비 운동 5분만 하고 정해도 늦지 않아요.'],
  5: ['닷새째 비어 있어요', '계획은 그대로예요. 오늘 이어서 하면 돼요.'],
  7: ['일주일이 지났어요', '처음부터가 아니라 이어서예요. 가볍게 한 세션만.'],
  10: ['열흘째예요', '루틴은 그대로 기다려요. 오늘 10분만.'],
  14: ['2주가 지났어요', '오늘이 마지막 알림이에요. 돌아오면 그 자리부터 다시.'],
};

const HOT: Record<number, [string, string, ((day: string) => string)?]> = {
  3: ['회원님, 사흘째입니다', '운동하기로 한 시간입니다. 오늘은 나오십니까?', (d) => `오늘은 ${d} 날입니다. 나오십니까?`],
  4: ['회원님, 나흘째입니다', '핑계는 접수하지 않습니다. 첫 종목만 하고 가십시오.'],
  5: ['닷새째 결석입니다', '기구는 그대로인데 회원님만 안 보입니다.'],
  7: ['일주일 무단결석', '목표 몸은 회원님이 정했습니다. 저는 기다리는 중입니다.'],
  10: ['열흘째. 슬슬 화가 납니다', '10분도 없다면 시간이 아니라 마음의 문제입니다.'],
  14: ['2주째. 마지막 호출입니다', '더는 부르지 않겠습니다. 돌아오면 말없이 다시 시작합니다.'],
};

/** 밀리터리프렌즈 한마디 — 날짜 단계마다 하나, 한 줄에 들어가게 */
const LINES: Record<number, string> = {
  3: '완벽한 날은 오지 않는다.',
  4: '오늘 한 세트가 내일의 기준.',
  5: '기록은 거짓말을 하지 않는다.',
  7: '쉬운 길은 없다. 가 본 길뿐.',
  10: '의욕은 시작하면 따라온다.',
  14: '다시 서는 자리가 시작이다.',
};

/** 세기에 맞는 알림 6개(끔이면 빈 배열). dayName 을 주면 첫 알림에 오늘 할 운동 이름을 넣는다 */
export function nudgePlan(level: NudgeLevel, dayName?: string): Nudge[] {
  if (level === 'off') return [];
  const table = level === 'hot' ? HOT : MILD;
  return NUDGE_DAYS.map((days) => {
    const [title, text, withDay] = table[days];
    const line = dayName && withDay ? withDay(dayName) : text;
    return { days, title, body: `${line}\n“${LINES[days]}”` };
  });
}

/**
 * 잠금화면 줄 수 어림 — 띄어쓰기에서만 줄을 바꾼다고 보고(keep-all), 한글 1칸 · 영문 · 숫자 · 기호 반 칸.
 * width = 한 줄에 들어가는 한글 글자 수.
 */
export function lockScreenLines(text: string, width = 18): number {
  const w = (s: string) => [...s].reduce((a, c) => a + (/[가-힣ㄱ-ㅎ“”]/.test(c) ? 1 : 0.55), 0);
  let lines = 0;
  for (const para of text.split('\n')) {
    let cur = 0;
    lines += 1;
    for (const word of para.split(' ')) {
      const ww = w(word);
      if (cur === 0) cur = ww;
      else if (cur + 0.55 + ww <= width) cur += 0.55 + ww;
      else { lines += 1; cur = ww; }
    }
  }
  return lines;
}

/**
 * 마지막 운동 시각 → 알림이 울릴 시각들. 이미 지난 시각은 뺀다(now 기준 1분 뒤부터).
 * 시각은 기기 현지 시간의 hour 시 정각.
 */
export function nudgeTimes(lastWorkoutIso: string, hour: number, now: number = Date.now()): { days: number; at: Date }[] {
  const t = Date.parse(lastWorkoutIso);
  if (!Number.isFinite(t)) return [];
  const out: { days: number; at: Date }[] = [];
  for (const days of NUDGE_DAYS) {
    const d = new Date(t);
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    if (d.getTime() > now + 60_000) out.push({ days, at: d });
  }
  return out;
}

export function isNudgeLevel(v: unknown): v is NudgeLevel {
  return v === 'off' || v === 'mild' || v === 'hot';
}
export function isNudgeHour(v: unknown): v is NudgeHour {
  return (NUDGE_HOURS as readonly number[]).includes(v as number);
}
