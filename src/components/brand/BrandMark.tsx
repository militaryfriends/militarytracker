/**
 * 로고 — 연기 질감 M(뒤) + 선으로 그리는 고리 + 흰 M(앞). 이미지 · 고리 위치는 scripts/brand-assets.py.
 *
 * clock 을 주면 인트로 시간표(intro.ts — timeline)대로 그려지고, 없으면 완성된 모습으로 시작한다.
 * phase: idle(6초마다 고리 위로 빛) · loading(고리가 진행 표시) · success(고리가 한 바퀴 완성).
 * still: 동작 줄이기 — 연기 흐름 · 빛 같은 반복 장식을 멈춘다(진행 표시는 정보라 남긴다).
 *
 * 색은 테마와 상관없이 다크 — 로그인 · 회원가입 화면은 항상 다크다(src/components/auth/palette.ts).
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, interpolate, useAnimatedProps, useAnimatedStyle, useSharedValue,
  withDelay, withRepeat, withSequence, withTiming, type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { ARC_LEFT, ARC_LEFT_LEN as LL, ARC_RIGHT, ARC_RIGHT_LEN as LR, RING, RING_FULL, RING_LEN } from './geometry';
import { INTRO, easeInOutCubic, easeOutCubic, seg, type Timeline } from './intro';

const APath = Animated.createAnimatedComponent(Path);
const ACircle = Animated.createAnimatedComponent(Circle);

const MARK = require('../../../assets/brand/m-mark.png');
const TEXTURE = require('../../../assets/brand/m-texture.png');
const INK = '#F4F4F5';
const styles = StyleSheet.create({ passThrough: { pointerEvents: 'none' } });

export type BrandPhase = 'idle' | 'loading' | 'success';

type Props = {
  size: number;
  clock?: SharedValue<number>;
  /** clock 이 따르는 시간표 — 처음부터 그리기(INTRO) · 스플래시 이어받기(HANDOFF) */
  timeline?: Timeline;
  phase?: BrandPhase;
  still?: boolean;
  /** 대기 빛이 처음 지나갈 때까지(ms) — 인트로를 줄여 시작하면 그만큼 당긴다 */
  glintDelay?: number;
  /** 연기 질감 진하기 0~1 */
  texture?: number;
};

