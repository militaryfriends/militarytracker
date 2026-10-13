/** 불러오는 동안의 자리 표시 — 숨 쉬듯 밝아졌다 어두워진다 (동작 줄이기면 멈춤) */
import { useEffect } from 'react';
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { colors, useThemeMode } from '../theme/tokens';

export function Skeleton({
  height, width = '100%', radius = 16, style,
}: { height: number; width?: DimensionValue; radius?: number; style?: StyleProp<ViewStyle> }) {
  useThemeMode();
  const reduce = useReducedMotion();
  const o = useSharedValue(0.55);
  useEffect(() => {
    if (reduce) return;
    o.value = withRepeat(withTiming(1, { duration: 750, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [o, reduce]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      accessibilityLabel="불러오는 중"
      style={[{ height, width, borderRadius: radius, backgroundColor: colors.panel3 }, style, anim]}
    />
  );
}
