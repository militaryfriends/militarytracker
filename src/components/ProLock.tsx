import { View, Text, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, themed, useThemeMode } from '../theme';
import { Feature, FEATURE_LABEL, FEATURE_DESC } from '../config/entitlements';

/** 목록·헤더 옆에 붙이는 작은 PRO 표식 */
export function ProBadge({ style }: { style?: StyleProp<ViewStyle> }) {
  useThemeMode();
  return (
    <View style={[s.badge, style]}>
      <Text style={s.badgeTxt}>PRO</Text>
    </View>
  );
}

/**
 * 유료 기능 자리를 대신 채우는 카드.
 * 기능을 숨기지 않고 무엇이 잠겨 있는지 보여 준 뒤 구독 화면으로 보낸다.
 */
export function ProLock({
  feature, title, desc, cta = '구독하고 사용하기', style,
}: {
  feature: Feature;
  title?: string;
  desc?: string;
  cta?: string;
  style?: StyleProp<ViewStyle>;
}) {
  useThemeMode();
  const router = useRouter();
  return (
    <View style={[s.card, style]}>
      <View style={s.head}>
        <Text style={s.lock}>🔒</Text>
        <Text style={s.title}>{title ?? FEATURE_LABEL[feature]}</Text>
        <ProBadge />
      </View>
      <Text style={s.desc}>{desc ?? FEATURE_DESC[feature]}</Text>
      <TouchableOpacity activeOpacity={0.7} style={s.btn} onPress={() => router.push(`/subscribe?f=${feature}`)}>
        <Text style={s.btnTxt}>{cta}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  badge: {
    backgroundColor: colors.panel3, borderRadius: 5,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 0.5, borderColor: colors.line2,
  },
  badgeTxt: { fontSize: 10, fontWeight: '800', color: colors.mid, letterSpacing: 0.6 },

  card: {
    backgroundColor: colors.panel, borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: colors.line, marginBottom: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lock: { fontSize: 13 },
  title: { fontSize: 14.5, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  desc: { fontSize: 12.5, color: colors.muted, lineHeight: 19, marginTop: 8 },
  btn: {
    backgroundColor: colors.ink, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center', marginTop: 14,
  },
  btnTxt: { fontSize: 13.5, fontWeight: '700', color: colors.bg },
}));

export default ProLock;
