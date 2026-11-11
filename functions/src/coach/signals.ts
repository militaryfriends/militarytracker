/**
 * 코치 신호 엔진 — 좋은 코치가 기록을 보고 내리는 판단을 규칙으로 옮긴 것.
 *
 * 순수 함수(입력 → 현황 · 신호 · 이번 답에서 꺼낼 것). Firestore 를 읽는 쪽은 context.ts.
 * 모델은 여기서 나온 사실만 본다 — 질문 종류와 닿는 현황 줄만(statusFor), 짚을 신호는 하나만(pickFocus).
 * 보여 주지 않은 것은 모델이 꺼낼 수 없다(판단은 코드가, 말은 AI 가).
 * 칼로리 숫자는 만들지 않는다 — 하루 목표는 앱 엔진 값 하나뿐이고(숫자는 한 곳에서만),
 * 정체가 길어지면 체크인 때 서버 엔진이 트랙을 다시 계산한다.
 * 기준값은 초안 — 평가셋(scripts/coach-eval)으로 다듬는다.
 */

export type Phase = 'cut' | 'gain' | 'keep';

export interface SigLog {
  date: string; // YYYY-MM-DD (로컬)
  createdAt: string;
  totalSets: number;
  exercises: { id: string; best?: { w: number; r: number } }[];
}

export interface SigWeight {
  date: string;
  kg: number;
  createdAt?: string;
}

export interface SigProject {
  startedAt: string;
  months: number;
  phases: { phase: Phase; from: number; to: number }[];
  /** 달마다 예상 체중 — track[i] = (i + trackOffset) 개월째 */
  track: { weightKg: number }[];
  trackOffset: number;
  startWeightKg: number;
}

export interface SignalInput {
  now: number;
  /** 주당 목표 운동 일수 (플랜 일수 → 프로필 days → 3) */
  targetDays: number;
  /** 프로젝트가 없을 때의 방향 — profile.strategy / goal 에서 */
  fallbackPhase: Phase;
  logs: SigLog[];
  weights: SigWeight[];
  project: SigProject | null;
  lastCheckinAt: string | null;
  /** 종목 id → 이름 (앱이 보낸다, 글자만) */
  exNames: Record<string, string>;
}

export type SignalKey =
  | 'fast_loss' | 'off_track' | 'missed' | 'plateau' | 'fast_gain' | 'checkin_due' | 'pr' | 'streak' | 'no_weight' | 'journey';

export interface Signal {
  key: SignalKey;
  /** 클수록 먼저 */
  priority: number;
  /** 판정 한 줄 (숫자 포함 — AI 는 이 숫자만 인용) */
  text: string;
  /** 이 신호가 답의 중심일 때 코치가 할 일 */
  action: string;
  /**
   * 완성된 한 문장 — 문제 신호는 답 끝에 서버가 붙이는 말(mention), 성과 신호는 응원 한 줄(cheer).
   * 모델에게 "끝에 한 문장으로만" 을 시키면 원인 분석 · 추가 지시가 따라붙어서, 문장을 코드가 쓴다.
   */
  say: string;
}

/** 현황 줄 — 묶음(g)으로 질문 종류에 맞는 것만 모델에 준다 */
export type StatusGroup = 'phase' | 'week' | 'lifts' | 'habit' | 'weight' | 'plan' | 'project';
export interface StatusLine {
  g: StatusGroup;
  t: string;
}

export interface SignalResult {
  phase: Phase;
  status: StatusLine[];
  signals: Signal[];
  /** 오늘 운동 기록이 있다 */
  todayDone: boolean;
}

const DAY = 86_400_000;
const KST = 9 * 3_600_000;
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

const r1 = (x: number) => Math.round(x * 10) / 10;
const sgn = (x: number) => (r1(x) > 0 ? '+' : r1(x) < 0 ? '−' : '±') + Math.abs(r1(x));
/** 로컬(한국) 날짜 문자열 */
export const kstDate = (t: number) => new Date(t + KST).toISOString().slice(0, 10);
const dayNum = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / DAY);
const tOf = (w: SigWeight) => {
  const t = w.createdAt ? Date.parse(w.createdAt) : Date.parse(`${w.date}T12:00:00+09:00`);
  return Number.isFinite(t) ? t : NaN;
};
const agoKo = (d: number) => (d <= 0 ? '오늘' : d === 1 ? '어제' : `${d}일 전`);

