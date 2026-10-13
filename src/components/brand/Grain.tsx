/**
 * 필름 그레인 — 화면 전체에 아주 옅은 잡티가 0.14초마다 자리를 바꾼다(필름처럼).
 * 로그인 · 회원가입 바탕에만 쓴다. still 이면 멈춘다.
 */
import { useEffect } from 'react';
import { Image, StyleSheet } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

const GRAIN = require('../../../assets/brand/grain.png');
const SPOTS = [[0, 0], [-22, 14], [18, -9], [-9, -21], [13, 19]];

export function Grain({ still = false }: { still?: boolean }) {
  const step = useSharedValue(0);
  useEffect(() => {
    if (still) {
      cancelAnimation(step);
      step.value = 0;
      return;
    }
    step.value = withRepeat(withTiming(5, { duration: 700, easing: Easing.linear }), -1);
    return () => cancelAnimation(step);
  }, [still, step]);
  const style = useAnimatedStyle(() => {
    const v = step.value;
    const [x, y] = SPOTS[v >= 0 ? Math.min(4, Math.floor(v)) : 0];
    return { transform: [{ translateX: x }, { translateY: y }] };
  });
  return (
    <Animated.View style={[styles.grain, style]}>
      <Image source={GRAIN} resizeMode="repeat" style={styles.fill} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  grain: { position: 'absolute', left: -40, top: -40, right: -40, bottom: -40, pointerEvents: 'none' },
  fill: { width: '100%', height: '100%' },
});
