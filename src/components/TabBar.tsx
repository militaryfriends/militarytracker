/**
 * 떠 있는 알약 탭(B3) — 오늘 · 운동 · 코치 · 식단 · 내 몸.
 * 화면 위에 떠 있어 내용이 그 밑으로 지나간다 → 탭 화면의 스크롤 끝에는 useTabSpace() 만큼 여백을 둔다.
 * '종목과 자세'(form)는 탭에 없고 운동 탭 안의 한 갈래다 — 그 화면에서도 '운동'이 켜진다.
 * 빨강은 지금 있는 탭 하나에만(레드 포인트 규칙).
 * 모션: 켜진 탭 뒤의 판이 스프링으로 미끄러져 옮겨 가고(SPRING.snap), 새로 켜진 아이콘이 한 번 튄다. 누르면 살짝 눌린다.
 */
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { Tabs } from 'expo-router';
import { colors, themed, useThemeMode } from '../theme';
import { haptic, PressableScale, PRESS_SCALE, SPRING } from '../ui';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

// 아이콘은 앱 다른 곳과 같은 기본 세트(Ionicons) — 11/26 직접 그린 세트(TabIcons)는 작고 가늘어 11/28 대표 결정으로 되돌림
const ITEMS: readonly { route: string; label: string; on: IoniconName; off: IoniconName }[] = [
  { route: 'home', label: '오늘', on: 'home', off: 'home-outline' },
  { route: 'plan', label: '운동', on: 'barbell', off: 'barbell-outline' },
  { route: 'coach', label: '코치', on: 'chatbubble-ellipses', off: 'chatbubble-ellipses-outline' },
  { route: 'diet', label: '식단', on: 'restaurant', off: 'restaurant-outline' },
  { route: 'my', label: '내 몸', on: 'body', off: 'body-outline' },
];
/** 탭에 없는 화면 → 켜 둘 탭 */
const ALIAS: Record<string, string> = { form: 'plan' };

const BAR_H = 62;
const GAP = 10;
const PAD = 6; // 바 안쪽 여백 (+ 테두리 1)
const ITEM_GAP = 2;

/** 탭 아이콘 — 켜지는 순간 한 번 튄다 */
function TabIcon({ on, name }: { on: boolean; name: IoniconName }) {
  const k = useSharedValue(1);
  const was = useRef(on);
  useEffect(() => {
    if (on && !was.current) k.value = withSequence(withTiming(0.82, { duration: 70 }), withSpring(1, SPRING.bounce));
    was.current = on;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: k.value }] }));
  return (
    <Animated.View style={anim}>
      <Ionicons name={name} size={21} color={on ? colors.redText : colors.mid} />
    </Animated.View>
  );
}

/** 떠 있는 탭이 가리는 높이 — 탭 화면의 스크롤 끝 여백 · 아래 고정 버튼의 bottom 에 쓴다 */
export function useTabSpace(): number {
  const insets = useSafeAreaInsets();
  return BAR_H + GAP + Math.max(insets.bottom, 12);
}

/** TabFade 가 탭 · 버튼 위로 올라오는 높이 — 스크롤 끝 여백을 이만큼 더 둔다 */
export const FADE_RISE = 44;

/**
 * 떠 있는 탭(과 그 위 고정 버튼) 밑으로 지나가는 내용을 바탕색으로 서서히 가린다.
 * 탭 화면의 스크롤 뒤 · 고정 버튼 앞에 둔다. extra = 탭 위에 떠 있는 버튼이 차지하는 높이.
 * (11/27 화면 점검 — 운동 탭에서 '운동 시작' 버튼이 아래 버튼 · 안내문 글자와 겹쳐 보였다)
 */
