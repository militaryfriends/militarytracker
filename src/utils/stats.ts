import { exForLog, Part, PART_ORDER } from '../data/exercises';
import { Plan, WorkoutLog, PartVolume, SetDetail, UserStats } from '../types';
import { localDate } from '../services/workoutService';

// ─── 주간 계산 (월요일 시작) ───────────────────────────────────────────────
export function mondayOf(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x;
}

export function weekDates(d: Date = new Date()): string[] {
  const mon = mondayOf(d);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(mon);
    day.setDate(mon.getDate() + i);
    return localDate(day);
  });
}

/** 이번 주 월~일 운동 여부 — 로그에서 계산하므로 앱을 껐다 켜도 유지된다 */
export function weekStreak(logs: WorkoutLog[]): boolean[] {
  const dates = weekDates();
  const done = new Set(logs.map((l) => l.date));
  return dates.map((d) => done.has(d));
}

export function currentStreakDays(logs: WorkoutLog[]): number {
  if (!logs.length) return 0;
  const done = new Set(logs.map((l) => l.date));
  let streak = 0;
  const cursor = new Date();
  if (!done.has(localDate(cursor))) cursor.setDate(cursor.getDate() - 1);
  for (;;) {
    if (!done.has(localDate(cursor))) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// ─── 다음 운동 데이 ────────────────────────────────────────────────────────
export function nextDayIdx(logs: WorkoutLog[], plan: Plan | null): number {
  if (!plan?.days.length) return 0;
  const len = plan.days.length;
  const last = logs[0];
  if (!last) return 0;

  let idx = last.dayIdx;
  if (idx < 0 || idx >= len) {
    idx = plan.days.findIndex((d) => d.name === last.dayName);
  }
  if (idx < 0) return 0;
  return (idx + 1) % len;
}

// ─── 볼륨 집계 ─────────────────────────────────────────────────────────────
const emptyVolume = (): PartVolume =>
  PART_ORDER.reduce((acc, p) => ({ ...acc, [p]: 0 }), {} as PartVolume);

/** weekOnly = 이번 주 월~일, lastWeek = 지난주 월~일(주간 리포트의 "지난주 대비") */
type WeekOpts = { weekOnly?: boolean; lastWeek?: boolean };
function weekFilter(opts: WeekOpts): ((date: string) => boolean) {
  if (opts.lastWeek) {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const w = new Set(weekDates(d));
    return (date) => w.has(date);
  }
  if (opts.weekOnly) {
    const w = new Set(weekDates());
    return (date) => w.has(date);
  }
  return () => true;
}

export function setsByPart(logs: WorkoutLog[], opts: WeekOpts = {}): PartVolume {
  const acc = emptyVolume();
  const inWeek = weekFilter(opts);
  logs.forEach((l) => {
    if (!inWeek(l.date)) return;
    l.exercises.forEach((x) => {
      const e = exForLog(x.id);
      if (!e) return;
      acc[e.part] += x.sets;
    });
  });
  return acc;
}

export function weakestPart(vol: PartVolume): Part | null {
  const entries = PART_ORDER.map((p) => [p, vol[p]] as const);
  if (entries.every(([, v]) => v === 0)) return null;
  return entries.reduce((a, b) => (a[1] <= b[1] ? a : b))[0];
}

export function totalSets(logs: WorkoutLog[], opts: WeekOpts = {}): number {
  const inWeek = weekFilter(opts);
  return logs.filter((l) => inWeek(l.date)).reduce((a, l) => a + l.totalSets, 0);
}

export function totalVolume(logs: WorkoutLog[], opts: WeekOpts = {}): number {
  const inWeek = weekFilter(opts);
  return logs.filter((l) => inWeek(l.date)).reduce((a, l) => a + l.totalVolume, 0);
}

// ─── 종목별 기록 ───────────────────────────────────────────────────────────
export function lastRecordOf(
  logs: WorkoutLog[],
  exId: string
): { sets: number; volume: number } | null {
  for (const l of logs) {
    const hit = l.exercises.find((x) => x.id === exId);
    if (hit) return { sets: hit.sets, volume: hit.volume };
  }
  return null;
}

/** 가장 최근에 이 종목을 한 날의 세트별 수치 — 세션 중 "지난 기록" 표시용 */
export function lastSetsOf(
  logs: WorkoutLog[],
  exId: string
): { date: string; detail: SetDetail[] } | null {
  for (const l of logs) {
    const hit = l.exercises.find((x) => x.id === exId);
    if (hit?.detail?.length) return { date: l.date, detail: hit.detail };
  }
  return null;
}

/** Epley 추정 1RM */
export const e1rm = (w: number, r: number): number => (w > 0 && r > 0 ? w * (1 + r / 30) : 0);

/**
 * 세트 점수 — 개인 기록 비교의 단일 기준.
 * 무게가 있으면 추정 1RM, 맨몸·시간 종목(무게 0)은 반복/초 그 자체.
 * 두 종류를 섞어 비교할 일은 없다(같은 종목은 늘 같은 종류다).
 */
export const setScore = (d: SetDetail): number => (d.w > 0 ? e1rm(d.w, d.r) : d.r > 0 ? d.r : 0);

/** 후보 중 최고 세트. 점수 0(빈 세트)은 후보에서 뺀다 */
export function bestSet(cands: SetDetail[]): SetDetail | undefined {
  let best: SetDetail | undefined;
  for (const d of cands) {
    if (setScore(d) <= 0) continue;
    if (!best || setScore(d) > setScore(best)) best = d;
  }
  return best;
}

/**
 * 이 종목의 역대 최고 세트.
 * 앱은 최근 로그 일부만 들고 있으므로 users.stats.pr(서버 요약)이 있으면 그것과 합쳐 본다.
 */
export function personalBest(logs: WorkoutLog[], exId: string, stats?: UserStats | null): SetDetail | null {
  const cands: SetDetail[] = [];
  const stored = stats?.pr?.[exId];
  if (stored) cands.push({ w: stored.w, r: stored.r });
  logs.forEach((l) => {
    l.exercises
      .filter((x) => x.id === exId)
      .forEach((x) => cands.push(...(x.best ? [x.best] : x.detail ?? [])));
  });
  return bestSet(cands) ?? null;
}

/** 이번 로그에서 개인 기록을 갱신한 종목 id 목록 */
export function prIdsIn(
  newLog: { exercises: WorkoutLog['exercises'] },
  past: WorkoutLog[],
  stats?: UserStats | null
): string[] {
  return newLog.exercises
    .filter((x) => {
      if (!x.best || setScore(x.best) <= 0) return false;
      const prev = personalBest(past, x.id, stats);
      return !prev || setScore(x.best) > setScore(prev);
    })
    .map((x) => x.id);
}

/** 로그 저장 후 users.stats 갱신값 — 오래된 PR 과 누적치를 최근 로그 밖에서도 유지한다 */
export function nextStats(prev: UserStats | null | undefined, log: WorkoutLog, past: WorkoutLog[]): UserStats {
  const pr = { ...(prev?.pr ?? {}) };
  for (const x of log.exercises) {
    if (!x.best || setScore(x.best) <= 0) continue;
    const cur = personalBest(past, x.id, prev);
    if (!cur || setScore(x.best) > setScore(cur)) pr[x.id] = { w: x.best.w, r: x.best.r, date: log.date };
  }
  // 누적치는 서버 요약이 없던 계정이면 들고 있는 로그로 초기화한다
  const baseLogs = prev?.totalLogs ?? past.length;
  const baseVol = prev?.totalVolume ?? past.reduce((a, l) => a + l.totalVolume, 0);
  return {
    pr,
    totalLogs: baseLogs + 1,
    totalVolume: baseVol + log.totalVolume,
  };
}

// ─── 포맷 ──────────────────────────────────────────────────────────────────
export const fmtDuration = (sec: number): string => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
};

export const fmtClock = (sec: number): string =>
  `${String(Math.floor(Math.max(0, sec) / 60)).padStart(2, '0')}:${String(Math.max(0, sec) % 60).padStart(2, '0')}`;

export const fmtVolume = (kg: number): string =>
  kg >= 1000 ? `${(kg / 1000).toFixed(1)}t` : `${Math.round(kg)}kg`;

export const fmtSetDetail = (d: SetDetail): string =>
  d.w > 0 ? `${d.w}×${d.r}` : `${d.r}회`;

/** 'YYYY-MM-DD' → '9월 19일 (토)' */
export function fmtDateKo(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (!date || Number.isNaN(d.getTime())) return '';
  const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${dow})`;
}
