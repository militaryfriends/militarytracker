/**
 * 다시 시작 알림 — 운동을 빼먹으면 다시 시작하게 한다(로컬 알림, 서버 · 푸시 키 없음).
 *  · 마지막 운동 뒤 2일 · 5일 저녁 7시에 하나씩 예약한다. 새 기록이 생기면 전부 지우고 다시 예약.
 *  · 권한은 첫 운동을 마친 뒤에 묻는다(앱을 켜자마자 묻지 않는다).
 * expo-notifications 는 네이티브 모듈 — 1.0.0 이전 빌드 · 웹에서는 아무것도 하지 않는다.
 */
import { Platform } from 'react-native';

type N = typeof import('expo-notifications');
let mod: N | null | undefined;
function notifications(): N | null {
  if (mod !== undefined) return mod;
  if (Platform.OS === 'web') return (mod = null);
  try {
    mod = require('expo-notifications') as N;
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false,
      }),
    });
  } catch {
    mod = null;
  }
  return mod;
}

const TAG = 'comeback';
const PLAN: { days: number; title: string; body: string }[] = [
  { days: 2, title: '이틀 쉬었어요', body: '오늘 한 세션이면 흐름이 다시 이어집니다. 목표 몸까지 가는 길, 지금 돌아오세요.' },
  { days: 5, title: '다시 시작할 때예요', body: '처음부터가 아니라 이어서입니다. 가볍게 한 세션만 해도 충분해요.' },
];

/** 저녁 7시(현지) — days 일 뒤 */
function at(lastIso: string, days: number): Date | null {
  const t = Date.parse(lastIso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  d.setDate(d.getDate() + days);
  d.setHours(19, 0, 0, 0);
  return d.getTime() > Date.now() + 60_000 ? d : null;
}

export async function scheduleComeback(lastWorkoutIso: string | null, askPermission: boolean): Promise<void> {
  const n = notifications();
  if (!n || !lastWorkoutIso) return;
  try {
    let perm = await n.getPermissionsAsync();
    if (perm.status === 'undetermined' && askPermission) perm = await n.requestPermissionsAsync();
    if (perm.status !== 'granted') return;
    if (Platform.OS === 'android') {
      await n.setNotificationChannelAsync('reminders', { name: '운동 알림', importance: n.AndroidImportance.DEFAULT });
    }
    const all = await n.getAllScheduledNotificationsAsync();
    await Promise.all(all
      .filter((x) => (x.content.data as { tag?: string } | undefined)?.tag === TAG)
      .map((x) => n.cancelScheduledNotificationAsync(x.identifier)));
    for (const p of PLAN) {
      const when = at(lastWorkoutIso, p.days);
      if (!when) continue;
      await n.scheduleNotificationAsync({
        content: { title: p.title, body: p.body, data: { tag: TAG, url: '/tabs/home' } },
        trigger: { type: n.SchedulableTriggerInputTypes.DATE, date: when, channelId: 'reminders' },
      });
    }
  } catch (e) {
    if (__DEV__) console.warn('[reminders]', e);
  }
}