export function TabFade({ extra = 0 }: { extra?: number }) {
  useThemeMode();
  const tabSpace = useTabSpace();
  // 탭(또는 그 위 버튼)의 윗선에 닿기 전 FADE_RISE 만큼에서 거의 다 가린다 — 버튼 뒤로 윤곽이 비치지 않게
  const h = tabSpace + FADE_RISE + extra;
  return (
    <View pointerEvents="none" style={[s.fade, { height: h }]}>
      <LinearGradient colors={[`${colors.bg}00`, `${colors.bg}F2`, colors.bg]} locations={[0, FADE_RISE / h, 1]} style={s.fadeFill} />
    </View>
  );
}

export function FloatingTabBar({ state, navigateToTab, hidden }: TabBarProps & { hidden?: boolean }) {
  useThemeMode();
  const insets = useSafeAreaInsets();
  const cur = state.routes[state.index]?.name ?? 'home';
  const active = ALIAS[cur] ?? cur;
  const idx = Math.max(0, ITEMS.findIndex((it) => it.route === active));
  // 켜진 탭 뒤의 판 — 바 너비를 재서 칸 하나의 폭 · 자리를 구한다
  const [barW, setBarW] = useState(0);
  const slot = barW > 0 ? (barW - (PAD + 1) * 2 - ITEM_GAP * (ITEMS.length - 1)) / ITEMS.length : 0;
  const x = useSharedValue(0);
  const placed = useRef(false);
  useEffect(() => {
    if (slot <= 0) return;
    const to = idx * (slot + ITEM_GAP);
    // 처음 자리를 잡을 때는 바로, 그 뒤로는 미끄러져
    x.value = placed.current ? withSpring(to, SPRING.snap) : to;
    placed.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, slot]);
  const blob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  if (hidden) return null;
  return (
    <View pointerEvents="box-none" style={[s.wrap, { bottom: Math.max(insets.bottom, 12) }]}>
      <View style={s.bar} accessibilityRole="tablist" onLayout={(e) => setBarW(e.nativeEvent.layout.width)}>
        {slot > 0 ? <Animated.View pointerEvents="none" style={[s.blob, { width: slot }, blob]} /> : null}
        {ITEMS.map((it) => {
          const on = it.route === active;
          const route = state.routes.find((r) => r.name === it.route);
          return (
            <PressableScale
              key={it.route}
              haptic={false}
              scaleTo={PRESS_SCALE.small}
              style={s.item}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={it.label}
              onPress={() => {
                if (!route) return;
                // 다른 화면(운동 › 종목과 자세 포함)에 있을 때만 옮긴다
                if (cur !== it.route) {
                  haptic.select();
                  navigateToTab(route.key);
                }
              }}
            >
              <TabIcon on={on} name={on ? it.on : it.off} />
              <Text style={[s.label, on && s.labelOn]} allowFontScaling={false}>{it.label}</Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  wrap: { position: 'absolute', left: 14, right: 14, alignItems: 'center' },
  bar: {
    width: '100%', maxWidth: 452, height: BAR_H, padding: PAD, flexDirection: 'row', gap: ITEM_GAP,
    borderRadius: BAR_H / 2, backgroundColor: colors.float, borderWidth: 1, borderColor: colors.line2,
    ...Platform.select({
      web: { boxShadow: `0 12px 32px ${colors.shadow}` } as object,
      default: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
    }),
  },
  item: { flex: 1, borderRadius: 25, alignItems: 'center', justifyContent: 'center', gap: 2 },
  // 켜진 탭은 빨강(11/15 B3 · 대표 휴대폰 화면 기준, 11/28 되돌림) — 11/25 '빨강은 큰 버튼에만'으로 회색 판이 됐는데 바와 색이 같아 거의 안 보였다
  blob: { position: 'absolute', left: PAD, top: PAD, bottom: PAD, borderRadius: 25, backgroundColor: colors.redSoft },
  label: { fontSize: 10.5, fontWeight: '600', color: colors.mid },
  labelOn: { color: colors.redText, fontWeight: '700' },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  fadeFill: { flex: 1 },
}));
