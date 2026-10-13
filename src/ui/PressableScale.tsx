/**
 * 누르면 살짝 눌렸다가 스프링처럼 튕기는 버튼 (+ 톡 진동). TouchableOpacity 대신 쓴다.
 * 일반 Pressable 처럼 쓴다. scaleTo: 눌렸을 때 크기 (PRESS_SCALE.card 0.98 · button 0.96 · small 0.94)
 * haptic: 누를 때 진동 뜻 (haptics.ts) — false 면 없음. 기본 'tap'.
 */
import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useThemeMode } from '../theme/tokens';
import { haptic as buzz, type HapticKind } from './haptics';
import { DURATION, PRESS_SCALE, SPRING } from './motion';

const APressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  haptic?: HapticKind | false;
  children?: ReactNode;
};

export function PressableScale({
  style, scaleTo = PRESS_SCALE.button, haptic = 'tap', onPressIn, onPressOut, onPress, disabled, children, ...rest
}: Props) {
  useThemeMode();
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <APressable
      accessibilityRole="button"
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        s.value = withTiming(scaleTo, { duration: DURATION.pressIn });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.value = withSpring(1, SPRING.press);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) buzz[haptic]();
        onPress?.(e);
      }}
      style={[style, anim, disabled ? { opacity: 0.4 } : null]}
    >
      {children}
    </APressable>
  );
}
