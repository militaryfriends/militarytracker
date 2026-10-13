import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors, themed, useThemeMode } from '../src/theme';
import { Screen, TopBar, Body, SectionLabel, PrimaryBtn, useSafeBack } from '../src/components/ui';
import { showAlert } from '../src/utils/alert';
import { useAuthStore } from '../src/stores/authStore';
import { useEntitlement } from '../src/hooks/useEntitlement';
import {
  PRO_FEATURES, FEATURE_LABEL, FEATURE_DESC, FREE_HIGHLIGHTS,
  PRODUCTS, TRIAL_DAYS, PRO_NAME, Feature, LEGAL,
} from '../src/config/entitlements';
import {
  purchase, restore, startTrial, redeemPromo, canPurchase,
  BillingUnavailable, PromoError, EmailUnverified, STORE_BILLING_READY,
} from '../src/services/billingService';
import { resendVerification } from '../src/services/authService';
import { SUB_STATUS_LABEL } from '../src/utils/subscription';
import type { Subscription } from '../src/types';

/** '코치' → '코치는', '플랜' → '플랜은' — 받침 유무로 조사를 고른다 */
function eun(word: string): string {
  const ch = word.charCodeAt(word.length - 1);
  if (ch < 0xac00 || ch > 0xd7a3) return `${word}은(는)`;
  return (ch - 0xac00) % 28 === 0 ? `${word}는` : `${word}은`;
}

type Busy = null | 'buy' | 'trial' | 'promo' | 'restore';

