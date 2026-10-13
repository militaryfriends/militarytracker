/**
 * 진동 문법 — 화면 코드는 뜻으로 부른다 (haptic.set() 처럼). 종류를 화면마다 고르지 않는다.
 *
 *  select   탭 이동 · 칩/세그먼트 선택 · 휴식 마지막 3초
 *  tap      버튼 · 카드 누름(PressableScale 기본) · 테마 토글 · 세트 체크 해제
 *  set      세트 완료 · 운동 시작
 *  success  PR 갱신 · 운동 저장 · 주간 목표 달성
 *  warn     세션 버리기 · 삭제 확인 · 잠긴(Pro) 기능 누름
 *  error    입력 검증 실패 · 저장 실패
 *
 * MY › 화면 › '누를 때 진동' 으로 끈다 (AsyncStorage 'mt-haptics').
 * 휴식 끝 알림(SessionPlayer 의 긴 Vibration 패턴)은 여기에 속하지 않는다 — 폰이 벤치 위에 있어도 알아채야 해서 끄지 않는다.
 * 웹은 아무 일도 하지 않는다.
 */
import { useLayoutEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const HAPTICS_STORAGE_KEY = 'mt-haptics';

let enabled = true;
const listeners = new Set<(on: boolean) => void>();

function run(fn: () => Promise<void>) {
  if (!enabled || Platform.OS === 'web') return;
  fn().catch(() => {});
}

export const haptic = {
  select: () => run(() => Haptics.selectionAsync()),
  tap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  set: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warn: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
} as const;

export type HapticKind = keyof typeof haptic;

export function setHapticsEnabled(on: boolean, remember = true) {
  if (on !== enabled) {
    enabled = on;
    [...listeners].forEach((l) => l(on));
  }
  if (remember) AsyncStorage.setItem(HAPTICS_STORAGE_KEY, on ? 'on' : 'off').catch(() => {});
}

export async function restoreHaptics(): Promise<void> {
  try {
    const v = await AsyncStorage.getItem(HAPTICS_STORAGE_KEY);
    if (v === 'off') setHapticsEnabled(false, false);
  } catch {
    /* 기본값 켬 */
  }
}

export function useHapticsEnabled(): boolean {
  const [on, setOn] = useState(enabled);
  useLayoutEffect(() => {
    const l = (v: boolean) => setOn(v);
    listeners.add(l);
    setOn(enabled);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return on;
}
