/**
 * 코치 신호 엔진 — 좋은 코치가 기록을 보고 내리는 판단을 규칙으로 옮긴 것.
 *
 * 순수 함수(입력 → 현황 · 신호). Firestore 를 읽는 쪽은 context.ts.
 * AI 는 여기서 나온 판정과 숫자를 바꾸지 못한다(프롬프트 규칙 + validate.ts).
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
  | 'fast_loss' | 'off_track' | 'missed' | 'plateau' | 'fast_gain' | 'checkin_due' | 'pr' | 'streak' | 'no_weight';

export interface Signal {
  key: SignalKey;
  /** 클수록 먼저 — 코치는 질문과 관계없으면 가장 높은 것 하나만 꺼낸다 */
  priority: number;
  /** 판정 한 줄 (숫자 포함 — AI 는 이 숫자만 인용) */
  text: string;
  /** 코치가 할 일 */
  action: string;
}

export interface SignalResult {
  phase: Phase;
  /** 현황 줄 — 늘 붙는다 */
  status: string[];
  signals: Signal[];
}

const DAY = 86_400_000;
const KST = 9 * 3_600_000;

const r1 = (x: number) => Math.round(x * 10) / 10;
const sgn = (x: number) => (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(r1(x));
/** 로컬(한국) 날짜 문자열 */
export const kstDate = (t: number) => new Date(t + KST).toISOString().slice(0, 10);
const dayNum = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / DAY);
const tOf = (w: SigWeight) => {
  const t = w.createdAt ? Date.parse(w.createdAt) : Date.parse(`${w.date}T12:00:00+09:00`);
  return Number.isFinite(t) ? t : NaN;
};

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

/** 지금 시점의 예상 체중 — 달 사이는 직선으로 */
export function expectedWeightNow(p: SigProject, now: number): number | null {
  if (!p.track.length) return null;
  const m = Math.min(p.months, monthsSince(p.startedAt, now));
  const at = (month: number) => {
    if (month <= 0) return p.startWeightKg;
    const i = Math.max(0, Math.min(p.track.length - 1, month - p.trackOffset));
    return p.track[i].weightKg;
  };
  const lo = Math.floor(m);
  const f = m - lo;
  return at(lo) + (at(lo + 1) - at(lo)) * f;
}

export function phaseNow(p: SigProject | null, now: number, fallback: Phase): Phase {
  if (!p) return fallback;
  const month = Math.floor(monthsSince(p.startedAt, now)) + 1;
  const span = p.phases.find((s) => month >= s.from && month <= s.to) ?? p.phases[p.phases.length - 1];
  return span?.phase ?? fallback;
}

const PHASE_KO: Record<Phase, string> = { cut: '감량', gain: '증량(린매스업)', keep: '유지' };

