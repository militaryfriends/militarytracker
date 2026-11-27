import { analyzeBody } from '../src/utils/bodyAnalysis';
import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ActivityIndicator, Platform, Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { targetPlanOf } from '../src/components/body/TargetPanel';
import { colors, themed, useThemeMode } from '../src/theme';
import { Screen, TopBar, Body, SectionLabel, PrimaryBtn, useSafeBack } from '../src/components/ui';
import { showAlert } from '../src/utils/alert';
import { useAuthStore } from '../src/stores/authStore';
import { useEntitlement } from '../src/hooks/useEntitlement';
import { PRODUCTS, TRIAL_DAYS, PRO_NAME, LEGAL } from '../src/config/entitlements';
import {
  purchase, restore, startTrial, redeemPromo, canPurchase, getOfferings, manageSubscriptionUrl,
  BillingUnavailable, PromoError, EmailUnverified, STORE_BILLING_READY,
} from '../src/services/billingService';
import { resendVerification } from '../src/services/authService';
import { SUB_STATUS_LABEL } from '../src/utils/subscription';
import type { Subscription } from '../src/types';
import { useAppStore } from '../src/stores/appStore';
import { AvatarView } from '../src/components/body/AvatarView';
import { coordOf } from '../src/components/body/avatar3d/morph';
import { useNowBody } from '../src/components/body/nowBody';
import { kg } from '../src/components/body/format';
import { calcBodyStats } from '../src/utils/body';
import { PressableScale, PRESS_SCALE } from '../src/ui';
import { useScreenSize } from '../src/ui/screenSize';

type Busy = null | 'buy' | 'trial' | 'promo' | 'restore';

/** 구독하면 열리는 것 — 한 줄씩, 그 사람의 숫자로(검수 3-1). 코치 하루 10번은 서버 한도(quota.ts)와 같아야 한다 */
const PITCH = (days?: number, kcal?: number): [string, string][] => [
  ['매일 할 운동', `내 몸 · 장소 · 주 ${days ?? 3}일에 맞춘 분할과 세트`],
  ['매일 먹을 것', kcal ? `하루 ${kcal.toLocaleString('ko-KR')}kcal을 끼니마다 g 단위로` : '하루 칼로리를 끼니마다 g 단위로'],
  ['물어보면 답하는 코치', '내 기록을 보고, 하루 10번'],
  ['4주마다 체크인', '체중을 넣으면 지금 몸이 바뀝니다'],
];

