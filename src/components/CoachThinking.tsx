/**
 * 코치가 답을 쓰는 동안 — 말풍선 자리에 움직이는 점 세 개 + 지금 무엇을 하는지 한 줄.
 * 답은 서버가 검증까지 마친 뒤 한 번에 오므로(글자 단위로 흘려보내지 않는다) 기다림을 단계로 보여 준다.
 * 줄은 시간으로 넘어간다: 질문 읽기 → 기록 확인 → 답 쓰기 → (길어지면) 조금 더.
 * 동작 줄이기면 점은 멈추고 글만 바뀐다. 화면 낭독기는 줄이 바뀔 때 읽는다.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { colors, themed, useThemeMode } from '../theme';

const STEPS: readonly [number, string][] = [
  [0, '질문을 읽고 있어요'],
  [1800, '운동 · 식단 기록을 확인하고 있어요'],
  [4500, '답을 쓰고 있어요'],
  [12000, '조금 더 걸리고 있어요. 곧 답해 드릴게요'],
];

function Dot({ i, still }: { i: number; still: boolean }) {
  useThemeMode();
  const v = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    v.value = withDelay(i * 160, withRepeat(withSequence(
      withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 320, easing: Easing.in(Easing.quad) }),
      withTiming(0, { duration: 360 }),
    ), -1));
  }, [i, still, v]);
  const a = useAnimatedStyle(() => ({ opacity: 0.35 + v.value * 0.65, transform: [{ translateY: -4 * v.value }] }));
  return <Animated.View style={[s.dot, a]} />;
}

export function CoachThinking() {
  useThemeMode();
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timers = STEPS.slice(1).map(([ms], k) => setTimeout(() => setStep(k + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, []);
  return (
    <View style={s.wrap} accessible accessibilityLiveRegion="polite" accessibilityLabel={STEPS[step][1]}>
      <View style={s.dots}>
        {[0, 1, 2].map((i) => <Dot key={i} i={i} still={!!reduce} />)}
      </View>
      <Text style={s.txt}>{STEPS[step][1]}</Text>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start', maxWidth: '88%', flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: 22, borderBottomLeftRadius: 6,
    paddingHorizontal: 16, minHeight: 46,
  },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 18 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.mid },
  txt: { fontSize: 13.5, color: colors.mid, fontWeight: '600', flexShrink: 1 },
}));
