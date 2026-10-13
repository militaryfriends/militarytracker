/**
 * 내 변화 프로젝트 — 분석(O6) · 비교(O7) · 프로젝트 제안(O8) · 시작 · 진행/체크인 · 다시 분석.
 * 온보딩 중에도, 끝난 뒤(홈 카드)에도 같은 화면을 연다 — 라우팅 가드가 /project 는 둘 다 허용한다.
 */
import { Stack } from 'expo-router';
import { colors, useThemeMode } from '../../src/theme';

export default function ProjectLayout() {
  useThemeMode();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      {/* 분석 · 시작 로딩 중에는 뒤로 갈 수 없다 (명세 O6) */}
      <Stack.Screen name="analysis" options={{ gestureEnabled: false, animation: 'fade' }} />
      <Stack.Screen name="start" options={{ gestureEnabled: false, animation: 'fade' }} />
      <Stack.Screen name="compare" options={{ animation: 'fade' }} />
    </Stack>
  );
}
