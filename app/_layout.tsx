import { useEffect, useState } from 'react';
import { AppState, Platform, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as Font from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { onAuthChange } from '../src/services/authService';
import { startSession, signedOut, endSession, resumeSession } from '../src/services/session';
import { useAuthStore } from '../src/stores/authStore';
import { useMediaStore } from '../src/stores/mediaStore';
import { ThemeProvider, colors, restoreThemePref, useThemeMode } from '../src/theme';
import { restoreNudgePrefs } from '../src/services/reminders';
import { ConfettiLayer, FONT_ASSETS, restoreHaptics, PressableScale } from '../src/ui';
import MobileFrame from '../src/components/MobileFrame';
import { BootCurtain } from '../src/components/brand/BootCurtain';
import { OtaUpdater } from '../src/components/OtaUpdater';
import { AlertHost } from '../src/components/AlertHost';
import { preload3D } from '../src/components/body/avatar3d/Avatar3D';
import { hideSplash, holdSplash } from '../src/components/brand/splash';

/**
 * 화면을 그리다 오류가 나면 — 빈 화면 · 앱 종료 대신 무슨 오류인지 보여 주고 다시 시도하게 한다(expo-router 가 이 이름을 찾는다).
 * 테마가 깨진 상태일 수도 있어 색은 고정(다크). 오류 글은 길게 눌러 복사할 수 있다 — 문의할 때 그대로 보내면 된다.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> | void }) {
  useEffect(() => { hideSplash(); }, []);
  return (
    <View style={eb.root}>
      <Text style={eb.title}>화면을 여는 중 문제가 생겼습니다</Text>
      <Text style={eb.sub}>아래 내용을 캡처해 보내 주시면 바로 확인하겠습니다.</Text>
      <Text style={eb.msg} selectable>{String(error?.message ?? error)}</Text>
      <PressableScale style={eb.btn} onPress={() => void retry()} accessibilityRole="button">
        <Text style={eb.btnTxt}>다시 시도</Text>
      </PressableScale>
    </View>
  );
}
const eb = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#09090A', alignItems: 'center', justifyContent: 'center', padding: 28 },
  title: { color: '#F4F4F5', fontSize: 19, fontWeight: '800', textAlign: 'center' },
  sub: { color: '#A6A6AD', fontSize: 13.5, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  msg: {
    color: '#F4F4F5', fontSize: 12.5, lineHeight: 18, marginTop: 18, padding: 14, borderRadius: 14, alignSelf: 'stretch',
    backgroundColor: '#18181B', borderWidth: 1, borderColor: '#37373D',
  },
  btn: { marginTop: 20, minHeight: 52, paddingHorizontal: 32, borderRadius: 26, backgroundColor: '#C9C9F0', alignItems: 'center', justifyContent: 'center' },
  btnTxt: { color: '#0A0A0B', fontSize: 15.5, fontWeight: '700' },
});

// 첫 화면이 스플래시와 같은 장면을 그려 둘 때까지 스플래시를 잡아둔다 — 걷는 쪽은 그 화면 (src/components/brand/splash.ts)
holdSplash();

export default function RootLayout() {
  useThemeMode();
  const user = useAuthStore((s) => s.user);
  // 로그인이 확인되면 곧바로 3D 모델을 받아 둔다 — 홈의 몸이 2초 비어 있던 것(검수 2)
  const mySex = user?.profile?.sex;
  useEffect(() => {
    if (mySex) preload3D(mySex);
  }, [mySex]);
  // 저장된 화면 모드 · 진동 설정 — 스플래시가 걷히기 전에 (다른 모드가 비쳤다 바뀌지 않게)
  const [prefsReady, setPrefsReady] = useState(false);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const router = useRouter();
  const segments = useSegments();
  // 이번 실행의 첫 화면을 아직 안 열었다 — 자동 로그인이면 부팅 커튼, 아니면 로그인 화면이 스플래시를 이어받는다
  const [boot, setBoot] = useState(Platform.OS !== 'web');
  const ready = isInitialized && prefsReady;

  useEffect(() => {
    Promise.allSettled([restoreThemePref(), restoreHaptics(), restoreNudgePrefs()]).finally(() => setPrefsReady(true));
    // 숫자 글꼴 — 기다리지 않는다 (불러오기 전엔 시스템 글꼴). 파일 맨 위에서 부르면 웹 정적 렌더링이 깨진다
    Font.loadAsync(FONT_ASSETS).catch(() => {});
  }, []);

  // 웹 — 제 모드로 그린 다음 프레임에 가려 둔 화면을 연다 (app/+html.tsx 의 mt-wait)
  useEffect(() => {
    if (!prefsReady || Platform.OS !== 'web' || typeof document === 'undefined') return;
    requestAnimationFrame(() => document.documentElement.classList.remove('mt-wait'));
  }, [prefsReady]);

  // ─── 운동 영상 매니페스트 — 로그인과 무관하게 매 실행 갱신 ───────────────
  useEffect(() => {
    useMediaStore.getState().refresh();
  }, []);

  // ─── 인증 + 사용자 데이터 (src/services/session.ts) ───────────────────────
  // 기기 캐시로 바로 열고, 사용자 문서는 구독, 기록은 새 것만 받는다.
  useEffect(() => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          await startSession(firebaseUser);
        } catch (e) {
          console.warn('[session]', e);
          useAuthStore.getState().setInitialized(true);
        }
        return;
      }
      await signedOut();
    });
    return () => {
      unsubscribe();
      endSession();
    };
  }, []);

  // ─── 포그라운드 복귀 — 대기 기록 재시도 · 끊긴 구독 복구 · 30분 넘었으면 새 기록 확인 ───
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') resumeSession();
    });
    return () => sub.remove();
  }, []);

  // ─── 스플래시 → 첫 화면 ─────────────────────────────────────────────────
  // 로그인 상태: BootCurtain 이 걷는다. 로그아웃 상태: 로그인 화면이 첫 레이아웃에서 걷는다.
  // 그 밖(딥 링크로 다른 화면 등)이나 화면이 늦으면 2초 뒤에 그냥 걷는다.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(hideSplash, 2000);
    return () => clearTimeout(t);
  }, [ready]);
  useEffect(() => {
    if (ready && boot && !user) setBoot(false);
  }, [ready, boot, user]);

  // ─── 라우팅 가드 ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isInitialized) return;
    const root = segments[0];

    if (!user) {
      if (root !== 'auth') router.replace('/auth/login');
      return;
    }
    if (!user.onboardingDone) {
      // 온보딩 중에 구독 화면 · 내 변화 프로젝트(분석 O6~O8, 시작)를 띄울 수 있어야 하므로 예외로 둔다
      if (root !== 'onboard' && root !== 'subscribe' && root !== 'project') router.replace('/onboard');
      return;
    }
    // 로그인 + 온보딩 완료 상태에서 진입점/인증/온보딩 화면에 있으면 홈으로
    // (웹 뒤로가기로 /onboard 에 다시 들어와 프로필·플랜을 덮어쓰는 경로를 막는다)
    if (root === undefined || root === 'auth' || root === 'onboard') {
      router.replace('/tabs/home');
    }
  }, [user, isInitialized, segments]);

  // 상태 표시줄 · 전환 막은 ThemeProvider 가 맡는다 (여기서 구독하면 테마를 바꿀 때 앱 전체가 한꺼번에 다시 그려진다)
  return (
    <GestureHandlerRootView style={styles.fill}>
    <SafeAreaProvider>
    <ThemeProvider>
      <MobileFrame>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="onboard" />
        <Stack.Screen name="tabs" />
        <Stack.Screen name="routine" />
        <Stack.Screen name="exercise" />
        <Stack.Screen name="library" />
        <Stack.Screen name="history" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="coach" />
        <Stack.Screen name="project" />
        <Stack.Screen name="subscribe" options={{ presentation: 'modal' }} />
      </Stack>
      </MobileFrame>
      <ConfettiLayer />
      <OtaUpdater />
      <AlertHost />
      {boot && ready && user ? <BootCurtain onDone={() => setBoot(false)} /> : null}
    </ThemeProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
