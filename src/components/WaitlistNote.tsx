/**
 * 사전 신청(대기자) 무료 자격이 확인됐는데 아직 시작 전이면 홈에서 한 줄로 알려 준다(2026-11-28 대표 결정 · 문구).
 * 무료 기간은 결제 수단을 등록해야 시작된다 — 누르면 구독 화면. 시작하면(스토어 구독이 생기면) 저절로 사라진다.
 */
import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, themed, useThemeMode } from '../theme';
import { PressableScale } from '../ui';
import { useEntitlement } from '../hooks/useEntitlement';
import { OFFER_LABEL, waitlistOffer, mockWaitlist, mockFlag } from '../utils/waitlistOffer';
import { showAlert } from '../utils/alert';

export function WaitlistNote() {
  useThemeMode();
  const router = useRouter();
  const { sub, pro: realPro } = useEntitlement();
  // ⚠️ 임시 미리보기 — ?mockWaitlist 면 구독 전 계정처럼, mockAlert=1 이면 가입 확인 알림도 띄운다(session.ts 와 같은 문구)
  const pro = mockWaitlist() ? false : realPro;
  useEffect(() => {
    const m = mockWaitlist();
    if (!m || !mockFlag('mockAlert')) return;
    showAlert('대기자 명단에 있으시네요!', `결제 수단을 등록하시면 ${OFFER_LABEL[m]}이 무료로 지급됩니다. 언제든 취소하실 수 있습니다.`, [
      { text: '나중에', style: 'cancel' },
      { text: `${OFFER_LABEL[m]} 무료 받기`, onPress: () => router.push('/subscribe') },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const offer = pro ? null : waitlistOffer(sub);
  if (!offer) return null;
  const label = OFFER_LABEL[offer];
  return (
    <PressableScale onPress={() => router.push('/subscribe')} style={s.box} accessibilityRole="button"
      accessibilityLabel={`대기자 명단 혜택 ${label} 무료 받기`}>
      <Text style={s.title}>대기자 명단에 있으시네요! {label} 무료 혜택이 있어요</Text>
      <Text style={s.sub}>결제 수단을 등록하시면 바로 지급됩니다 · 언제든 취소하실 수 있어요 ›</Text>
    </PressableScale>
  );
}

const s = themed(() => StyleSheet.create({
  box: { borderWidth: 1, borderColor: colors.line2, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 14 },
  title: { fontSize: 13.5, fontWeight: '700', color: colors.ink },
  sub: { fontSize: 12, color: colors.mid, marginTop: 4, lineHeight: 17 },
}));
