/**
 * 안드로이드 키보드 높이 — 입력칸을 키보드 위로 올리는 데 쓴다.
 *
 * Expo SDK 58(RN 0.88)부터 안드로이드는 edge-to-edge 가 강제라, 키보드가 떠도 창이 줄어들지 않는다(adjustResize 가 먹지 않음).
 * 그래서 `KeyboardAvoidingView behavior={undefined}` 로 두던 화면은 입력칸이 키보드 뒤에 그대로 남는다(2026-11-13 코치 화면 버그).
 * 키보드 이벤트의 높이는 화면 맨 아래(내비게이션 바 포함)부터 잰 값이라, 화면 맨 아래까지 그리는 레이아웃에는 그대로 paddingBottom 으로 쓰면 된다.
 * iOS · 웹은 0 — iOS 는 KeyboardAvoidingView(padding)가 맡는다. 네이티브 모듈이 없어 코드 푸시로 보낼 수 있다.
 */
import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export function useKeyboardInset(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setH(Math.max(0, e.endCoordinates?.height ?? 0)));
    const hide = Keyboard.addListener('keyboardDidHide', () => setH(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return h;
}
