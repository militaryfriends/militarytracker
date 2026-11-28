/**
 * 결석 알림 — 운동을 3일 넘게 빼먹으면 정해 둔 운동 시간에 부른다(로컬 알림, 서버 · 푸시 키 없음).
 *  · 언제 · 무슨 말인지는 utils/nudge.ts (3 · 4 · 5 · 7 · 10 · 14일째, 쉴수록 세진다).
 *  · 새 기록이 생기거나 설정(세기 · 시간)을 바꾸면 전부 지우고 다시 예약한다.
 *  · 권한은 첫 운동을 마친 뒤에 묻는다(앱을 켜자마자 묻지 않는다).
 *  · 설정은 기기에 저장한다(AsyncStorage 'mt-nudge') — 알림이 울리는 곳이 이 기기라서.
 * expo-notifications 는 네이티브 모듈 — 1.0.0 이전 빌드 · 웹에서는 아무것도 하지 않는다.
 */
import { useLayoutEffect, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  NUDGE_DEFAULT, isNudgeHour, isNudgeLevel, nudgePlan, nudgeTimes, type NudgeHour, type NudgeLevel,
} from '../utils/nudge';
import { keepWords } from '../utils/keepWords';
import { subNotices } from '../utils/subNotice';
import type { Subscription } from '../types';

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

// ─── 설정(세기 · 시간) ──────────────────────────────────────────────────────
/** sub = 구독 알림(무료 체험 · 구독이 끝나기 전) 켬/끔 — 기본 켬 */
export interface NudgePrefs { level: NudgeLevel; hour: NudgeHour; sub: boolean }
const KEY = 'mt-nudge';
let prefs: NudgePrefs = { ...NUDGE_DEFAULT, sub: true };
const listeners = new Set<(p: NudgePrefs) => void>();

export function getNudgePrefs(): NudgePrefs {
  return prefs;
}

export function setNudgePrefs(next: Partial<NudgePrefs>, remember = true) {
  const merged = { ...prefs, ...next };
  if (merged.level === prefs.level && merged.hour === prefs.hour && merged.sub === prefs.sub) return;
  prefs = merged;
  [...listeners].forEach((l) => l(prefs));
  if (remember) AsyncStorage.setItem(KEY, JSON.stringify(prefs)).catch(() => {});
}

export async function restoreNudgePrefs(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return;
    const v = JSON.parse(raw) as { level?: unknown; hour?: unknown; sub?: unknown };
    setNudgePrefs({
      ...(isNudgeLevel(v.level) ? { level: v.level } : {}),
      ...(isNudgeHour(v.hour) ? { hour: v.hour } : {}),
      ...(typeof v.sub === 'boolean' ? { sub: v.sub } : {}),
    }, false);
  } catch {
    /* 기본값 */
  }
}

export function useNudgePrefs(): NudgePrefs {
  const [p, setP] = useState(prefs);
  useLayoutEffect(() => {
    const l = (v: NudgePrefs) => setP(v);
    listeners.add(l);
    setP(prefs);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return p;
}

/** 이 기기에서 알림이 울릴 수 있는지 — 웹은 못 울린다(설정 화면 안내용) */
export const canNudge = (): boolean => notifications() !== null;

// ─── 예약 ───────────────────────────────────────────────────────────────────
const TAG = 'comeback';

/**
 * 마지막 운동 기준으로 결석 알림을 다시 예약한다. 세기가 '끔'이면 예약된 것을 지우기만 한다.
 * dayName: 다음에 할 운동 이름(첫 알림에 넣는다).
 */
export async function scheduleComeback(lastWorkoutIso: string | null, askPermission: boolean, dayName?: string): Promise<void> {
  const n = notifications();
  if (!n || !lastWorkoutIso) return;
  try {
    let perm = await n.getPermissionsAsync();
    if (perm.status === 'undetermined' && askPermission && prefs.level !== 'off') perm = await n.requestPermissionsAsync();
    if (perm.status !== 'granted') return;
    if (Platform.OS === 'android') {
      await n.setNotificationChannelAsync('reminders', { name: '운동 알림', importance: n.AndroidImportance.DEFAULT });
    }
    const all = await n.getAllScheduledNotificationsAsync();
    await Promise.all(all
      .filter((x) => (x.content.data as { tag?: string } | undefined)?.tag === TAG)
      .map((x) => n.cancelScheduledNotificationAsync(x.identifier)));
    const plan = nudgePlan(prefs.level, dayName);
    if (!plan.length) return;
    for (const { days, at } of nudgeTimes(lastWorkoutIso, prefs.hour)) {
      const p = plan.find((x) => x.days === days);
      if (!p) continue;
      await n.scheduleNotificationAsync({
        // 알림 글자는 OS 가 그린다 — 단어 중간 줄바꿈을 여기서 막는다(src/components/Text 와 같은 방법)
        content: { title: keepWords(p.title), body: keepWords(p.body), data: { tag: TAG, url: '/tabs/home' } },
        trigger: { type: n.SchedulableTriggerInputTypes.DATE, date: at, channelId: 'reminders' },
      });
    }
  } catch (e) {
    if (__DEV__) console.warn('[reminders]', e);
  }
}

// ─── 구독 알림 ───────────────────────────────────────────────────────────────
const SUB_TAG = 'sub';

/**
 * 무료 체험 · 해지 예약이 끝나기 전 알림을 다시 예약한다(utils/subNotice.ts).
 * 권한은 여기서 묻지 않는다 — 결석 알림 흐름(첫 운동 뒤)이나 설정에서 켤 때 묻는다.
 * askPermission: 설정에서 사용자가 직접 켰을 때만 true.
 */
export async function scheduleSubNotices(sub: Subscription | null | undefined, askPermission = false): Promise<void> {
  const n = notifications();
  if (!n) return;
  try {
    let perm = await n.getPermissionsAsync();
    if (perm.status === 'undetermined' && askPermission && prefs.sub) perm = await n.requestPermissionsAsync();
    if (perm.status !== 'granted') return;
    if (Platform.OS === 'android') {
      await n.setNotificationChannelAsync('subscription', { name: '구독 알림', importance: n.AndroidImportance.DEFAULT });
    }
    const all = await n.getAllScheduledNotificationsAsync();
    await Promise.all(all
      .filter((x) => (x.content.data as { tag?: string } | undefined)?.tag === SUB_TAG)
      .map((x) => n.cancelScheduledNotificationAsync(x.identifier)));
    if (!prefs.sub) return;
    for (const p of subNotices(sub)) {
      await n.scheduleNotificationAsync({
        content: { title: keepWords(p.title), body: keepWords(p.body), data: { tag: SUB_TAG, url: '/profile/settings' } },
        trigger: { type: n.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: 'subscription' },
      });
    }
  } catch (e) {
    if (__DEV__) console.warn('[reminders:sub]', e);
  }
}