export function BrandMark({ size, clock, timeline: T = INTRO, phase = 'idle', still = false, glintDelay = T.glint, texture = 0.45 }: Props) {
  const fallback = useSharedValue<number>(T.end);
  const t = clock ?? fallback;
  const drift = useSharedValue(0);
  const glint = useSharedValue(0);
  const load = useSharedValue(0);
  const done = useSharedValue(0);
  const loading = phase === 'loading';

  // 연기가 천천히 흐른다
  useEffect(() => {
    if (still) {
      cancelAnimation(drift);
      drift.value = 0;
      return;
    }
    drift.value = withDelay(1400, withRepeat(withTiming(1, { duration: 16000, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(drift);
  }, [still, drift]);

  useEffect(() => {
    cancelAnimation(glint);
    cancelAnimation(load);
    glint.value = 0;
    load.value = 0;
    if (phase === 'loading') {
      load.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.bezier(0.5, 0, 0.5, 1) }), -1);
    } else if (phase === 'idle' && !still) {
      glint.value = withDelay(glintDelay, withRepeat(withSequence(
        withTiming(1, { duration: 1800, easing: Easing.bezier(0.45, 0, 0.25, 1) }),
        withTiming(1, { duration: 4200 }),
        withTiming(0, { duration: 0 }),
      ), -1));
    }
    done.value = phase === 'success' ? withTiming(1, { duration: 420, easing: Easing.bezier(0.65, 0, 0.35, 1) }) : 0;
    return () => {
      cancelAnimation(glint);
      cancelAnimation(load);
    };
  }, [phase, still, glintDelay, glint, load, done]);

  const arcL = useAnimatedProps(() => ({
    strokeDashoffset: LL * 1.05 * (1 - easeInOutCubic(seg(t.value, T.arc.d, T.arc.dur))),
  }), [T]);
  const arcR = useAnimatedProps(() => ({
    strokeDashoffset: LR * 1.05 * (1 - easeInOutCubic(seg(t.value, T.arc.d, T.arc.dur))),
  }), [T]);
  // 빛 — 짧은 선이 위에서 아래로 흐른다. 로그인 중에는 더 길게 · 계속
  const glintL = useAnimatedProps(() => (loading
    ? { strokeDashoffset: LL * (0.38 - 1.42 * load.value), opacity: 1 }
    : { strokeDashoffset: LL * (0.2 - 1.24 * glint.value), opacity: glint.value > 0 && glint.value < 1 ? 1 : 0 }
  ), [loading]);
  const glintR = useAnimatedProps(() => (loading
    ? { strokeDashoffset: LR * (0.38 - 1.42 * load.value), opacity: 1 }
    : { strokeDashoffset: LR * (0.2 - 1.24 * glint.value), opacity: glint.value > 0 && glint.value < 1 ? 1 : 0 }
  ), [loading]);
  const shock = useAnimatedProps(() => {
    const p = seg(t.value, T.shock.d, T.shock.dur);
    const e = easeOutCubic(p);
    return { r: RING.r * (0.9 + 0.52 * e), opacity: p <= 0 || p >= 1 ? 0 : 0.6 * (1 - e) };
  }, [T]);
  const full = useAnimatedProps(() => ({
    strokeDashoffset: RING_LEN * 1.05 * (1 - done.value),
    opacity: done.value > 0 ? 1 : 0,
  }));

  const driftStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -0.02 * size * drift.value },
      { translateY: 0.015 * size * drift.value },
      { scale: 1 + 0.06 * drift.value },
    ],
  }));
  // 형광등처럼 깜빡이며 켜진다
  const texStyle = useAnimatedStyle(() => {
    const p = seg(t.value, T.ignite.d, T.ignite.dur);
    return {
      opacity: interpolate(p, [0, 0.28, 0.36, 0.44, 0.58, 0.72, 1], [0, 0.62, 0.12, 0.8, 0.3, 0.62, texture]),
      transform: [{ scale: 1.14 - 0.14 * easeOutCubic(p) }],
    };
  }, [T, texture]);
  // 찍히듯 내려앉는다 — 살짝 눌렸다가 튕긴다
  const markStyle = useAnimatedStyle(() => {
    const p = easeOutCubic(seg(t.value, T.stamp.d, T.stamp.dur));
    return {
      opacity: interpolate(p, [0, 0.55, 1], [0, 1, 1]),
      transform: [{ scale: interpolate(p, [0, 0.55, 0.76, 1], [1.42, 0.965, 1.014, 1]) }],
    };
  }, [T]);

  const box = { width: size, height: size };
  return (
    <View style={[box, styles.passThrough]}>
      <Animated.View style={[StyleSheet.absoluteFill, driftStyle]}>
        <Animated.Image source={TEXTURE} style={[box, texStyle]} />
      </Animated.View>
      <Svg width={size} height={size} viewBox="0 0 1024 1024" style={StyleSheet.absoluteFill}>
        <ACircle cx={RING.cx} cy={RING.cy} r={RING.r} fill="none" stroke={INK} strokeWidth={6} opacity={0} animatedProps={shock} />
        <APath d={ARC_LEFT} fill="none" stroke={INK} strokeWidth={RING.stroke} strokeLinecap="round" strokeDasharray={[LL, LL * 1.1]} animatedProps={arcL} />
        <APath d={ARC_RIGHT} fill="none" stroke={INK} strokeWidth={RING.stroke} strokeLinecap="round" strokeDasharray={[LR, LR * 1.1]} animatedProps={arcR} />
        <APath d={ARC_LEFT} fill="none" stroke="#FFFFFF" strokeWidth={15} strokeLinecap="round"
          strokeDasharray={loading ? [0.34 * LL, 2 * LL] : [0.16 * LL, 2 * LL]} opacity={0} animatedProps={glintL} />
        <APath d={ARC_RIGHT} fill="none" stroke="#FFFFFF" strokeWidth={15} strokeLinecap="round"
          strokeDasharray={loading ? [0.34 * LR, 2 * LR] : [0.16 * LR, 2 * LR]} opacity={0} animatedProps={glintR} />
        <APath d={RING_FULL} fill="none" stroke={INK} strokeWidth={RING.stroke} strokeLinecap="round"
          strokeDasharray={[RING_LEN, RING_LEN * 1.1]} opacity={0} animatedProps={full} />
      </Svg>
      <Animated.Image source={MARK} style={[StyleSheet.absoluteFill, box, markStyle]} />
    </View>
  );
}
