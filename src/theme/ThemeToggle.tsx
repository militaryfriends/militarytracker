/**
 * 머리줄 오른쪽 라이트 · 다크 토글 — 동그라미 하나.
 * 누르면 동그라미가 톡 눌렸다 튕기고, 해가 돌며 사라지고 달이 돌며 나타난다 (반대도). 연달아 눌러도 그때마다 바로 바뀐다.
 * 해 · 달은 누르는 그 순간 화면 스레드에서 돌기 시작한다 — 앱이 새 색을 그리는 동안에도 멈추지 않는다.
 */
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { SPRING } from '../ui/motion';
import { toggleTheme } from './ThemeProvider';
import { colors, getThemeMode, useThemeMode } from './tokens';

const SIZE = 34;
const SUN = '#F59E0B';
const SPIN = { duration: 260, easing: Easing.out(Easing.cubic) };

export function ThemeToggle() {
  const isDark = useThemeMode() === 'dark';
  const reduce = useReducedMotion();
  const pos = useSharedValue(isDark ? 1 : 0);
  /** 해(0) · 달(1) 중 지금 향하는 쪽 — 누른 토글은 이미 움직이고 있으니 다시 시작하지 않는다 */
  const target = useRef(isDark ? 1 : 0);
  const press = useSharedValue(1);
  const twinkle = useSharedValue(0.3);

  // 다른 곳(MY › 화면 · 기기 설정)에서 바뀌었을 때
  useEffect(() => {
    const t = isDark ? 1 : 0;
    if (target.current === t) return;
    target.current = t;
    pos.value = withTiming(t, SPIN);
  }, [isDark, pos]);

  useEffect(() => {
    if (!isDark || reduce) return;
    twinkle.value = withRepeat(
      withSequence(withTiming(1, { duration: 900 }), withTiming(0.25, { duration: 1300, easing: Easing.inOut(Easing.quad) })),
      -1,
    );
  }, [isDark, reduce, twinkle]);

  const circleStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const sunStyle = useAnimatedStyle(() => ({
    opacity: 1 - pos.value,
    transform: [{ rotate: `${interpolate(pos.value, [0, 1], [0, -100])}deg` }, { scale: interpolate(pos.value, [0, 1], [1, 0.4]) }],
  }));
  const moonStyle = useAnimatedStyle(() => ({
    opacity: pos.value,
    transform: [{ rotate: `${interpolate(pos.value, [0, 1], [100, 0])}deg` }, { scale: interpolate(pos.value, [0, 1], [0.4, 1]) }],
  }));
  const starStyle = useAnimatedStyle(() => ({ opacity: pos.value * twinkle.value }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: isDark }}
      accessibilityLabel="다크 모드"
      hitSlop={6}
      onPressIn={() => {
        press.value = withTiming(0.84, { duration: 80 });
      }}
      onPressOut={() => {
        press.value = withSpring(1, SPRING.press);
      }}
      onPress={() => {
        // 아이콘부터 (화면 스레드) — 그다음 앱 색을 바꾼다
        const t = getThemeMode() === 'dark' ? 0 : 1;
        target.current = t;
        pos.value = withTiming(t, SPIN);
        toggleTheme();
      }}
      style={styles.hit}
    >
      <Animated.View style={[styles.circle, { backgroundColor: colors.track, borderColor: colors.line }, circleStyle]}>
        <Animated.View style={[styles.star, { left: 8, top: 9 }, starStyle]} />
        <Animated.View style={[styles.star, { right: 8, top: 12, width: 1.5, height: 1.5 }, starStyle]} />
        <Animated.View style={[styles.star, { left: 11, bottom: 8, width: 1.5, height: 1.5 }, starStyle]} />
        <Animated.View style={[styles.icon, sunStyle]}>
          <Ionicons name="sunny" size={18} color={SUN} />
        </Animated.View>
        <Animated.View style={[styles.icon, moonStyle]}>
          <Ionicons name="moon" size={15} color={colors.ink} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  circle: {
    width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  icon: { position: 'absolute' },
  star: { position: 'absolute', width: 2, height: 2, borderRadius: 1, backgroundColor: '#FFFFFF' },
});
