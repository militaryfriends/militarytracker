/**
 * 폭죽 — PR 갱신 · 운동 저장 · 주간 목표 달성 때 그 자리에서 작은 조각들이 튀어 올랐다 떨어진다 (+ success 진동).
 * 앱 맨 위에 <ConfettiLayer /> 하나, 어디서든 celebrate({ x, y }). 동작 줄이기면 진동만.
 */
import { Fragment, useEffect, useState } from 'react';
import { AccessibilityInfo, Dimensions, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { colors, partTint } from '../theme/tokens';
import { haptic } from './haptics';

type Burst = { id: number; x: number; y: number; n: number; palette: string[] };
let push: ((b: Omit<Burst, 'id'>) => void) | null = null;
let seq = 0;

/** 그 자리(화면 좌표)에서 폭죽 */
export function celebrate(origin?: { x: number; y: number }, n = 36) {
  haptic.success();
  // 터지는 순간의 모드 색으로 (모노: 글자색 · PR 금색 · 완료색 + 부위 색 둘)
  const palette = [colors.ink, colors.pr, colors.good, partTint.chest, partTint.shoulders, colors.mid];
  AccessibilityInfo.isReduceMotionEnabled()
    .then((reduce) => {
      if (reduce) return;
      const { width, height } = Dimensions.get('window');
      push?.({ x: origin?.x ?? width / 2, y: origin?.y ?? height / 3, n, palette });
    })
    .catch(() => {});
}

function Piece({ x, y, i, palette }: { x: number; y: number; i: number; palette: string[] }) {
  const t = useSharedValue(0);
  const [p] = useState(() => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const sp = 140 + Math.random() * 160;
    return {
      dx: Math.cos(a) * sp,
      dy: Math.sin(a) * sp,
      fall: 260 + Math.random() * 200,
      rot: (Math.random() - 0.5) * 900,
      w: 5 + Math.random() * 5,
      h: 3 + Math.random() * 6,
      round: Math.random() < 0.35,
      color: palette[(i + Math.floor(Math.random() * palette.length)) % palette.length],
      delay: Math.random() * 60,
    };
  });
  useEffect(() => {
    t.value = withDelay(p.delay, withTiming(1, { duration: 1500 + (i % 5) * 60, easing: Easing.out(Easing.quad) }));
  }, [p.delay, i, t]);
  const style = useAnimatedStyle(() => {
    const k = t.value;
    return {
      opacity: k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25,
      transform: [
        { translateX: x + p.dx * k },
        { translateY: y + p.dy * k + p.fall * k * k },
        { rotate: `${p.rot * k}deg` },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        { position: 'absolute', left: -p.w / 2, top: -p.h / 2, width: p.w, height: p.h, borderRadius: p.round ? p.w : 1.5, backgroundColor: p.color },
        style,
      ]}
    />
  );
}

export function ConfettiLayer() {
  const [bursts, setBursts] = useState<Burst[]>([]);
  useEffect(() => {
    push = (b) => {
      const id = ++seq;
      setBursts((all) => [...all, { ...b, id }]);
      setTimeout(() => setBursts((all) => all.filter((x) => x.id !== id)), 2000);
    };
    return () => {
      push = null;
    };
  }, []);
  if (!bursts.length) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {bursts.map((b) => (
        <Fragment key={b.id}>
          {Array.from({ length: b.n }, (_, i) => <Piece key={i} x={b.x} y={b.y} i={i} palette={b.palette} />)}
        </Fragment>
      ))}
    </View>
  );
}
