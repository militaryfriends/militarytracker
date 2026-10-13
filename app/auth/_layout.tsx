import { Stack } from 'expo-router';
import { D } from '../../src/components/auth/palette';

/** 로그인 · 회원가입은 항상 다크 — 화면 전환 중에 비치는 바탕도 */
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: D.bg } }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
    </Stack>
  );
}
