/**
 * 라이트 · 다크 — 홈 머리줄 토글(ThemeToggle)이나 MY › 화면에서 바꾼다.
 *
 * 토글을 누르면 (1) 토글 아이콘이 화면 스레드에서 바로 돌고, (2) 옛 바탕색 막이 화면을 살짝 덮은 채로
 * (3) 앱이 새 색으로 다시 그린다. (4) 새 색이 화면에 올라가는 순간 막이 240ms 동안 걷혀 옛 색에서 새 색으로 번지듯 바뀐다.
 * 화면을 새로 띄우지 않는다 — 보던 상태 · 입력 · 스크롤 그대로. 저장은 기다리지 않고 뒤에서.
 * 기기의 '동작 줄이기'가 켜져 있으면 막 없이 바로 바뀐다. 기기 설정을 따라 바뀔 때도 막 없이.
 *
 * (smiscamp 는 처음에 원이 퍼지는 전환을 했다가 앱 전체를 한 번에 다시 그리느라 1초쯤 멈춰 이 방식으로 바꿨다.)
 */
import { useEffect, useLayoutEffect, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { haptic } from '../ui/haptics';
import { EASE } from '../ui/motion';
import {
  getThemeMode, paletteFor, resolveMode, setThemePref, subscribeThemeMode, useThemeMode, type ThemeMode, type ThemePref,
} from './tokens';

/** 막 — 누르는 순간 옛 바탕색을 이만큼 덮고, 새 색이 올라가면 걷는다 */
const VEIL_PEAK = 0.75;
const VEIL_FADE = { duration: 240, easing: EASE.standard };

let reduceMotion = false;
let veil: { opacity: SharedValue<number>; color: SharedValue<string> } | null = null;
/** 토글로 바꿨을 때만 막을 걷는다 (기기 설정 · 앱 시작 때 복원은 막 없이) */
let veilArmed = false;

/** 라이트 ↔ 다크 — 고른 값으로 기억한다 */
export function toggleTheme() {
  const prev = getThemeMode();
  const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
  haptic.tap();
  armVeil(prev);
  setThemePref(next);
}

/** 막을 씌운 채로 모드를 고른다 (MY › 화면 설정). 모드가 그대로면(시스템 = 지금 모드) 막 없이 기억만 */
export function chooseTheme(next: ThemePref) {
  const prev = getThemeMode();
  if (resolveMode(next) !== prev) armVeil(prev);
  setThemePref(next);
}

function armVeil(prev: ThemeMode) {
  if (!veil || reduceMotion) return;
  // 화면 스레드에서 바로 — JS 가 새 색을 그리는 동안 옛 화면을 옛 바탕색으로 살짝 덮어 둔다
  cancelAnimation(veil.opacity);
  veil.color.value = paletteFor(prev).bg;
  veil.opacity.value = VEIL_PEAK;
  veilArmed = true;
}

/** 화면 맨 위 막 */
function ThemeVeil() {
  const mode = useThemeMode();
  const opacity = useSharedValue(0);
  const color = useSharedValue<string>(paletteFor(getThemeMode()).bg);

  useLayoutEffect(() => {
    const mine = { opacity, color };
    veil = mine;
    return () => {
      if (veil === mine) veil = null;
    };
  }, [opacity, color]);

  // 새 색이 커밋된 바로 그때 막을 걷는다 (천천히 시작하는 곡선이라 화면에 올라가는 순간과 어긋나도 티가 안 난다)
  useLayoutEffect(() => {
    if (!veilArmed) return;
    veilArmed = false;
    opacity.value = withTiming(0, VEIL_FADE);
  }, [mode, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value, backgroundColor: color.value }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]} />;
}

/** 상태 표시줄 글자색 — 모드를 따라 (앱 맨 위에서 구독하면 테마를 바꿀 때 앱 전체가 다시 그려진다) */
function ThemeStatusBar() {
  const mode = useThemeMode();
  return <StatusBar style={mode === 'dark' ? 'light' : 'dark'} animated />;
}

/** 웹 — 프레임 바깥 바탕 · 스크롤바 · 주소창 색 */
function paintWeb(m: ThemeMode) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const p = paletteFor(m);
  const root = document.documentElement;
  root.setAttribute('data-theme', m);
  root.style.colorScheme = m;
  root.style.backgroundColor = p.bgDeep;
  document.body.style.backgroundColor = p.bgDeep;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.bg);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // 키보드 · 화면 전환 사이에 비치는 맨 아래 바탕
    const paint = (m: ThemeMode) => {
      if (Platform.OS !== 'web') SystemUI.setBackgroundColorAsync(paletteFor(m).bg).catch(() => {});
      paintWeb(m);
    };
    paint(getThemeMode());
    const off = subscribeThemeMode(paint);
    AccessibilityInfo.isReduceMotionEnabled().then((r) => { reduceMotion = r; }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (r) => { reduceMotion = r; });
    return () => {
      off();
      sub.remove();
    };
  }, []);

  return (
    <View style={styles.fill}>
      {children}
      <ThemeVeil />
      <ThemeStatusBar />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
