/**
 * 세그먼트 — 고른 칸 뒤의 판이 스프링으로 미끄러져 따라간다 (출렁임 없이, SPRING.snap) + selection 진동.
 * 화면 설정(시스템 · 라이트 · 다크), 기간 고르기 등.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { colors, themed, useThemeMode } from '../theme/tokens';
import { haptic } from './haptics';
import { SPRING } from './motion';

const PAD = 4;

export function Segmented<T extends string>({
  options, value, onChange, label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  useThemeMode();
  const [width, setWidth] = useState(0);
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const slot = width > 0 ? (width - PAD * 2) / options.length : 0;
  const x = useSharedValue(idx * slot);
  useEffect(() => {
    x.value = withSpring(idx * slot, SPRING.snap);
  }, [idx, slot, x]);
  const blob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth(w);
    x.value = idx * ((w - PAD * 2) / options.length);
  };
  return (
    <View style={s.wrap} onLayout={onLayout} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {slot > 0 && <Animated.View style={[s.blob, { width: slot }, blob]} />}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            style={s.item}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => {
              if (on) return;
              haptic.select();
              onChange(o.value);
            }}
          >
            <Text style={[s.txt, on && s.txtOn]} maxFontSizeMultiplier={1.3}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  wrap: {
    flexDirection: 'row', backgroundColor: colors.panel2, borderRadius: 12, padding: PAD,
    borderWidth: 1, borderColor: colors.line,
  },
  blob: {
    position: 'absolute', top: PAD, bottom: PAD, left: PAD, borderRadius: 9,
    backgroundColor: colors.panel3, borderWidth: 1, borderColor: colors.line2,
  },
  item: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  txt: { fontSize: 13.5, fontWeight: '600', color: colors.muted },
  txtOn: { color: colors.ink, fontWeight: '700' },
}));
