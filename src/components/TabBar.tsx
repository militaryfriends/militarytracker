/**
 * 떠 있는 알약 탭(B3) — 오늘 · 운동 · 코치 · 식단 · 내 몸.
 * 화면 위에 떠 있어 내용이 그 밑으로 지나간다 → 탭 화면의 스크롤 끝에는 useTabSpace() 만큼 여백을 둔다.
 * '종목과 자세'(form)는 탭에 없고 운동 탭 안의 한 갈래다 — 그 화면에서도 '운동'이 켜진다.
 * 빨강은 지금 있는 탭 하나에만(레드 포인트 규칙).
 */
import type { ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { Tabs } from 'expo-router';
import { colors, themed, useThemeMode } from '../theme';
import { haptic } from '../ui';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

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

/** 떠 있는 탭이 가리는 높이 — 탭 화면의 스크롤 끝 여백 · 아래 고정 버튼의 bottom 에 쓴다 */
export function useTabSpace(): number {
  const insets = useSafeAreaInsets();
  return BAR_H + GAP + Math.max(insets.bottom, 12);
}

export function FloatingTabBar({ state, navigateToTab, hidden }: TabBarProps & { hidden?: boolean }) {
  useThemeMode();
  const insets = useSafeAreaInsets();
  if (hidden) return null;
  const cur = state.routes[state.index]?.name ?? 'home';
  const active = ALIAS[cur] ?? cur;
  return (
    <View pointerEvents="box-none" style={[s.wrap, { bottom: Math.max(insets.bottom, 12) }]}>
      <View style={s.bar} accessibilityRole="tablist">
        {ITEMS.map((it) => {
          const on = it.route === active;
          const route = state.routes.find((r) => r.name === it.route);
          return (
            <Pressable
              key={it.route}
              style={[s.item, on && s.itemOn]}
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
              <Ionicons name={on ? it.on : it.off} size={21} color={on ? colors.redText : colors.mid} />
              <Text style={[s.label, on && s.labelOn]} allowFontScaling={false}>{it.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  wrap: { position: 'absolute', left: 14, right: 14, alignItems: 'center' },
  bar: {
    width: '100%', maxWidth: 452, height: BAR_H, padding: 6, flexDirection: 'row', gap: 2,
    borderRadius: BAR_H / 2, backgroundColor: colors.float, borderWidth: 1, borderColor: colors.line2,
    ...Platform.select({
      web: { boxShadow: `0 12px 32px ${colors.shadow}` } as object,
      default: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
    }),
  },
  item: { flex: 1, borderRadius: 25, alignItems: 'center', justifyContent: 'center', gap: 2 },
  itemOn: { backgroundColor: colors.redSoft },
  label: { fontSize: 10.5, fontWeight: '600', color: colors.mid },
  labelOn: { color: colors.redText, fontWeight: '700' },
}));
