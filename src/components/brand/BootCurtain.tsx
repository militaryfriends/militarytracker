/**
 * 부팅 커튼 — 자동 로그인으로 켤 때 스플래시와 홈 사이.
 *
 * 스플래시와 똑같은 장면(검정 바탕 + 흰 로고, SPLASH_FRAME 자리)을 그려 두고 스플래시를 걷는다 → 사용자에겐 그대로.
 * 잠깐 뒤(아래에서 홈이 그려질 틈) 로고가 살짝 커지며 커튼째 사라져 홈이 드러난다.
 * 동작 줄이기면 커지지 않고 사라지기만 한다.
 */
import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming,
} from 'react-native-reanimated';
import { BrandMark } from './BrandMark';
import { SPLASH_DY, SPLASH_FRAME } from './geometry';
import { HANDOFF } from './intro';
import { hideSplash } from './splash';
import { D } from '../auth/palette';

const HOLD = 220;   // 스플래시가 걷히는 200ms + 아래 화면이 그려질 틈
const OUT = 420;

export function BootCurtain({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  const started = useRef(false);

  const start = () => {
    if (started.current) return;
    started.current = true;
    // 같은 장면이 그려진 다음 프레임에 스플래시를 걷는다
    requestAnimationFrame(hideSplash);
    p.value = withDelay(HOLD, withTiming(1, { duration: reduce ? 260 : OUT, easing: Easing.in(Easing.cubic) }, (fin) => {
      if (fin) runOnJS(onDone)();
    }));
  };

  // 레이아웃 이벤트가 오지 않는 경우에도 커튼이 남지 않게
  useEffect(() => {
    const t = setTimeout(start, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wrap = useAnimatedStyle(() => ({ opacity: 1 - p.value }));
  const logo = useAnimatedStyle(() => ({
    transform: [{ translateY: SPLASH_DY }, { scale: reduce ? 1 : 1 + 0.22 * p.value }],
  }), [reduce]);

  return (
    <Animated.View style={[styles.fill, wrap]} onLayout={start}>
      <StatusBar style="light" />
      <Animated.View style={logo}>
        <BrandMark size={SPLASH_FRAME.size} timeline={HANDOFF} texture={0} still />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute', left: 0, top: 0, right: 0, bottom: 0,
    backgroundColor: D.bg, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
  },
});