/** 최소제곱 기울기(kg/일) */
function slope(pts: { t: number; kg: number }[]): number {
  const n = pts.length;
  const mt = pts.reduce((s, p) => s + p.t, 0) / n;
  const mk = pts.reduce((s, p) => s + p.kg, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.t - mt) * (p.kg - mk);
    den += (p.t - mt) ** 2;
  }
  return den > 0 ? (num / den) * DAY : 0;
}

/** 프로젝트 몇 개월째(소수) */
const monthsSince = (startedAt: string, now: number) => Math.max(0, (now - Date.parse(startedAt)) / DAY / 30.44);

/** m 개월째의 예상 체중 — 달 사이는 직선으로 */
function expectedAt(p: SigProject, m: number): number | null {
  if (!p.track.length) return null;
  const mm = Math.max(0, Math.min(p.months, m));
  const at = (month: number) => {
    if (month <= 0) return p.startWeightKg;
    const i = Math.max(0, Math.min(p.track.length - 1, month - p.trackOffset));
    return p.track[i].weightKg;
  };
  const lo = Math.floor(mm);
  return at(lo) + (at(lo + 1) - at(lo)) * (mm - lo);
}

/** 지금 시점의 예상 체중 */
export const expectedWeightNow = (p: SigProject, now: number) => expectedAt(p, monthsSince(p.startedAt, now));

export function phaseNow(p: SigProject | null, now: number, fallback: Phase): Phase {
  if (!p) return fallback;
  const month = Math.floor(monthsSince(p.startedAt, now)) + 1;
  const span = p.phases.find((s) => month >= s.from && month <= s.to) ?? p.phases[p.phases.length - 1];
  return span?.phase ?? fallback;
}

const PHASE_KO: Record<Phase, string> = { cut: '감량', gain: '증량', keep: '유지' };