export default function SubscribeScreen() {
  useThemeMode();
  const router = useRouter();
  const goBack = useSafeBack();
  const { f } = useLocalSearchParams<{ f?: string }>();
  const patchUser = useAuthStore((s) => s.patchUser);
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const { sub, pro, left } = useEntitlement();
  // 결제 SDK 연결 전엔 가격표·구매·복원·코드 입력을 숨긴다 (심사 거절 사유)
  const storeReady = STORE_BILLING_READY && Platform.OS !== 'web';

  const focus = PRO_FEATURES.includes(f as Feature) ? (f as Feature) : null;
  const [picked, setPicked] = useState(PRODUCTS.find((p) => p.best)?.id ?? PRODUCTS[0].id);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<Busy>(null);

  const trialAvailable = TRIAL_DAYS > 0 && !sub.trialUsed && !pro;

  function fail(e: unknown, fallback: string) {
    if (e instanceof EmailUnverified) {
      showAlert('이메일 인증 필요', `${e.message}\n인증 후 앱으로 돌아와 다시 눌러주세요.`, [
        { text: '닫기', style: 'cancel' },
        {
          text: '인증 메일 다시 보내기',
          onPress: () => resendVerification()
            .then(() => showAlert('발송 완료', '받은 메일함(스팸함 포함)을 확인해주세요.'))
            .catch(() => showAlert('발송 실패', '잠시 후 다시 시도해주세요.')),
        },
      ]);
      return;
    }
    const m = e instanceof BillingUnavailable || e instanceof PromoError ? e.message : fallback;
    showAlert('안내', m);
  }

  async function run(kind: Busy, fn: () => Promise<Subscription | null>, done: string, none?: string) {
    if (busy) return;
    setBusy(kind);
    try {
      const next = await fn();
      if (next) {
        patchUser({ sub: next });
        showAlert('완료', done, [{ text: '확인', onPress: () => router.back() }]);
      } else if (none) {
        // 예전엔 복원 실패가 무반응이었다 — 버튼이 눌리지 않았다고 느낀다
        showAlert('안내', none);
      }
    } catch (e) {
      fail(e, '처리하지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <TopBar title={PRO_NAME} meta="SUBSCRIPTION" onBack={goBack} />
      <Body>
        {pro ? (
          <View style={s.activeBox}>
            <Text style={s.activeLabel}>{isAdmin && sub.status === 'none' ? '관리자 계정' : SUB_STATUS_LABEL[sub.status]}</Text>
            <Text style={s.activeTxt}>
              {isAdmin && sub.status === 'none'
                ? '모든 기능을 제한 없이 사용합니다.'
                : left !== null ? `${left}일 남았습니다.` : '이용 기간에 제한이 없습니다.'}
            </Text>
            {sub.status === 'canceled' && (
              <Text style={s.activeSub}>해지가 예약되어 있어도 남은 기간은 그대로 사용합니다.</Text>
            )}
          </View>
        ) : (
          <Text style={s.lead}>
            {focus
              ? `${eun(FEATURE_LABEL[focus])} 구독 기능입니다.`
              : '기록은 계속 무료입니다. 개인화만 구독으로 열립니다.'}
          </Text>
        )}

        <SectionLabel>구독하면 열리는 기능</SectionLabel>
        {PRO_FEATURES.map((k) => (
          <View key={k} style={[s.row, focus === k && s.rowFocus]}>
            <View style={[s.dot, focus === k && s.dotFocus]} />
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>{FEATURE_LABEL[k]}</Text>
              <Text style={s.rowSub}>{FEATURE_DESC[k]}</Text>
            </View>
          </View>
        ))}

        <SectionLabel>구독하지 않아도 그대로</SectionLabel>
        <View style={s.freeBox}>
          {FREE_HIGHLIGHTS.map((t) => (
            <Text key={t} style={s.freeTxt}>· {t}</Text>
          ))}
        </View>

        {!pro && storeReady && (
          <>
            <SectionLabel>플랜 선택</SectionLabel>
            {PRODUCTS.map((p) => {
              const on = picked === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[s.plan, on && s.planOn]}
                  activeOpacity={0.8}
                  onPress={() => setPicked(p.id)}
                >
                  <View style={{ flex: 1 }}>
                    <View style={s.planHead}>
                      <Text style={[s.planLabel, on && s.planLabelOn]}>{p.label}</Text>
                      {p.best && <View style={s.bestTag}><Text style={s.bestTxt}>추천</Text></View>}
                    </View>
                    {p.note ? <Text style={s.planNote}>{p.note}</Text> : null}
                  </View>
                  <Text style={[s.planPrice, on && s.planPriceOn]}>
                    {p.price}<Text style={s.planPeriod}>{p.period}</Text>
                  </Text>
                </TouchableOpacity>
              );
            })}

            <PrimaryBtn
              label="구독 시작"
              loading={busy === 'buy'}
              disabled={!!busy || !canPurchase()}
              onPress={() => run('buy', () => purchase(picked), '구독이 시작되었습니다.')}
              style={{ marginTop: 6 }}
            />
          </>
        )}

        {!pro && trialAvailable && (
          <TouchableOpacity activeOpacity={0.7}
            style={[s.trialBtn, !storeReady && s.trialBtnPrimary]}
            disabled={!!busy}
            onPress={() => run('trial', startTrial, `${TRIAL_DAYS}일 무료 체험이 시작되었습니다.`)}
            accessibilityRole="button"
          >
            {busy === 'trial'
              ? <ActivityIndicator color={storeReady ? colors.ink : colors.bg} />
              : <Text style={[s.trialTxt, !storeReady && s.trialTxtPrimary]}>{TRIAL_DAYS}일 무료로 먼저 써보기</Text>}
          </TouchableOpacity>
        )}

        {!pro && !storeReady && (
          <Text style={s.comingSoon}>
            {Platform.OS === 'web'
              ? '구독 결제는 iOS·Android 앱에서 진행할 수 있습니다.'
              : '유료 구독은 곧 열립니다. 지금은 무료 체험으로 모든 기능을 써볼 수 있어요.'}
          </Text>
        )}

        {!pro && storeReady && (
          <>
            <SectionLabel>코드가 있다면</SectionLabel>
            <View style={s.codeRow}>
              <TextInput
                style={s.codeInput}
                placeholder="프로모션 코드"
                placeholderTextColor={colors.placeholder}
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
                autoCorrect={false}
                accessibilityLabel="프로모션 코드"
              />
              <TouchableOpacity activeOpacity={0.7}
                style={[s.codeBtn, !code.trim() && s.codeBtnOff]}
                disabled={!!busy || !code.trim()}
                onPress={() => run('promo', () => redeemPromo(code), '코드가 등록되었습니다.')}
                accessibilityRole="button"
                accessibilityState={{ disabled: !!busy || !code.trim() }}
              >
                {busy === 'promo'
                  ? <ActivityIndicator color={colors.bg} />
                  : <Text style={s.codeBtnTxt}>등록</Text>}
              </TouchableOpacity>
            </View>
          </>
        )}

        {storeReady && (
          <TouchableOpacity activeOpacity={0.7}
            style={s.restoreBtn}
            disabled={!!busy}
            onPress={() => run('restore', restore, '구독 정보를 불러왔습니다.', '복원할 구독이 없거나 연결에 실패했습니다.')}
            accessibilityRole="button"
          >
            <Text style={s.restoreTxt}>구매 복원</Text>
          </TouchableOpacity>
        )}

        <Text style={s.notice}>
          {Platform.OS === 'web'
            ? '웹에서는 미리보기만 제공합니다. 구독은 앱에서 진행해주세요.'
            : '구독은 기간 만료 24시간 전까지 해지하지 않으면 자동으로 갱신됩니다. 해지는 기기의 구독 관리 화면에서 언제든 할 수 있습니다.'}
        </Text>
        <View style={s.legalRow}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => Linking.openURL(LEGAL.terms)} hitSlop={10} accessibilityRole="link">
            <Text style={s.legalLink}>이용약관</Text>
          </TouchableOpacity>
          <Text style={s.legalDot}>·</Text>
          <TouchableOpacity activeOpacity={0.7} onPress={() => Linking.openURL(LEGAL.privacy)} hitSlop={10} accessibilityRole="link">
            <Text style={s.legalLink}>개인정보처리방침</Text>
          </TouchableOpacity>
        </View>
      </Body>
    </Screen>
  );
}

