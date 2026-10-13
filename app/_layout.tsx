import { useEffect, useState } from 'react';
import { AppState, Platform, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { onAuthChange, fetchUserProfile, fetchPlan, ensureUserDoc } from '../src/services/authService';
import { getWorkoutLogs, getWeights } from '../src/services/workoutService';
import { refreshSub } from '../src/services/billingService';
import { flushPendingLogs, mergePendingIntoLogs } from '../src/services/sync';
import { useAuthStore } from '../src/stores/authStore';
import { useAppStore, waitForHydration } from '../src/stores/appStore';
import { useMediaStore } from '../src/stores/mediaStore';
import { ThemeProvider, colors, restoreThemePref, useThemeMode } from '../src/theme';
import { ConfettiLayer, FONT_ASSETS, restoreHaptics } from '../src/ui';
import MobileFrame from '../src/components/MobileFrame';

// 하이드레이션이 끝날 때까지 스플래시를 잡아둔다 (로그인 화면 깜빡임 방지)
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  useThemeMode();
  const user = useAuthStore((s) => s.user);
  // 저장된 화면 모드 · 진동 설정 — 스플래시가 걷히기 전에 (다른 모드가 비쳤다 바뀌지 않게)
  const [prefsReady, setPrefsReady] = useState(false);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    Promise.allSettled([restoreThemePref(), restoreHaptics()]).finally(() => setPrefsReady(true));
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

  // ─── 인증 + 사용자 데이터 복원 ──────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      const { setUser, patchUser, setInitialized, setHydrating } = useAuthStore.getState();
      try {
        // 기기에 저장된 세션·대기열·캐시가 복원되기 전에 읽으면 빈 값을 보게 된다
        await waitForHydration();
        const app = useAppStore.getState();

        if (!firebaseUser) {
          setUser(null);
          app.resetAll();
          return;
        }

        // 기기에 남은 이전 계정 데이터를 폐기한다 (같은 계정이면 캐시가 그대로 남는다)
        app.setOwner(firebaseUser.uid);
        const cached = useAppStore.getState().cachedUser;

        let profile = await fetchUserProfile(firebaseUser.uid).catch(() => undefined);
        if (profile === undefined) {
          // 오프라인 등으로 프로필을 못 읽었을 때 — 마지막으로 받은 사용자 문서(캐시)로 세션을 유지한다.
          // 캐시가 없으면 온보딩 여부를 알 수 없으므로 완료로 가정하고 홈으로 보낸다(플랜 없음 화면).
          setUser(
            cached && cached.uid === firebaseUser.uid
              ? cached
              : {
                  uid: firebaseUser.uid,
                  email: firebaseUser.email,
                  displayName: firebaseUser.displayName,
                  photoURL: firebaseUser.photoURL,
                  authProvider: 'email',
                  role: 'user',
                  onboardingDone: true,
                  profile: null,
                  createdAt: new Date().toISOString(),
                  lastLoginAt: new Date().toISOString(),
                }
          );
          mergePendingIntoLogs(firebaseUser.uid);
          return;
        }
        if (profile === null) {
          // 문서가 없다 = 방금 가입해서 setDoc 이 아직 안 끝났거나, 삭제 도중 실패한 계정.
          // 예전엔 여기서 setUser(null) 을 해서 가입 직후 앱이 멈췄다 — 문서를 만들어 주고 온보딩으로 보낸다.
          profile = await ensureUserDoc(firebaseUser);
        }

        setUser(profile);
        useAppStore.getState().setCachedUser(profile);
        // 온보딩에서 저장한 신체 정보 — 식단·코치·플랜 재생성이 모두 여기에 의존
        if (profile.profile) useAppStore.getState().setProfile(profile.profile);

        // 플랜·기록이 오기 전까지 홈이 "플랜 없음" 을 보이지 않도록
        setHydrating(true);
        try {
          // 하나가 실패해도 나머지는 살린다
          const [planR, logsR, weightsR, subR] = await Promise.allSettled([
            fetchPlan(firebaseUser.uid),
            getWorkoutLogs(firebaseUser.uid, 60),
            getWeights(firebaseUser.uid, 30),
            // 만료된 구독을 서버가 정리하고 최신 상태를 돌려준다.
            // 함수가 아직 배포되지 않았으면 null 이라 문서에서 읽은 값을 그대로 쓴다.
            refreshSub(),
          ]);
          const st = useAppStore.getState();
          if (planR.status === 'fulfilled') st.setPlan(planR.value);
          if (logsR.status === 'fulfilled') st.setLogs(logsR.value);
          if (weightsR.status === 'fulfilled') st.setWeights(weightsR.value);
          if (subR.status === 'fulfilled' && subR.value) patchUser({ sub: subR.value });
        } finally {
          setHydrating(false);
        }

        // 지난번에 서버 저장이 실패한 운동 기록: 목록에 먼저 보이게 하고, 재시도한다
        mergePendingIntoLogs(firebaseUser.uid);
        flushPendingLogs(firebaseUser.uid).catch(() => {});
      } catch (e) {
        console.warn('[hydrate]', e);
      } finally {
        setInitialized(true);
      }
    });
    return unsubscribe;
  }, []);

  // ─── 포그라운드 복귀 시 대기 로그 재시도 ──────────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const uid = useAuthStore.getState().user?.uid;
      if (state === 'active' && uid) flushPendingLogs(uid).catch(() => {});
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (isInitialized && prefsReady) SplashScreen.hideAsync().catch(() => {});
  }, [isInitialized, prefsReady]);

  // ─── 라우팅 가드 ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isInitialized) return;
    const root = segments[0];

    if (!user) {
      if (root !== 'auth') router.replace('/auth/login');
      return;
    }
    if (!user.onboardingDone) {
      // 온보딩 마지막 단계에서 구독 화면을 띄울 수 있어야 하므로 예외로 둔다
      if (root !== 'onboard' && root !== 'subscribe') router.replace('/onboard');
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
        <Stack.Screen name="subscribe" options={{ presentation: 'modal' }} />
      </Stack>
      </MobileFrame>
      <ConfettiLayer />
    </ThemeProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
