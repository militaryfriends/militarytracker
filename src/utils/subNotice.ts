/**
 * 구독 알림 — 무료 체험 · 구독이 끝나기 전에 미리 알린다(2026-11-28 대표 지시).
 * 여기는 '언제 · 무슨 말'만 정한다(순수 함수 — 단위 테스트 대상). 실제 예약은 services/reminders.ts.
 *
 * 규칙
 *  · 스토어 구독(ios · android)만. 관리자 지급 · 프로모 · 만료 없는 권한은 부르지 않는다.
 *  · 무료 체험(trial): 스토어는 끝나기 24시간 전까지 해지하지 않으면 자동으로 이어 간다(구독 화면 안내와 같은 기준).
 *    그래서 기준은 '해지 마감 = 끝나는 시각 − 24시간'이다.
 *      - 마감 이틀 전 낮 12시
 *      - 마감 3시간 전(밤 9시 ~ 아침 8시에 걸리면 그 전날 저녁 8시로 당긴다)
 *      - 체험이 9일보다 길게 남았을 때만 마감 7일 전 낮 12시(7일 체험이면 첫날 울리는 알림이 된다)
 *    본문에는 마감 시각을 적는다. 결제일은 적지 않는다(스토어마다 하루 어긋날 수 있다).
 *  · 해지 예약(canceled): 끝나기 3 · 1일 전 낮 12시. 그 뒤로는 무료 플랜이라는 것과 기록은 남는다는 것만.
 *  · 구독 중(active) · 결제 확인 중(grace)은 부르지 않는다(grace 는 스토어가 직접 알린다).
 *  · 금액은 쓰지 않는다 — 스토어 · 오퍼마다 달라서 앱이 확실히 아는 값이 아니다.
 *  · 이미 지난 시각은 뺀다(now 기준 1분 뒤부터). 시각은 기기 현지 시간.
 */
import type { Subscription } from '../types';

export interface SubNotice {
  key: string;
  at: Date;
  title: string;
  body: string;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const KO_DAYS = ['', '하루', '이틀', '사흘', '나흘', '닷새', '엿새', '이레'];

/** "12월 20일 오후 9시" — 분이 있으면 "오후 9시 30분" */
export function deadlineLabel(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${ampm} ${h12}시${m ? ` ${m}분` : ''}`;
}

const noonOf = (t: number, daysBefore: number) => {
  const d = new Date(t - daysBefore * DAY);
  d.setHours(12, 0, 0, 0);
  return d;
};

export function subNotices(sub: Subscription | null | undefined, now: number = Date.now()): SubNotice[] {
  if (!sub || sub.tier !== 'pro' || !sub.expiresAt) return [];
  if (sub.source !== 'ios' && sub.source !== 'android') return [];
  if (sub.status !== 'trial' && sub.status !== 'canceled') return [];
  const end = Date.parse(sub.expiresAt);
  if (!Number.isFinite(end) || end <= now) return [];
  const out: SubNotice[] = [];
  const push = (n: SubNotice, limit: number) => {
    if (n.at.getTime() > now + 60_000 && n.at.getTime() < limit) out.push(n);
  };

  if (sub.status === 'trial') {
    const deadline = end - DAY;
    const label = deadlineLabel(new Date(deadline));
    const body = `${label}까지 해지하지 않으면 구독이 이어지고 결제돼요. 해지는 설정 › 구독 관리에서.`;
    if (end - now > 9 * DAY) {
      push({ key: 'trial-7', at: noonOf(deadline, 7), title: '무료 체험이 일주일 남았어요', body }, deadline);
    }
    push({ key: 'trial-2', at: noonOf(deadline, 2), title: '무료 체험 해지 마감이 이틀 남았어요', body }, deadline);
    // 마감 3시간 전 — 밤 9시 ~ 아침 8시면 그 전날 저녁 8시로
    const last = new Date(deadline - 3 * HOUR);
    if (last.getHours() >= 21 || last.getHours() < 8) {
      if (last.getHours() < 8) last.setDate(last.getDate() - 1);
      last.setHours(20, 0, 0, 0);
    }
    push({ key: 'trial-last', at: last, title: '오늘이 무료 체험 해지 마감이에요', body }, deadline);
    // "오늘이"가 아닌 날(전날 저녁으로 당겨진 경우)은 제목을 바꾼다
    const lastN = out.find((n) => n.key === 'trial-last');
    if (lastN && new Date(deadline).getDate() !== lastN.at.getDate()) lastN.title = '내일이 무료 체험 해지 마감이에요';
    return out;
  }

  // 해지 예약 — 남은 기간이 끝나면 무료 플랜
  const endLabel = `${new Date(end).getMonth() + 1}월 ${new Date(end).getDate()}일`;
  for (const d of [3, 1]) {
    push({
      key: `canceled-${d}`,
      at: noonOf(end, d),
      title: d === 1 ? '구독이 내일 끝나요' : `구독이 ${KO_DAYS[d]} 뒤 끝나요`,
      body: `${endLabel}부터 무료 플랜이에요. 기록은 그대로 남아요.`,
    }, end);
  }
  return out;
}