export function computeSignals(i: SignalInput): SignalResult {
  const today = kstDate(i.now);
  const todayN = dayNum(today);
  const phase = phaseNow(i.project, i.now, i.fallbackPhase);
  const status: string[] = [`지금 단계: ${PHASE_KO[phase]}`];
  const signals: Signal[] = [];
  const target = Math.max(1, Math.min(7, Math.round(i.targetDays) || 3));

  // ── 운동 ──
  const dates = [...new Set(i.logs.map((l) => l.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
  const weekday = (new Date((todayN) * DAY).getUTCDay() + 6) % 7; // 월 0 … 일 6
  const monday = todayN - weekday;
  const thisWeek = dates.filter((d) => dayNum(d) >= monday).length;
  const last = dates.length ? dates[dates.length - 1] : null;
  const sinceLast = last ? todayN - dayNum(last) : null;
  status.push(`이번 주 운동 ${thisWeek}/${target}회(오늘 ${['월', '화', '수', '목', '금', '토', '일'][weekday]}요일)`
    + (sinceLast === null ? ', 운동 기록 없음' : sinceLast === 0 ? ', 오늘 운동함' : `, 마지막 운동 ${sinceLast}일 전`));

  if (sinceLast !== null && sinceLast >= 5) {
    signals.push({ key: 'missed', priority: 60, text: `마지막 운동이 ${sinceLast}일 전`,
      action: '무엇이 막는지 한 가지 묻고, 20분짜리 최소 운동을 제안' });
  } else if (sinceLast !== null && weekday >= 3 && thisWeek === 0) {
    signals.push({ key: 'missed', priority: 55, text: `이번 주 운동 0/${target}회(${['월', '화', '수', '목', '금', '토', '일'][weekday]}요일)`,
      action: '남은 요일에 맞춘 현실적인 횟수 하나를 제안' });
  }

  // 연속 달성 주
  let streak = 0;
  for (let w = 1; w <= 8; w++) {
    const from = monday - 7 * w;
    const n = dates.filter((d) => dayNum(d) >= from && dayNum(d) < from + 7).length;
    if (n >= target) streak++;
    else break;
  }
  if (streak >= 2) {
    signals.push({ key: 'streak', priority: 25, text: `${streak}주 연속 주 ${target}회 목표 달성`,
      action: '꾸준함을 짧게 인정' });
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
    signals.push({ key: 'pr', priority: 30, text: `이번 주 기록 갱신: ${prs.slice(0, 2).join(', ')}`,
      action: '어떤 종목의 어떤 숫자인지 구체적으로 칭찬' });
  }

  // ── 체중 ──
  const ws = i.weights
    .map((w) => ({ t: tOf(w), kg: Number(w.kg) }))
    .filter((w) => Number.isFinite(w.t) && w.kg > 25 && w.kg < 300)
    .sort((a, b) => a.t - b.t);
  const latest = ws.length ? ws[ws.length - 1] : null;
  if (!latest) {
    status.push('체중 기록 없음');
  } else {
    const ago = Math.floor((i.now - latest.t) / DAY);
    status.push(`최근 체중 ${r1(latest.kg)}kg(${ago === 0 ? '오늘' : `${ago}일 전`})`);
    if (ago >= 7) {
      signals.push({ key: 'no_weight', priority: 20, text: `체중 기록이 ${ago}일째 없음`,
        action: '아침 공복 체중 기록을 부탁' });
    }
    const win = ws.filter((w) => i.now - w.t <= 21 * DAY);
    const span = win.length ? (win[win.length - 1].t - win[0].t) / DAY : 0;
    if (win.length >= 3 && span >= 7) {
      const wk = slope(win) * 7;
      status.push(`최근 ${Math.round(span)}일 체중 추세: 주 ${sgn(wk)}kg`);
      const pct = Math.abs(wk) / latest.kg * 100;
      if (span >= 13 && phase === 'cut' && wk < -0.01 * latest.kg) {
        signals.push({ key: 'fast_loss', priority: 90, text: `주 ${sgn(wk)}kg(체중의 ${r1(pct)}%)로 빠르게 빠지는 중 — 근손실 위험`,
          action: '먹는 양을 줄이지 말고 하루 목표 칼로리를 다 채우라고 분명히 말함. 단백질 · 근력운동 유지' });
      } else if (span >= 13 && phase === 'cut' && wk > -0.1) {
        signals.push({ key: 'plateau', priority: 55, text: `감량 단계인데 최근 ${Math.round(span)}일 체중 변화가 주 ${sgn(wk)}kg — 정체`,
          action: '원인 후보(기록 안 한 간식 · 음료 · 주말 과식 · 활동량 감소 · 수분)를 하나 짚고, 걸음 수 늘리기나 칼로리 기록 정확도 중 하나를 제안. '
            + '칼로리 목표는 다음 체크인 때 엔진이 다시 계산한다고 안내(지금 숫자를 바꾸지 않음)' });
      }
      if (span >= 13 && phase === 'gain') {
        const exp = i.project ? expectedWeeklyGain(i.project, i.now) : null;
        const lim = Math.max(0.35, (exp ?? 0.25) * 1.5);
        if (wk > lim) {
          signals.push({ key: 'fast_gain', priority: 50,
            text: `증량 단계인데 주 ${sgn(wk)}kg — ${exp !== null ? `예상(주 ${sgn(exp)}kg)보다` : '권장보다'} 빠름, 늘어난 만큼 체지방 비중이 커짐`,
            action: '간식 · 야식 하나를 줄이라고 제안(하루 목표 칼로리를 넘기지 않기)' });
        }
      }
    }
    if (i.project) {
      const exp = expectedWeightNow(i.project, i.now);
      if (exp !== null) {
        const diff = latest.kg - exp;
        status.push(`프로젝트 예상 체중 지금 ${r1(exp)}kg, 실제와 차이 ${sgn(diff)}kg`);
        const behind = (phase === 'cut' && diff > 2) || (phase === 'gain' && diff < -2);
        if (behind) {
          signals.push({ key: 'off_track', priority: 70, text: `예상보다 ${phase === 'cut' ? '덜 빠짐' : '덜 늘어남'}(차이 ${sgn(diff)}kg)`,
            action: '기록에서 원인 후보 1~2개를 짚고 이번 주 행동 하나. 다음 체크인에서 트랙이 다시 계산된다고 안내' });
        }
      }
    }
  }

  // ── 체크인 ──
  if (i.project) {
    const days = Math.floor((i.now - Date.parse(i.project.startedAt)) / DAY);
    const lastC = i.lastCheckinAt ? Math.floor((i.now - Date.parse(i.lastCheckinAt)) / DAY) : null;
    status.push(`프로젝트 ${days}일째` + (lastC === null ? ', 체크인 아직 없음' : `, 마지막 체크인 ${lastC}일 전`));
    if (days >= 28 && (lastC === null || lastC >= 28)) {
      signals.push({ key: 'checkin_due', priority: 40, text: '4주 체크인 시기',
        action: '홈의 프로젝트 카드에서 체크인을 하라고 안내 — 체크인하면 예상 트랙과 칼로리가 다시 계산됨' });
    }
  }

  signals.sort((a, b) => b.priority - a.priority);
  return { phase, status, signals };
}

/** 이번 달 → 다음 달 예상 증가를 주 단위로 */
function expectedWeeklyGain(p: SigProject, now: number): number | null {
  const m = Math.floor(monthsSince(p.startedAt, now));
  const at = (month: number) => {
    if (month <= 0) return p.startWeightKg;
    const i = Math.max(0, Math.min(p.track.length - 1, month - p.trackOffset));
    return p.track[i]?.weightKg;
  };
  const a = at(m);
  const b = at(m + 1);
  return a && b ? (b - a) / 4.35 : null;
}

/** 프롬프트에 붙일 <signals> 본문 */
export function signalsText(r: SignalResult): string {
  return [
    '[현황]',
    ...r.status.map((s) => `- ${s}`),
    '[켜진 신호 — 우선순위 순]',
    ...(r.signals.length
      ? r.signals.map((s, n) => `${n + 1}. ${s.text} → 코치가 할 일: ${s.action}`)
      : ['- 없음(순조로움)']),
  ].join('\n');
}