export function computeSignals(i: SignalInput): SignalResult {
  const today = kstDate(i.now);
  const todayN = dayNum(today);
  const phase = phaseNow(i.project, i.now, i.fallbackPhase);
  const status: StatusLine[] = [{ g: 'phase', t: `지금 단계: ${PHASE_KO[phase]}` }];
  const signals: Signal[] = [];
  const target = Math.max(1, Math.min(7, Math.round(i.targetDays) || 3));

  // ── 운동 ──
  const dates = [...new Set(i.logs.map((l) => l.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
  const weekday = (new Date(todayN * DAY).getUTCDay() + 6) % 7; // 월 0 … 일 6
  const monday = todayN - weekday;
  const inWeek = (w: number) => dates.filter((d) => dayNum(d) >= monday - 7 * w && dayNum(d) < monday - 7 * w + 7).length;
  const thisWeek = inWeek(0);
  const last = dates.length ? dates[dates.length - 1] : null;
  const sinceLast = last ? todayN - dayNum(last) : null;
  // 숫자를 늘어놓으면 모델이 바꿔 읽는다("1/3회" → "채웠다", "2회 · 0회 · 5회" → 순서를 거꾸로) — 판정까지 문장으로 적는다
  const leftW = Math.max(0, target - thisWeek);
  // 주 중간의 "0회 · 3회 남음" 을 "끊겼다 · 줄었다" 로 읽지 않게, 남은 요일로 채울 수 있는지도 적는다
  const daysLeft = 7 - weekday; // 오늘 포함
  status.push({ g: 'week', t: leftW
    ? `이번 주 운동: ${thisWeek}회 함 — 목표 ${target}회까지 ${leftW}회 남음 (오늘 ${WEEKDAYS[weekday]}요일, ${leftW <= daysLeft ? '남은 요일로 채울 수 있음' : '이번 주에 다 채우기는 어려움'})`
    : `이번 주 운동: ${thisWeek}회 함 — 이번 주 목표 ${target}회를 채움 (오늘 ${WEEKDAYS[weekday]}요일)` });
  status.push({ g: 'week', t: sinceLast === null ? '운동 기록: 아직 없음' : `마지막 운동: ${agoKo(sinceLast)}${sinceLast <= 0 ? ' (오늘은 이미 운동함)' : ''}` });
  const metWeeks = [1, 2, 3].filter((w) => inWeek(w) >= target).length;
  const avg3 = (inWeek(1) + inWeek(2) + inWeek(3)) / 3;
  if (dates.length) {
    status.push({ g: 'habit', t: metWeeks === 3
      ? `지난 3주: 3주 모두 목표(주 ${target}회)를 채움`
      : `지난 3주: 목표(주 ${target}회)를 채운 주는 ${metWeeks}주 · 지난주는 ${inWeek(1)}회` });
  }

  if (sinceLast !== null && sinceLast >= 5) {
    signals.push({ key: 'missed', priority: 60, text: `마지막 운동이 ${sinceLast}일 전`,
      action: '비난하지 않는다. 오늘 할 가장 작은 운동(플랜 첫 종목 2~3세트, 10~20분)을 next 로 주고, 무엇이 막는지는 끝에 하나만 묻는다',
      say: `참고로 마지막 운동이 ${sinceLast}일 전입니다 — 오늘 10분만 해도 흐름이 이어집니다.` });
  } else if (sinceLast !== null && weekday >= 3 && thisWeek === 0) {
    signals.push({ key: 'missed', priority: 55, text: `이번 주 운동을 아직 한 번도 안 함(${WEEKDAYS[weekday]}요일)`,
      action: '비난하지 않는다. 남은 요일에 맞춘 현실적인 횟수 하나를 next 로',
      say: '참고로 이번 주는 아직 운동 기록이 없습니다.' });
  }

  // 연속 달성 주
  let streak = 0;
  for (let w = 1; w <= 8; w++) {
    if (inWeek(w) >= target) streak++;
    else break;
  }
  if (streak >= 2) {
    signals.push({ key: 'streak', priority: 25, text: `지난주까지 ${streak}주 연속 주 ${target}회 목표 달성`, action: '꾸준함을 짧게 인정',
      say: `지난주까지 ${streak}주 연속으로 주 ${target}회를 채우셨습니다.` });
  }

  // 기록 갱신 — 최근 7일 기록이 그 전 최고(추정 1RM)를 넘은 종목
  const e1 = (b: { w: number; r: number }) => b.w * (1 + b.r / 30);
  const recent = i.logs.filter((l) => todayN - dayNum(l.date) <= 6);
  const older = i.logs.filter((l) => todayN - dayNum(l.date) > 6);
  const prs: string[] = [];
  for (const l of recent) {
    for (const ex of l.exercises) {
      if (!ex.best || !(ex.best.w > 0) || !(ex.best.r > 0) || !i.exNames[ex.id]) continue;
      const prev = older.flatMap((o) => o.exercises.filter((x) => x.id === ex.id && x.best).map((x) => e1(x.best!)));
      if (!prev.length) continue;
      if (e1(ex.best) > Math.max(...prev) * 1.005 && !prs.some((p) => p.startsWith(i.exNames[ex.id]))) {
        prs.push(`${i.exNames[ex.id]} ${ex.best.w}kg × ${ex.best.r}회`);
      }
    }
  }
  if (prs.length) {
    signals.push({ key: 'pr', priority: 30, text: `이번 주 개인 기록 갱신: ${prs.slice(0, 2).join(', ')}`, action: '종목과 숫자를 그대로 짚어 인정',
      say: `이번 주 ${prs[0]}, 개인 기록 갱신입니다.` });
  }

  // 종목별 최근 기록 — "언제 올려요 · 몇 kg 해요" 에 답할 재료(앱이 보내는 최근 기록 줄에는 무게가 없다)
  const lifts: string[] = [];
  const seen = new Set<string>();
  for (const l of [...i.logs].sort((a, b) => b.date.localeCompare(a.date))) {
    if (todayN - dayNum(l.date) > 28) break;
    for (const ex of l.exercises) {
      const name = i.exNames[ex.id];
      if (!name || seen.has(ex.id) || !ex.best || !(ex.best.w > 0) || !(ex.best.r > 0)) continue;
      seen.add(ex.id);
      if (lifts.length < 6) lifts.push(`${name} ${ex.best.w}kg × ${ex.best.r}회`);
    }
  }
  if (lifts.length) status.push({ g: 'lifts', t: `종목별 최근 기록: ${lifts.join(' · ')}` });

  // 체크인까지 — 끝 문장(say)에서 "N일 뒤 체크인 때 다시 계산" 을 말하려고 먼저 구한다
  const projDays = i.project ? Math.floor((i.now - Date.parse(i.project.startedAt)) / DAY) : null;
  const lastC = i.lastCheckinAt ? Math.floor((i.now - Date.parse(i.lastCheckinAt)) / DAY) : null;
  const sinceBase = projDays === null ? null : lastC ?? projDays;
  const recalc = sinceBase === null
    ? '먹는 것을 일주일만 빠짐없이 기록해 보면 원인이 보입니다'
    : sinceBase >= 28 ? '지금 체크인하면 엔진이 계획을 다시 계산합니다' : `${28 - sinceBase}일 뒤 체크인 때 엔진이 계획을 다시 계산합니다`;

  // ── 체중 ──
  const ws = i.weights
    .map((w) => ({ t: tOf(w), kg: Number(w.kg) }))
    .filter((w) => Number.isFinite(w.t) && w.kg > 25 && w.kg < 300)
    .sort((a, b) => a.t - b.t);
  const latest = ws.length ? ws[ws.length - 1] : null;
  /** 이번 달 계획 속도(kg/주) — 프로젝트가 있을 때만 */
  const planWk = i.project ? expectedWeeklyGain(i.project, i.now) : null;
  /** 너무 빠른 감량 · 증량 — 이때는 '지금까지 온 거리' 를 성과로 치지 않는다 */
  let tooFast = false;
  if (!latest) {
    status.push({ g: 'weight', t: '체중 기록: 없음' });
  } else {
    const ago = Math.floor((i.now - latest.t) / DAY);
    status.push({ g: 'weight', t: `최근 체중: ${r1(latest.kg)}kg (${agoKo(ago)} 기록)` });
    if (ago >= 7) {
      signals.push({ key: 'no_weight', priority: 20, text: `체중 기록이 ${ago}일째 없음`,
        action: '추세를 말할 수 없다고 알리고, 내일 아침 공복 체중 기록을 next 로',
        say: `참고로 체중 기록이 ${ago}일째 없어서 추세가 최신이 아닙니다.` });
    }
    const win = ws.filter((w) => i.now - w.t <= 21 * DAY);
    const span = win.length ? (win[win.length - 1].t - win[0].t) / DAY : 0;
    if (win.length >= 3 && span >= 7) {
      const wk = slope(win) * 7;
      const days = Math.round(span);
      const pct = Math.abs(wk) / latest.kg * 100;
      const long = span >= 13;
      // 추세 판정을 코드가 붙인다 — 숫자만 주면 모델이 "느리다 · 잘 가고 있다" 를 지어낸다
      let verdict = '아직 판정하기엔 기록 기간이 짧음';
      if (long && phase === 'cut' && wk < -0.01 * latest.kg) {
        verdict = '너무 빠름';
        tooFast = true;
        signals.push({ key: 'fast_loss', priority: 90,
          text: `체중이 주 ${sgn(wk)}kg(체중의 ${r1(pct)}%)로 너무 빠르게 빠지는 중 — 근손실 위험, 먹는 양을 줄이지 말고 하루 목표 칼로리를 다 채워야 함`,
          action: '더 줄이려는 생각을 분명히 말린다. 하루 목표 칼로리를 다 채우는 것을 next 로',
          say: `그리고 지금 체중이 주 ${sgn(wk)}kg 으로 너무 빠르게 빠지고 있습니다 — 먹는 양은 더 줄이면 안 됩니다.` });
      } else if (long && phase === 'cut' && wk > -0.1) {
        verdict = '정체';
        signals.push({ key: 'plateau', priority: 55, text: `감량 단계인데 최근 ${days}일 체중이 제자리(주 ${sgn(wk)}kg) — 정체`,
          action: '가장 흔한 원인 하나(기록에 안 잡히는 음료 · 소스 · 간식)를 짚고, "7일 동안 전부 기록" 또는 "걸음 수 늘리기" 중 하나만 next 로. '
            + '하루 목표 칼로리는 그대로 — 체크인 때 엔진이 다시 계산한다고 알린다',
          say: `참고로 최근 ${days}일은 체중이 제자리입니다 — ${recalc}.` });
      } else if (long && phase === 'cut') {
        verdict = '적정 속도로 빠지는 중';
      }
      if (long && phase === 'gain') {
        const lim = Math.max(0.35, (planWk ?? 0.25) * 1.5);
        if (wk > lim) {
          verdict = '계획보다 빠름';
          tooFast = true;
          signals.push({ key: 'fast_gain', priority: 50,
            text: `증량 단계인데 체중이 주 ${sgn(wk)}kg 로 ${planWk !== null ? `엔진 계획(주 ${sgn(planWk)}kg)보다` : '권장보다'} 빠르게 느는 중 — 이 속도는 늦춰야 함(늘어난 만큼 체지방 비중이 커진다)`,
            action: '속도를 늦춰야 한다고 분명히 말한다. 하루 목표 칼로리를 넘기지 않게, 간식 · 야식 중 하나를 줄이는 것을 next 로',
            say: `참고로 체중이 주 ${sgn(wk)}kg 으로 ${planWk !== null ? '엔진 계획보다' : '권장보다'} 빠르게 늘고 있습니다 — 하루 목표 칼로리를 넘기고 있지 않은지 봐야 합니다.` });
        } else {
          verdict = wk < 0.03 ? '거의 늘지 않는 중' : '적정 속도로 느는 중';
        }
      }
      if (phase === 'keep') verdict = Math.abs(wk) <= 0.25 ? '유지되는 중' : wk > 0 ? '늘고 있음' : '빠지고 있음';
      status.push({ g: 'weight', t: `최근 ${days}일 체중 추세: 주 ${sgn(wk)}kg — ${verdict}` });
    }
  }

  // ── 프로젝트 ──
  if (i.project) {
    const p = i.project;
    const days = projDays ?? 0;
    const m = monthsSince(p.startedAt, i.now);
    const left = Math.max(0, Math.round(p.months - m));
    status.push({ g: 'project', t: `프로젝트: ${days}일째 · 전체 ${p.months}개월 중 ${Math.min(p.months, Math.floor(m) + 1)}개월째 · 끝까지 약 ${left}개월` });
    const expNow = expectedAt(p, m);
    const expNext = expectedAt(p, m + 1);
    const expEnd = expectedAt(p, p.months);
    if (expNow !== null && expNext !== null && expEnd !== null) {
      status.push({ g: 'plan', t: `엔진 예상 체중: 지금 ${r1(expNow)}kg · 한 달 뒤 ${r1(expNext)}kg · 프로젝트 끝 ${r1(expEnd)}kg` });
      if (planWk !== null) status.push({ g: 'plan', t: `엔진 계획 속도(이번 달): 주 ${sgn(planWk)}kg` });
      if (latest) {
        const diff = latest.kg - expNow;
        const behind = (phase === 'cut' && diff > 2) || (phase === 'gain' && diff < -2);
        const far = Math.abs(diff) > 2;
        status.push({ g: 'plan', t: Math.abs(diff) < 0.05
          ? '엔진 예상 대비: 실제 체중이 예상과 같음'
          : `엔진 예상 대비: 실제 체중이 ${Math.abs(r1(diff))}kg ${diff > 0 ? '무거움' : '가벼움'} — ${
            behind ? '계획보다 뒤처짐' : far || tooFast ? (diff > 0 ? '계획보다 많이 늘어 있음' : '계획보다 많이 빠져 있음')
              : signals.some((x) => x.key === 'plateau') ? '아직 계획 범위 안이지만 최근은 정체' : '계획 범위 안'}` });
        if (behind) {
          // 원인 후보도 코드가 하나만 고른다 — 모델에게 맡기면 두세 개를 늘어놓는다
          const cause = dates.length && avg3 < target - 0.5
            ? `지난 3주 운동이 목표(주 ${target}회)에 못 미침`
            : '기록에 안 잡히는 음료 · 소스 · 간식';
          signals.push({ key: 'off_track', priority: 70,
            text: `체중이 엔진 예상보다 ${Math.abs(r1(diff))}kg ${diff > 0 ? '무거움 — 예상보다 덜 빠짐' : '가벼움 — 예상보다 덜 늘어남'}. 원인 후보: ${cause}`,
            action: '원인 후보 하나만 짚고(다른 원인은 꺼내지 않는다) 그것을 고치는 이번 주 행동 하나를 next 로. 체크인하면 계획이 다시 계산된다고 한 문장',
            say: `참고로 지금 체중은 엔진 예상보다 ${Math.abs(r1(diff))}kg ${diff > 0 ? '무겁습니다' : '가볍습니다'} — 체크인하면 계획이 다시 계산됩니다.` });
        }
        const d = latest.kg - p.startWeightKg;
        status.push({ g: 'project', t: `프로젝트 시작 체중 ${r1(p.startWeightKg)}kg → 지금 ${r1(latest.kg)}kg (${sgn(d)}kg)` });
        // 방향이 맞고 너무 빠르지 않을 때만 성과로 — "예상보다 빨리 찐 2kg" 을 칭찬하지 않게
        const rightWay = (phase === 'cut' && d <= -1) || (phase === 'gain' && d >= 1);
        if (rightWay && !tooFast) {
          signals.push({ key: 'journey', priority: 15, text: `프로젝트 시작 뒤 체중 ${sgn(d)}kg (${r1(p.startWeightKg)}kg → ${r1(latest.kg)}kg)`,
            action: '지금까지 온 거리를 짧게 인정',
            say: `프로젝트 시작 뒤 ${Math.abs(r1(d))}kg ${d < 0 ? '줄였습니다' : '늘렸습니다'}.` });
        }
      }
    }
    // 체크인 — "N일 전" 만 주면 모델이 "N일 뒤" 로 읽는다. 다음 체크인까지 남은 날을 직접 적는다
    const since = sinceBase ?? days;
    const due = since >= 28;
    status.push({ g: 'project', t: due
      ? `4주 체크인: 지금 할 때가 됨(${lastC === null ? '아직 한 번도 안 함' : `마지막 체크인 ${lastC}일 전`})`
      : `4주 체크인: 다음 체크인까지 ${28 - since}일 남음` });
    if (due) {
      signals.push({ key: 'checkin_due', priority: 40, text: '4주 체크인을 할 때가 됨',
        action: '홈의 프로젝트 카드에서 체크인하는 것을 next 로 — 체크인하면 예상 트랙과 칼로리가 다시 계산된다',
        say: '참고로 4주 체크인을 할 때가 됐습니다 — 홈의 프로젝트 카드에서 할 수 있습니다.' });
    }
  }

  signals.sort((a, b) => b.priority - a.priority);
  return { phase, status, signals, todayDone: sinceLast !== null && sinceLast <= 0 };
}

/** 이번 달 → 다음 달 예상 변화를 주 단위로 */
function expectedWeeklyGain(p: SigProject, now: number): number | null {
  const m = monthsSince(p.startedAt, now);
  const a = expectedAt(p, Math.floor(m));
  const b = expectedAt(p, Math.floor(m) + 1);
  return a !== null && b !== null ? (b - a) / 4.35 : null;
}

// ── 이번 답에 무엇을 보여 줄지 ──

/** 모델 글이 이미 그 문제를 말했는지 보는 낱말 — 말했으면 끝 문장을 또 붙이지 않는다(answer.finishCoach) */
export const SAID_ALREADY: Partial<Record<SignalKey, RegExp>> = {
  fast_loss: /(체중|살|몸무게).{0,16}(빠르|빨리)|(빠르게|빨리)\s?(빠|내려|줄)|너무\s?빠/,
  fast_gain: /(체중|살|몸무게).{0,16}(빠르|빨리)|(빠르게|빨리)\s?(늘|찌|오르)/,
  off_track: /예상보다|계획보다/,
  plateau: /제자리|정체/,
  missed: /일 전|일째|쉬었|운동 기록이 없/,
  no_weight: /체중 기록/,
  checkin_due: /체크인/,
};

const PROBLEMS: SignalKey[] = ['fast_loss', 'off_track', 'missed', 'plateau', 'fast_gain', 'checkin_due', 'no_weight'];
const WINS: SignalKey[] = ['pr', 'streak', 'journey'];
/** 체중 쪽 문제 — 이것이 답의 중심이면 운동 현황은 주지 않는다(원인을 두세 개 늘어놓게 된다) */
const WEIGHT_FOCUS: SignalKey[] = ['fast_loss', 'off_track', 'plateau', 'fast_gain', 'checkin_due', 'no_weight'];

/**
 * 질문 종류별로 모델에 주는 현황 묶음. 보여 준 것은 답에 끌려 나온다 —
 * 식단 질문에 체중 추세를 주면 "지금 주 +0.2kg 이니…" 가 붙고, 운동 질문에 지난 3주를 주면 묻지 않은 출석 이야기를 한다.
 * 체중 · 출석 문제는 focus 로만 전한다.
 */
const STATUS_FOR: Record<string, StatusGroup[]> = {
  progress: ['phase', 'week', 'habit', 'weight', 'plan', 'project'],
  diet: ['phase'],
  workout: ['phase', 'week', 'lifts'],
  // 의욕 질문에 지난 3주 출석을 주면 "처음 3주가 중요" 같은 말을 지어낸다 — 해낸 일은 <win> 으로만
  motivation: ['phase', 'week'],
  general: [],
  app: [],
};

export function statusFor(intent: string, r: SignalResult | null, focus: Focus['focus'] = null): string[] {
  if (!r) return [];
  let g = STATUS_FOR[intent] ?? [];
  if (focus?.mode === 'main') {
    g = WEIGHT_FOCUS.includes(focus.key)
      ? [...new Set<StatusGroup>([...g.filter((x) => x !== 'week' && x !== 'habit'), 'weight', 'plan'])]
      : g;
  }
  return r.status.filter((s) => g.includes(s.g)).map((s) => s.t);
}

/**
 * 이번 답에서 코치가 꺼낼 신호를 코드가 고른다 — "어떤 신호를 언제 말할지" 를 모델 판단에 맡기지 않는다.
 *  focus = 짚을 문제 하나. mode 'main' 은 답의 중심(모델이 쓴다), 'mention' 은 서버가 답 끝에 한 문장(say)을 붙인다.
 *  win   = 인정해 줄 성과 하나. where 'text' 는 모델이 답에 녹이고(진행 · 의욕 질문), 'cheer' 는 서버가 응원 줄로 붙인다(운동 질문).
 * 답의 중심이 되는 것은 진행 질문, 그리고 회원이 그 문제를 직접 말했을 때("정체예요", "너무 빨리 빠져요")뿐이다.
 * 빠른 감량은 안전 문제라 식단 · 운동 · 의욕 어디에나 끝 문장으로 붙는다. 그 밖에는 질문 종류와 닿는 것만.
 * 같은 신호 · 성과를 답마다 되풀이하지 않게, 최근에 말한 것(said)은 진행 질문이 아니면 건너뛴다.
 */
const FOCUS_MAIN: Record<string, SignalKey[]> = {
  progress: ['fast_loss', 'off_track', 'missed', 'plateau', 'fast_gain', 'checkin_due'],
  motivation: ['missed'],
};
// 식단 · 운동 질문에서는 질문에 답하는 것이 먼저다 — 문제는 끝 문장으로만(답의 중심으로 두면 "야식 먹어도 돼요?" 에 속도 이야기만 한다)
const FOCUS_MENTION: Record<string, SignalKey[]> = {
  progress: ['no_weight'],
  diet: ['fast_loss', 'fast_gain', 'off_track', 'plateau'],
  workout: ['fast_loss', 'missed'],
  motivation: ['fast_loss'],
};
/** 회원이 직접 꺼낸 문제 → 그 신호가 있으면 답의 중심 */
const ASKED: [RegExp, SignalKey[]][] = [
  [/빨리\s?빠|너무\s?빠지|급하게\s?빠|쭉쭉\s?빠/, ['fast_loss']],
  [/빨리\s?찌|너무\s?찌|배만\s?나|살만\s?찌|너무\s?늘/, ['fast_gain']],
  [/정체|제자리|그대로|안\s?빠|안\s?줄|안\s?바뀌|안\s?변|변화가?\s?없|효과가?\s?없|안\s?늘/, ['plateau', 'off_track', 'fast_gain', 'fast_loss']],
  [/체크인/, ['checkin_due']],
];
const WIN_WHERE: Record<string, 'text' | 'cheer'> = { progress: 'text', motivation: 'text', workout: 'cheer' };
/** 같은 신호를 다시 꺼내기까지(시간) — 진행 질문은 예외 */
export const FOCUS_COOLDOWN_H: Partial<Record<SignalKey, number>> = { fast_loss: 20 };
const COOLDOWN_DEFAULT_H = 72;

export interface Focus {
  focus: (Signal & { mode: 'main' | 'mention' }) | null;
  win: (Signal & { where: 'text' | 'cheer' }) | null;
}

export function pickFocus(
  intent: string, r: SignalResult | null, said: Partial<Record<SignalKey, string>> = {}, now = Date.now(), question = '',
): Focus {
  if (!r || intent === 'app' || intent === 'general') return { focus: null, win: null };
  const cooled = (k: SignalKey) => {
    if (intent === 'progress') return false;
    const t = said[k] ? Date.parse(said[k]!) : NaN;
    return Number.isFinite(t) && now - t < (FOCUS_COOLDOWN_H[k] ?? COOLDOWN_DEFAULT_H) * 3_600_000;
  };
  const problems = r.signals.filter((x) => PROBLEMS.includes(x.key));
  const q = question.replace(/\s+/g, ' ');
  let focus: Focus['focus'] = null;
  for (const [re, keys] of ASKED) {
    if (!re.test(q)) continue;
    const hit = keys.map((k) => problems.find((x) => x.key === k)).find(Boolean);
    if (hit) {
      // 의욕 질문이면 사실부터 들이밀지 않는다 — 공감과 작은 행동이 먼저고, 그 문제는 서버가 끝 문장으로 붙인다
      focus = { ...hit, mode: intent === 'motivation' ? 'mention' : 'main' };
      break;
    }
  }
  if (!focus) {
    const main = FOCUS_MAIN[intent] ?? [];
    const mention = FOCUS_MENTION[intent] ?? [];
    const s = problems.find((x) => (main.includes(x.key) || mention.includes(x.key)) && !cooled(x.key)) ?? null;
    focus = s ? { ...s, mode: main.includes(s.key) ? 'main' : 'mention' } : null;
  }
  const where = WIN_WHERE[intent];
  const w = where ? r.signals.find((x) => WINS.includes(x.key) && !cooled(x.key)) ?? null : null;
  return { focus, win: w && where ? { ...w, where } : null };
}

/** 검증기 · 로그용 — 현황과 신호 전체를 글로 */
export function signalsText(r: SignalResult): string {
  return [
    ...r.status.map((s) => `- ${s.t}`),
    ...r.signals.map((s) => `* ${s.text} / ${s.say}`),
  ].join('\n');
}