export default function SubscribeScreen() {
  useThemeMode();
  const router = useRouter();
  const goBack = useSafeBack();
  const { f, project, tkg, tm } = useLocalSearchParams<{ f?: string; project?: string; tkg?: string; tm?: string }>();
  const analysis = useAppStore((st) => st.analysis);
  // O8 에서 고른 프로젝트 — 위에 요약을 보여 주고, 구독이 되면 바로 프로젝트를 시작한다
  // 카드는 입력으로 다시 계산한다(프로젝트 화면 · 서버와 같은 값) — 저장된 옛 분석에도 카드 4장이 있다
  const chosen = useMemo(() => {
    if (f !== 'body_project' || !project || !analysis) return null;
    try {
      // 내 목표(무게 · 기간)로 고른 경우 — 같은 엔진으로 그 목표 카드를 다시 만든다
      if (tkg || tm) {
        const plan = targetPlanOf(analysis, { ...(tkg ? { kg: Number(tkg) } : {}), ...(tm ? { months: Number(tm) } : {}) });
        if (plan) return plan.card;
      }
      return analyzeBody(analysis.input).projects.find((p) => p.id === project) ?? null;
    } catch {
      return null;
    }
  }, [f, project, tkg, tm, analysis]);
  const startQ = `project=${chosen?.id ?? ''}${tkg ? `&tkg=${tkg}` : ''}${tm ? `&tm=${tm}` : ''}`;
  // 위 3D · 한 줄에 쓸 목표 — 고른 카드 → 진행 중 프로젝트 → 내가 고른(추천) 카드 순(검수 3-1)
  const profile = useAppStore((st) => st.profile);
  const weights = useAppStore((st) => st.weights);
  const bodyProject = useAppStore((st) => st.project);
  const now = useNowBody();
  const target = useMemo(() => {
    if (chosen) return { name: chosen.name, months: chosen.months, end: chosen.end };
    if (bodyProject && (bodyProject.status === 'active' || bodyProject.status === 'paused')) {
      return { name: bodyProject.name, months: bodyProject.months, end: bodyProject.end };
    }
    if (!analysis) return null;
    try {
      const cards = analyzeBody(analysis.input).projects;
      const c = cards.find((x) => x.strategy === profile?.strategy) ?? cards.find((x) => x.recommended) ?? cards[0];
      return c ? { name: c.name, months: c.months, end: c.end } : null;
    } catch {
      return null;
    }
  }, [chosen, bodyProject, analysis, profile?.strategy]);
  const dayKcal = calcBodyStats(profile, weights, bodyProject)?.kcal ?? chosen?.nutrition.kcal;
  const patchUser = useAuthStore((s) => s.patchUser);
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const { sub, pro, left } = useEntitlement();
  // 결제 SDK 연결 전엔 가격표·구매·복원·코드 입력을 숨긴다 (심사 거절 사유)
  const storeReady = STORE_BILLING_READY && Platform.OS !== 'web';

  const { width } = useScreenSize();
  const avW = Math.round(Math.min(150, (Math.min(width, 480) - 48) / 2));
  // 요금제는 월간 하나(₩9,900). 스토어 가격을 받으면 그 값으로 바꿔 보여 준다
  const [products, setProducts] = useState(PRODUCTS);
  const [picked, setPicked] = useState(PRODUCTS.find((p) => p.best)?.id ?? PRODUCTS[0].id);
  useEffect(() => {
    if (!storeReady || pro) return;
    let alive = true;
    getOfferings().then((list) => { if (alive) setProducts(list); }).catch(() => {});
    return () => { alive = false; };
  }, [storeReady, pro]);
  // 코드 · 대기자 휴대폰 번호 입력은 웹에서만 (앱 안의 자체 잠금 해제 수단은 스토어 정책 위반)
  const codeOpen = Platform.OS === 'web';
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<Busy>(null);

  // 카드 없는 서버 체험은 스토어 결제가 없을 때(웹 · 키 전)만 — 앱 결제가 열리면 스토어 무료 체험이 대신한다
  const trialAvailable = TRIAL_DAYS > 0 && !sub.trialUsed && !pro && !storeReady;
  const pickedProduct = products.find((p) => p.id === picked) ?? products[0];
  const storeTrial = pickedProduct?.trial;
  const manageUrl = manageSubscriptionUrl(sub.source, sub.productId);

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
        if (chosen) {
          // 결제(체험)되면 바로 맞춤형 프로젝트 진행
          router.replace(`/project/start?${startQ}`);
          return;
        }
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
      <TopBar title={PRO_NAME} onBack={goBack} />
      <Body>
        {/* 검수 3-1 — 맨 위는 지금 몸 vs 목표 몸, 그 사람의 숫자로 */}
        {now && target ? (
          <View style={s.pair}>
            <AvatarView sex={now.sex} cell={now.cell} coord={now.coord} own bfPct={now.bfPct} width={avW} badge="지금" />
            <AvatarView sex={now.sex} cell={target.end.cell} coord={coordOf(now.sex, target.end.bfPct, target.end.nffmi)} width={avW} badge="예상" />
          </View>
        ) : null}
        <Text style={s.headline}>이 몸까지, 가는 길을 엽니다.</Text>
        {target && now ? (
          <Text style={s.headSub}>{target.name} · {target.months}개월 · {kg(now.weightKg)}kg → {kg(target.end.weightKg)}kg</Text>
        ) : null}
        {chosen && pro ? (
          <PrimaryBtn label="맞춤형 프로젝트 바로 시작하기" onPress={() => router.replace(`/project/start?${startQ}`)} style={{ marginTop: 14 }} />
        ) : null}

        <View style={s.pitch}>
          {PITCH(profile?.days, dayKcal).map(([t, d]) => (
            <View key={t} style={s.pitchRow}>
              <Text style={s.pitchTitle}>{t}</Text>
              <Text style={s.pitchSub}>{d}</Text>
            </View>
          ))}
        </View>
        <Text style={s.freeLine}>구독 없이도: 정석 루틴 · 세트 기록 · 종목별 자세 영상</Text>

        {pro && (sub.status !== 'trial' || isAdmin) ? (
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
            {sub.status === 'grace' && (
              <Text style={s.activeSub}>결제가 실패했습니다. 스토어의 결제 수단을 확인해 주세요 — 확인되는 동안은 그대로 사용합니다.</Text>
            )}
            {manageUrl ? (
              <PressableScale onPress={() => Linking.openURL(manageUrl)} hitSlop={8} accessibilityRole="link">
                <Text style={s.manageTxt}>구독 관리 · 해지</Text>
              </PressableScale>
            ) : null}
          </View>
        ) : null}
        {/* 체험 중은 초록 카드 대신 회색 한 줄(검수 3 #7) */}
        {pro && sub.status === 'trial' && !isAdmin ? (
          <Text style={s.trialLine}>무료 체험 {left ?? 0}일 남음</Text>
        ) : null}

        {!pro && storeReady && (
          <>
            <SectionLabel>플랜 선택</SectionLabel>
            {products.map((p) => {
              const on = picked === p.id;
              return (
                <PressableScale scaleTo={PRESS_SCALE.card}
                  key={p.id}
                  style={[s.plan, on && s.planOn]}
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
                </PressableScale>
              );
            })}

            <PrimaryBtn
              label={storeTrial ? `${storeTrial} 무료로 시작하기` : `월 ${pickedProduct.price.replace('₩', '')}원으로 시작하기`}
              loading={busy === 'buy'}
              disabled={!!busy || !canPurchase()}
              onPress={() => run('buy', () => purchase(picked), storeTrial ? `${storeTrial} 무료 체험이 시작되었습니다.` : '구독이 시작되었습니다.')}
              style={{ marginTop: 6 }}
            />
            <Text style={s.trialNote}>
              {storeTrial
                ? `처음 구독하면 ${storeTrial} 무료, 이후 매월 ${pickedProduct.price} 자동 결제 · 체험 중 해지하면 결제되지 않습니다`
                : `매월 ${pickedProduct.price} 자동 결제 · 언제든 해지할 수 있습니다`}
            </Text>
          </>
        )}

        {!pro && trialAvailable && (
          <PressableScale dimDisabled={false}
            style={[s.trialBtn, !storeReady && s.trialBtnPrimary]}
            disabled={!!busy}
            onPress={() => run('trial', startTrial, `${TRIAL_DAYS}일 무료 체험이 시작되었습니다.`)}
            accessibilityRole="button"
          >
            {busy === 'trial'
              ? <ActivityIndicator color={storeReady ? colors.ink : colors.bg} />
              : <Text style={[s.trialTxt, !storeReady && s.trialTxtPrimary]}>{chosen ? `${TRIAL_DAYS}일 무료로 프로젝트 시작하기` : `${TRIAL_DAYS}일 무료로 먼저 써보기`}</Text>}
          </PressableScale>
        )}

        {!pro && !storeReady && (
          <Text style={s.comingSoon}>
            {Platform.OS === 'web'
              ? '구독 결제는 iOS·Android 앱에서 진행할 수 있습니다.'
              : '유료 구독은 곧 열립니다. 지금은 무료 체험으로 모든 기능을 써볼 수 있어요.'}
          </Text>
        )}

        {!pro && codeOpen && (
          <>
            <SectionLabel>코드 · 대기자 명단 휴대폰 번호</SectionLabel>
            <Text style={s.codeHint}>휴대폰 번호로 대기자 명단을 신청했다면 그 번호를 넣으면 프리미엄이 적용됩니다.</Text>
            <View style={s.codeRow}>
              <TextInput
                style={s.codeInput}
                placeholder="코드 또는 010-0000-0000"
                placeholderTextColor={colors.placeholder}
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
                autoCorrect={false}
                accessibilityLabel="프로모션 코드 또는 휴대폰 번호"
              />
              <PressableScale dimDisabled={false}
                style={[s.codeBtn, !code.trim() && s.codeBtnOff]}
                disabled={!!busy || !code.trim()}
                onPress={() => run('promo', () => redeemPromo(code), '프리미엄이 적용되었습니다.')}
                accessibilityRole="button"
                accessibilityState={{ disabled: !!busy || !code.trim() }}
              >
                {busy === 'promo'
                  ? <ActivityIndicator color={colors.bg} />
                  : <Text style={s.codeBtnTxt}>등록</Text>}
              </PressableScale>
            </View>
          </>
        )}

        {storeReady && (
          <PressableScale dimDisabled={false}
            style={s.restoreBtn}
            disabled={!!busy}
            onPress={() => run('restore', restore, '구독 정보를 불러왔습니다.', '복원할 구독이 없거나 연결에 실패했습니다.')}
            accessibilityRole="button"
          >
            <Text style={s.restoreTxt}>구매 복원</Text>
          </PressableScale>
        )}

        <Text style={s.notice}>
          {Platform.OS === 'web'
            ? '웹에서는 미리보기만 제공합니다. 구독은 앱에서 진행해주세요.'
            : '구독은 기간 만료 24시간 전까지 해지하지 않으면 자동으로 갱신됩니다. 해지는 기기의 구독 관리 화면에서 언제든 할 수 있습니다.'}
        </Text>
        <View style={s.legalRow}>
          <PressableScale onPress={() => Linking.openURL(LEGAL.terms)} hitSlop={10} accessibilityRole="link">
            <Text style={s.legalLink}>이용약관</Text>
          </PressableScale>
          <Text style={s.legalDot}>·</Text>
          <PressableScale onPress={() => Linking.openURL(LEGAL.privacy)} hitSlop={10} accessibilityRole="link">
            <Text style={s.legalLink}>개인정보처리방침</Text>
          </PressableScale>
        </View>
      </Body>
    </Screen>
  );
}

