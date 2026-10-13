/**
 * 진행 고리 (0~1) — 휴식 타이머 · 주간 목표. progress 가 바뀌면 화면 스레드에서 따라간다.
 * animate=false 면 받은 값 그대로 (매 프레임 값을 넣는 타이머용).
 */
import { useEffect } from 'react';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useAnimatedProps, useSharedValue, withSpring } from 'react-native-reanimated';
import { colors, useThemeMode } from '../theme/tokens';
import { SPRING } from './motion';

const ACircle = Animated.createAnimatedComponent(Circle);

export function ProgressRing({
  size, stroke = 6, progress, color, track, animate = true,
}: { size: number; stroke?: number; progress: number; color?: string; track?: string; animate?: boolean }) {
  useThemeMode();
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  const p = useSharedValue(clamped);
  useEffect(() => {
    p.value = animate ? withSpring(clamped, SPRING.fill) : clamped;
  }, [clamped, animate, p]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - p.value) }));
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track ?? colors.track} strokeWidth={stroke} />
      <ACircle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color ?? colors.accent} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${len} ${len}`} animatedProps={props}
      />
    </Svg>
  );
}
