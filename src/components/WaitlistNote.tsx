/**
 * 사전 신청(대기자) 무료 자격이 확인됐는데 아직 시작 전이면 홈에서 한 줄로 알려 준다(2026-11-28 대표 결정 · 문구).
 * 무료 기간은 결제 수단을 등록해야 시작된다 — 누르면 구독 화면. 시작하면(스토어 구독이 생기면) 저절로 사라진다.
 */
import { StyleSheet } from 'react-native';
import { Text } from './Text';
import { useRouter } from 'expo-router';
import { colors, themed, useThemeMode } from '../theme';
import { PressableScale } from '../ui';
import { useEntitlement } from '../hooks/useEntitlement';
import { OFFER_LABEL, waitlistOffer } from '../utils/waitlistOffer';

export function WaitlistNote() {
  useThemeMode();
  const router = useRouter();
  const { sub, pro } = useEntitlement();
  const offer = pro ? null : waitlistOffer(sub);
  if (!offer) return null;
  const label = OFFER_LABEL[offer];
  return (
    <PressableScale onPress={() => router.push('/subscribe')} style={s.box} accessibilityRole="button"
      accessibilityLabel={`대기자 명단 혜택 ${label} 무료 받기`}>
      <Text style={s.title}>대기자 명단에 있으시네요! {label} 무료 혜택이 있어요</Text>
      <Text style={s.sub}>결제 수단을 등록하시면 바로 지급 · 언제든 취소 가능 ›</Text>
    </PressableScale>
  );
}

const s = themed(() => StyleSheet.create({
  box: { borderWidth: 1, borderColor: colors.line2, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 14 },
  title: { fontSize: 13.5, fontWeight: '700', color: colors.ink },
  sub: { fontSize: 12, color: colors.mid, marginTop: 4, lineHeight: 17 },
}));