const s = themed(() => StyleSheet.create({
  chosen: { marginTop: 4, marginBottom: 6 },
  chosenLabel: { fontSize: 10, fontWeight: '800', color: colors.muted, letterSpacing: 2, marginBottom: 8 },
  lead: { fontSize: 14, color: colors.ink, lineHeight: 22, marginTop: 4, marginBottom: 4 },

  activeBox: {
    backgroundColor: colors.panel, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.line, marginTop: 18,
  },
  activeLabel: { fontSize: 12, fontWeight: '700', color: colors.mid },
  pair: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 4 },
  headline: { fontSize: 24, fontWeight: '800', color: colors.ink, marginTop: 14, letterSpacing: -0.4 },
  headSub: { fontSize: 14, color: colors.mid, marginTop: 6, lineHeight: 20 },
  pitch: { marginTop: 22, borderTopWidth: 1, borderTopColor: colors.line },
  pitchRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  pitchTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  pitchSub: { fontSize: 13, color: colors.mid, marginTop: 4, lineHeight: 19 },
  freeLine: { fontSize: 12.5, color: colors.muted, marginTop: 14, lineHeight: 18 },
  trialLine: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 18 },
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
  trialBtnPrimary: { backgroundColor: colors.red, borderColor: colors.red },
  trialTxtPrimary: { color: colors.onRed },
  comingSoon: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 12, lineHeight: 18 },

  codeRow: { flexDirection: 'row', gap: 8 },
  trialNote: { fontSize: 12, color: colors.mid, lineHeight: 18, textAlign: 'center', marginTop: 8 },
  manageTxt: { fontSize: 13, color: colors.ink, fontWeight: '600', textDecorationLine: 'underline', marginTop: 10 },
  codeHint: { fontSize: 12, color: colors.mid, lineHeight: 18, marginBottom: 8 },
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