const s = themed(() => StyleSheet.create({
  lead: { fontSize: 14, color: colors.ink, lineHeight: 22, marginTop: 4, marginBottom: 4 },

  activeBox: {
    backgroundColor: colors.goodBg, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.goodLine, marginTop: 6,
  },
  activeLabel: { fontSize: 10, fontWeight: '800', color: colors.good, letterSpacing: 1.5 },
  activeTxt: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 6 },
  activeSub: { fontSize: 11.5, color: colors.muted, marginTop: 6, lineHeight: 18 },

  row: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: colors.panel, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.line, marginBottom: 8,
  },
  rowFocus: { borderColor: colors.line2, backgroundColor: colors.panel2 },
  dot: {
    width: 7, height: 7, borderRadius: 4, marginTop: 5,
    backgroundColor: colors.muted, flexShrink: 0,
  },
  dotFocus: { backgroundColor: colors.ink },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  rowSub: { fontSize: 11.5, color: colors.muted, marginTop: 4, lineHeight: 18 },

  freeBox: {
    backgroundColor: colors.panel2, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.line, gap: 6,
  },
  freeTxt: { fontSize: 12.5, color: colors.mid, lineHeight: 19 },

  plan: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.panel, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.line, marginBottom: 8,
  },
  planOn: { borderColor: colors.ink, backgroundColor: colors.panel2 },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  planLabel: { fontSize: 15, fontWeight: '700', color: colors.mid },
  planLabelOn: { color: colors.ink },
  planNote: { fontSize: 11, color: colors.muted, marginTop: 4 },
  planPrice: { fontSize: 17, fontWeight: '800', color: colors.mid, letterSpacing: -0.3 },
  planPriceOn: { color: colors.ink },
  planPeriod: { fontSize: 11, fontWeight: '600', color: colors.muted },
  bestTag: { backgroundColor: colors.panel3, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  bestTxt: { fontSize: 10, fontWeight: '800', color: colors.mid },

  trialBtn: {
    borderWidth: 1, borderColor: colors.line2, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center', marginTop: 10,
  },
  trialTxt: { fontSize: 14, fontWeight: '700', color: colors.ink },
  trialBtnPrimary: { backgroundColor: colors.ink, borderColor: colors.ink },
  trialTxtPrimary: { color: colors.bg },
  comingSoon: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 12, lineHeight: 18 },

  codeRow: { flexDirection: 'row', gap: 8 },
  codeInput: {
    flex: 1, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line2,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.ink,
  },
  codeBtn: {
    backgroundColor: colors.ink, borderRadius: 12, paddingHorizontal: 20,
    alignItems: 'center', justifyContent: 'center', minWidth: 72,
  },
  codeBtnOff: { opacity: 0.4 },
  codeBtnTxt: { fontSize: 14, fontWeight: '700', color: colors.bg },

  restoreBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 6 },
  restoreTxt: { fontSize: 12.5, color: colors.mid, fontWeight: '600' },

  notice: { fontSize: 11, color: colors.muted, lineHeight: 17, textAlign: 'center', marginTop: 14 },
  legalRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 10, minHeight: 32 },
  legalLink: { fontSize: 12, color: colors.mid, textDecorationLine: 'underline' },
  legalDot: { color: colors.muted },
}));
