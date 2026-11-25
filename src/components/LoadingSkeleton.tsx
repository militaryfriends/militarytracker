/** 불러오는 동안의 자리 표시 — 빈 상태 문구 · 회전 표시 대신 화면 모양만 회색으로(검수 2) */
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors, themed, useThemeMode } from '../theme';
import { useReducedMotion } from 'react-native-reanimated';

export function LoadingSkeleton() {
  useThemeMode();
  const reduce = useReducedMotion();
  const a = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(a, { toValue: 0.5, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [a, reduce]);
  return (
    <Animated.View style={[s.wrap, { opacity: a }]} accessibilityLabel="불러오는 중" accessibilityRole="progressbar">
      <View style={s.row}>
        <View style={s.avatar} />
        <View style={{ flex: 1, gap: 10, paddingTop: 30 }}>
          <View style={[s.line, { width: '50%' }]} />
          <View style={s.num} />
          <View style={[s.line, { width: '80%' }]} />
          <View style={[s.line, { width: '70%' }]} />
        </View>
      </View>
      <View style={s.card} />
      <View style={[s.card, { height: 90 }]} />
    </Animated.View>
  );
}

const s = themed(() => StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 16, gap: 14 },
  row: { flexDirection: 'row', gap: 14 },
  avatar: { width: 140, height: 230, borderRadius: 28, backgroundColor: colors.panel2 },
  line: { height: 12, borderRadius: 6, backgroundColor: colors.panel2 },
  num: { height: 44, width: '60%', borderRadius: 10, backgroundColor: colors.panel2 },
  card: { height: 140, borderRadius: 24, backgroundColor: colors.panel2 },
}));
