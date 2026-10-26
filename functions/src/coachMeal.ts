/**
 * 코치 식단 카드 · WARNING — aiCoach 의 구조화 응답.
 *
 * AI 는 음식 구성과 양만 고른다. kcal · 단백질은 아래 식품표로 서버가 다시 계산한다
 * (표에 없는 음식만 AI 값을 쓰고 approx 표시). 하루 목표는 앱 엔진 값을 받아 쓴다 — AI 가 정하지 않는다.
 * 값은 1회 제공량 기준 근사치(국가표준식품성분표 · USDA 범위의 대표값).
 */

export interface MealItem {
  /** 음식 이름 */
  n: string;
  /** 양 */
  q: number;
  /** 단위 g · ml · 개 · 장 · 스쿱 · 큰술 */
  u: string;
  kcal: number;
  p: number;
  /** 식품표에 없어 AI 값을 쓴 항목 */
  approx?: boolean;
}

export interface CoachMeal {
  /** 끼니 이름 — 아침 · 점심 · 저녁 · 간식 · 운동 전 · 운동 후 */
  t: string;
  /** 하루 목표 대비 비율(%) — 끼니 목표 = 하루 목표 × pct */
  pct: number;
  items: MealItem[];
  kcal: number;
  p: number;
  /** 하루 목표(앱 엔진 값) — 카드에 "목표의 N%" 근거로 */
  dayKcal?: number;
}

interface Food {
  /** 이름에 이 말이 들어가면 이 음식 (앞에서부터 먼저 맞는 것) */
  keys: string[];
  /** 기준 단위와 그 단위 1 당 kcal · 단백질 */
  unit: 'g' | 'ml' | '개' | '장' | '스쿱' | '큰술';
  kcal: number;
  p: number;
  /** g 으로 받았을 때 1 단위의 무게(개 · 장 단위 음식) */
  grams?: number;
}

// g · ml 단위는 1g(1ml) 당 값
const FOODS: Food[] = [
  { keys: ['현미밥'], unit: 'g', kcal: 1.52, p: 0.03 },
  { keys: ['잡곡밥'], unit: 'g', kcal: 1.5, p: 0.035 },
  { keys: ['흰쌀밥', '백미밥', '쌀밥', '공기밥', '밥'], unit: 'g', kcal: 1.45, p: 0.025 },
  { keys: ['닭가슴살(생)', '생닭가슴살'], unit: 'g', kcal: 1.06, p: 0.23 },
  { keys: ['닭가슴살'], unit: 'g', kcal: 1.06, p: 0.23 },
  { keys: ['닭다리살'], unit: 'g', kcal: 1.6, p: 0.19 },
  { keys: ['계란흰자', '달걀흰자', '흰자'], unit: '개', kcal: 17, p: 3.6, grams: 33 },
  { keys: ['계란', '달걀', '삶은 계란', '삶은계란'], unit: '개', kcal: 72, p: 6.3, grams: 50 },
  { keys: ['바나나'], unit: '개', kcal: 105, p: 1.3, grams: 118 },
  { keys: ['사과'], unit: '개', kcal: 95, p: 0.5, grams: 180 },
  { keys: ['고구마'], unit: 'g', kcal: 1.3, p: 0.014 },
  { keys: ['감자'], unit: 'g', kcal: 0.77, p: 0.02 },
  { keys: ['오트밀', '귀리'], unit: 'g', kcal: 3.8, p: 0.13 },
  { keys: ['그릭요거트', '그릭 요거트'], unit: 'g', kcal: 0.97, p: 0.09 },
  { keys: ['우유'], unit: 'ml', kcal: 0.65, p: 0.032 },
  { keys: ['두유'], unit: 'ml', kcal: 0.54, p: 0.033 },
  { keys: ['두부'], unit: 'g', kcal: 0.97, p: 0.096 },
  { keys: ['연어'], unit: 'g', kcal: 2.08, p: 0.2 },
  { keys: ['참치캔', '참치'], unit: 'g', kcal: 1.16, p: 0.26 },
  { keys: ['소고기', '우둔', '홍두깨'], unit: 'g', kcal: 1.3, p: 0.22 },
  { keys: ['돼지 안심', '돼지안심', '안심'], unit: 'g', kcal: 1.2, p: 0.21 },
  { keys: ['프로틴', '단백질 쉐이크', '쉐이크', '웨이'], unit: '스쿱', kcal: 120, p: 24, grams: 30 },
  { keys: ['땅콩버터'], unit: '큰술', kcal: 94, p: 4, grams: 16 },
  { keys: ['아몬드', '견과'], unit: 'g', kcal: 5.79, p: 0.21 },
  { keys: ['통밀빵', '호밀빵'], unit: '장', kcal: 90, p: 4, grams: 35 },
  { keys: ['식빵'], unit: '장', kcal: 95, p: 3, grams: 35 },
  { keys: ['브로콜리'], unit: 'g', kcal: 0.34, p: 0.028 },
  { keys: ['샐러드', '채소', '양상추'], unit: 'g', kcal: 0.2, p: 0.015 },
  { keys: ['김치'], unit: 'g', kcal: 0.18, p: 0.015 },
];

