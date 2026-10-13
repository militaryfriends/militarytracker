/**
 * 말랑한 체크박스 — 누르면 칸이 톡 튀며 채워지고 체크가 그려진다 (+ 진동). 44pt 누를 자리.
 * 세트 완료 체크용 — 켤 때 haptic.set, 끌 때 haptic.tap.
 * onChange(next, 화면 좌표) — 좌표는 PR 폭죽 위치 등에 쓴다.
 */
import { useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  interpolateColor, useAnimatedProps, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { colors, useThemeMode } from '../theme/tokens';
import { haptic } from './haptics';
import { SPRING } from './motion';

const APath = Animated.createAnimatedComponent(Path);
const LEN = 24;

export function CheckBox({
  checked, onChange, label, disabled, size = 26,
}: {
  checked: boolean;
  onChange: (next: boolean, at?: { x: number; y: number }) => void;
  label: string;
  disabled?: boolean;
  size?: number;
}) {
  useThemeMode();
  const on = colors.accent;
  const off = colors.line2;
  const mark = colors.onAccent;
  const ref = useRef<View>(null);
  const v = useSharedValue(checked ? 1 : 0);
  const pop = useSharedValue(1);
  useEffect(() => {
    v.value = withTiming(checked ? 1 : 0, { duration: 260 });
    if (checked) pop.value = withSequence(withTiming(0.8, { duration: 80 }), withSpring(1, SPRING.pop));
  }, [checked, v, pop]);
  const boxStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(v.value, [0, 1], ['transparent', on]),
    borderColor: interpolateColor(v.value, [0, 1], [off, on]),
    transform: [{ scale: pop.value }],
  }));
  const pathProps = useAnimatedProps(() => ({ strokeDashoffset: LEN * (1 - v.value) }));
  return (
    <Pressable
      ref={ref}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={4}
      onPress={() => {
        if (checked) haptic.tap();
        else haptic.set();
        const node = ref.current;
        if (!node) return onChange(!checked);
        node.measureInWindow((x, y, w, h) => onChange(!checked, { x: x + w / 2, y: y + h / 2 }));
      }}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}
    >
      <Animated.View
        style={[{ width: size, height: size, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' }, boxStyle]}
      >
        <Svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24">
          <APath
            d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={mark} strokeWidth={3}
            strokeLinecap="round" strokeLinejoin="round" strokeDasharray={LEN} animatedProps={pathProps}
          />
        </Svg>
      </Animated.View>
    </Pressable>
  );
}
