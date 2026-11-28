import { ReactNode } from 'react';
import {
  View, StyleSheet, ActivityIndicator,
  ScrollView, StyleProp, ViewStyle, TextStyle,
} from 'react-native';
import { Text } from './Text';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, themed, useThemeMode } from '../theme';
import { useTabSpace } from './TabBar';
import { PressableScale } from '../ui';

export function Screen({ children }: { children: ReactNode }) {
  useThemeMode();
  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      {children}
    </SafeAreaView>
  );
}

/**
 * 뒤로가기 — 웹에서 새로고침한 뒤엔 히스토리가 없어 router.back() 이 아무 반응이 없다.
 * 그럴 땐 홈으로 보낸다. 모든 상세 화면의 `←` 가 이 훅을 쓴다.
 */
export function useSafeBack(fallback = '/tabs/home'): () => void {
  const router = useRouter();
  return () => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback as never);
  };
}

export function TopBar({
  title, meta, onBack, right,
}: { title: string; meta?: string; onBack?: () => void; right?: ReactNode }) {
  useThemeMode();
  return (
    <View style={s.topbar}>
      {onBack ? (
        <PressableScale
          onPress={onBack}
          hitSlop={12}
          style={s.backWrap}
          accessibilityRole="button"
          accessibilityLabel={`뒤로, ${title}`}
        >
          <Text style={s.back}>←</Text>
          <Text style={s.backTitle} numberOfLines={1} maxFontSizeMultiplier={1.4}>{title}</Text>
        </PressableScale>
      ) : (
        <Text style={s.title} accessibilityRole="header" maxFontSizeMultiplier={1.4}>{title}</Text>
      )}
      {right ?? (meta ? <Text style={s.meta} maxFontSizeMultiplier={1.3}>{meta}</Text> : null)}
    </View>
  );
}

export function Body({ children, style, tab }: { children: ReactNode; style?: StyleProp<ViewStyle>; /** 탭 화면 — 떠 있는 탭만큼 아래를 비운다 */ tab?: boolean }) {
  useThemeMode();
  // 안드로이드 전체 화면(edge-to-edge)에서 맨 아래 안내문이 시스템 내비게이션 바에 가려지지 않게(10/31 피드백 7-6)
  const insets = useSafeAreaInsets();
  const tabSpace = useTabSpace();
  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={[s.scrollInner, { paddingBottom: tab ? 24 + tabSpace : 40 + insets.bottom }, style]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  useThemeMode();
  return <View style={[s.card, style]}>{children}</View>;
}

export function SectionLabel({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  useThemeMode();
  return <Text style={[s.sectionLabel, style]} accessibilityRole="header">{children}</Text>;
}

export function PrimaryBtn({
  label, onPress, loading, disabled, style,
}: { label: string; onPress: () => void; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  useThemeMode();
  const off = loading || disabled;
  return (
    <PressableScale dimDisabled={false}
      style={[s.primary, off && s.off, style]}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
    >
      {loading ? <ActivityIndicator color={colors.onRed} /> : <Text style={s.primaryTxt}>{label}</Text>}
    </PressableScale>
  );
}

export function GhostBtn({
  label, onPress, loading, disabled, style,
}: { label: string; onPress: () => void; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  useThemeMode();
  const off = loading || disabled;
  return (
    <PressableScale dimDisabled={false}
      style={[s.ghost, off && s.off, style]}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
    >
      {loading ? <ActivityIndicator color={colors.mid} /> : <Text style={s.ghostTxt}>{label}</Text>}
    </PressableScale>
  );
}

/** 빈 상태 — 가능하면 다음 행동(cta)을 함께 준다 */
export function EmptyState({
  text, cta, onCta,
}: { text: string; cta?: string; onCta?: () => void }) {
  useThemeMode();
  return (
    <View style={s.empty}>
      <Text style={s.emptyTxt}>{text}</Text>
      {cta && onCta ? (
        <PressableScale style={s.emptyBtn} onPress={onCta} accessibilityRole="button">
          <Text style={s.emptyBtnTxt}>{cta}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  useThemeMode();
  return <Text style={s.notice}>{children}</Text>;
}

const s = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topbar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8, gap: 12, minHeight: 56,
  },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.5, flexShrink: 1 },
  backWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minHeight: 44 },
  back: { fontSize: 20, color: colors.ink, fontWeight: '600' },
  backTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  meta: { fontSize: 10, color: colors.muted, letterSpacing: 1, flexShrink: 0 },
  scroll: { flex: 1 },
  scrollInner: { paddingHorizontal: 16, paddingBottom: 40 },
  card: {
    backgroundColor: colors.panel, borderRadius: 22, padding: 18,
    borderWidth: 1, borderColor: colors.line, marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 10, fontWeight: '800', color: colors.muted,
    letterSpacing: 2, marginBottom: 10, marginTop: 8,
  },
  // 주 버튼 = 지금 할 한 가지 — 빨강 알약(B3 레드 포인트)
  primary: {
    backgroundColor: colors.red, borderRadius: 27,
    paddingVertical: 16, alignItems: 'center', justifyContent: 'center', minHeight: 54,
  },
  primaryTxt: { color: colors.onRed, fontSize: 16, fontWeight: '700' },
  ghost: {
    borderWidth: 1, borderColor: colors.line2, borderRadius: 26,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center', minHeight: 52,
  },
  ghostTxt: { color: colors.mid, fontSize: 14, fontWeight: '600' },
  off: { opacity: 0.4 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 16 },
  emptyTxt: { color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  emptyBtn: {
    backgroundColor: colors.red, borderRadius: 26, paddingHorizontal: 20,
    paddingVertical: 12, minHeight: 44, justifyContent: 'center',
  },
  emptyBtnTxt: { color: colors.onRed, fontSize: 14, fontWeight: '700' },
  notice: { fontSize: 11, color: colors.muted, lineHeight: 16, textAlign: 'center', marginTop: 4 },
}));