const UNITS = ['g', 'ml', '개', '장', '스쿱', '큰술'] as const;
const MEAL_NAMES = ['아침', '점심', '저녁', '간식', '운동 전', '운동 후'];

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

function lookup(name: string): Food | undefined {
  const n = name.replace(/\s+/g, '');
  return FOODS.find((f) => f.keys.some((k) => n.includes(k.replace(/\s+/g, ''))));
}

/** 표의 단위로 바꾼 양. 바꿀 수 없으면 NaN */
function toFoodUnits(f: Food, q: number, u: string): number {
  if (u === f.unit) return q;
  // g ↔ 개 · 장 · 스쿱 · 큰술
  if (f.grams && (u === 'g' || u === 'ml')) return q / f.grams;
  if ((f.unit === 'g' || f.unit === 'ml') && (u === 'g' || u === 'ml')) return q;
  return NaN;
}

export function normalizeItem(raw: unknown): MealItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const n = String(r.n ?? '').trim().slice(0, 24);
  const q = num(r.q);
  const u0 = String(r.u ?? '').trim();
  const u = (UNITS as readonly string[]).includes(u0) ? u0 : 'g';
  if (!n || !Number.isFinite(q) || q <= 0) return null;
  const qty = clamp(Math.round(q * 10) / 10, 0.5, 2000);
  const f = lookup(n);
  if (f) {
    const k = toFoodUnits(f, qty, u);
    if (Number.isFinite(k)) {
      return { n, q: qty, u, kcal: Math.round(k * f.kcal), p: Math.round(k * f.p) };
    }
  }
  const kcal = num(r.kcal);
  const p = num(r.p);
  if (!Number.isFinite(kcal)) return null;
  return {
    n, q: qty, u,
    kcal: Math.round(clamp(kcal, 0, 1500)),
    p: Math.round(clamp(Number.isFinite(p) ? p : 0, 0, 150)),
    approx: true,
  };
}

export function normalizeMeal(raw: unknown, dayKcal?: number): CoachMeal | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const items = (Array.isArray(r.items) ? r.items : [])
    .slice(0, 8)
    .map(normalizeItem)
    .filter((x): x is MealItem => !!x);
  if (!items.length) return null;
  const t0 = String(r.t ?? '').trim();
  const t = MEAL_NAMES.includes(t0) ? t0 : '식단';
  const kcal = items.reduce((a, b) => a + b.kcal, 0);
  const p = items.reduce((a, b) => a + b.p, 0);
  // 비율은 실제 합계 / 하루 목표로 다시 낸다 — AI 가 적은 % 는 쓰지 않는다
  const day = dayKcal && dayKcal > 800 ? Math.round(dayKcal) : undefined;
  const pct = day ? clamp(Math.round((kcal / day) * 100), 1, 100) : clamp(Math.round(num(r.pct) || 0), 0, 100);
  return { t, pct, items, kcal, p, ...(day ? { dayKcal: day } : {}) };
}

export function normalizeWarning(raw: unknown): string | null {
  const w = String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 160);
  return w.length >= 6 ? w : null;
}

/** 코치 시스템 프롬프트의 출력 규칙 */
export const COACH_OUTPUT_RULES = [
  '출력은 반드시 JSON 객체 하나: {"text":"답변","meal":null,"warning":null}. 마크다운 · 백틱 금지.',
  'text: 3~5문장 이내 답변. 목록 · 머리말 · 인사말 없이 바로 답부터.',
  'meal: 무엇을 먹을지 묻거나 식단을 짜 달라고 할 때만 끼니 하나를 채운다. 그 밖에는 null.',
  '  형식 {"t":"아침|점심|저녁|간식|운동 전|운동 후","items":[{"n":"현미밥","q":200,"u":"g","kcal":300,"p":6}]}',
  '  u 는 g · ml · 개 · 장 · 스쿱 · 큰술 중 하나. 한국에서 구하기 쉬운 음식 2~6개.',
  '  끼니 양은 <data> 의 목표 칼로리를 끼니 수로 나눈 만큼(아침 · 점심 · 저녁 약 25~30%, 간식 약 10~15%).',
  '  text 에는 하루 목표 칼로리(<data> 값)와 이 끼니를 제안한다는 한 문장만 쓰고, 음식 목록을 text 에 반복하지 않는다.',
  'warning: 목표에 방해되는 음식 · 습관이 질문이나 기록에 보이면 한 문장으로 직설적으로 말한다',
  '  (예: "회원님, 불편하시겠지만 탄산음료는 무조건 피하세요. 몸 만드셔야죠."). 비난 · 모욕 · 의학적 판단 금지. 없으면 null.',
].join('\n');
