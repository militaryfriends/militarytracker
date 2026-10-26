import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, themed, useThemeMode } from '../../src/theme';
import { FONT } from '../../src/ui';
import { showAlert } from '../../src/utils/alert';
import { useAppStore } from '../../src/stores/appStore';
import { useAuthStore } from '../../src/stores/authStore';
import { calcBodyStats, effectiveWeight, FOOD_LABEL, GOAL_LABEL } from '../../src/utils/body';
import { generateDiet, SubscriptionRequired, QuotaExceeded } from '../../src/services/aiService';
import { useEntitlement } from '../../src/hooks/useEntitlement';
import { ProLock, ProBadge } from '../../src/components/ProLock';
import { saveProfile } from '../../src/services/authService';
import { localDate } from '../../src/services/workoutService';

/** 이 일수가 지나면 식단을 다시 구성하도록 권유한다 */
const DIET_STALE_DAYS = 7;

const daysSince = (iso?: string): number | null => {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  if (!Number.isFinite(d)) return null;
  return Math.floor((Date.now() - d) / 86_400_000);
};

export default function DietScreen() {
  useThemeMode();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const patchUser = useAuthStore((s) => s.patchUser);
  const hydrating = useAuthStore((s) => s.hydrating);
  const profile = useAppStore((s) => s.profile);
  const weights = useAppStore((s) => s.weights);
  // 진행 중인 내 변화 프로젝트가 있으면 칼로리 · 단백질은 지금 단계 값(엔진)
  const bodyProject = useAppStore((s) => s.project);
  const diet = useAppStore((s) => s.diet);
  const dietLoading = useAppStore((s) => s.dietLoading);
  const setDiet = useAppStore((s) => s.setDiet);
  const setDietLoading = useAppStore((s) => s.setDietLoading);
  const setProfile = useAppStore((s) => s.setProfile);
  const { can } = useEntitlement();
  // 목표 칼로리·매크로는 계속 무료다. 구독으로 열리는 건 '하루 식단 구성'.
  const canDiet = can('ai_diet');

  const st = calcBodyStats(profile, weights, bodyProject);
  const eff = effectiveWeight(profile, weights);
  const age = daysSince(diet?.createdAt);
  const stale = age !== null && age >= DIET_STALE_DAYS;

  async function genDiet() {
    if (!profile || dietLoading) return;
    if (!canDiet) {
      router.push('/subscribe?f=ai_diet');
      return;
    }
    setDietLoading(true);
    try {
      // 진행 중인 프로젝트가 있으면 서버가 지금 단계의 칼로리 · 끼니별 숫자를 정한다
      const next = await generateDiet(profile, st ?? undefined, bodyProject?.status === 'active' ? { projectId: bodyProject.id } : undefined);
      if (next.src === 'AI' || !diet) setDiet({ ...next, createdAt: new Date().toISOString() });
      else showAlert('연결 실패', '식단을 새로 구성하지 못했습니다. 기존 식단을 유지합니다.');
    } catch (e) {
      // 화면을 띄워 둔 사이에 구독이 끝난 경우
      if (e instanceof SubscriptionRequired) router.push('/subscribe?f=ai_diet');
      else if (e instanceof QuotaExceeded) showAlert('오늘 한도 초과', e.message);
      else showAlert('오류', '식단을 구성하지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setDietLoading(false);
    }
  }

  async function applyTrendWeight() {
    if (!user || !profile || !eff?.trend) return;
    const next = { ...profile, weight: String(eff.trend) };
    try {
      await saveProfile(user.uid, next);
      setProfile(next);
      patchUser({ profile: next });
      showAlert('기준 체중 갱신', `${eff.trend}kg으로 갱신했습니다. 목표 칼로리가 다시 계산됩니다.`);
    } catch {
      showAlert('오류', '저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
  }

  if (!profile && hydrating) {
    // 로그인 직후 프로필이 오기 전 — "신체 정보가 필요합니다" 플래시를 막는다
    return <SafeAreaView style={s.root} edges={['top']} />;
  }

  if (!st || !profile) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.empty}>
          <Text style={s.emptyTxt}>
            신체 정보가 필요합니다.{'\n'}내 정보를 입력하면 목표 칼로리를 계산합니다.
          </Text>
          <TouchableOpacity activeOpacity={0.7} style={s.emptyBtn} onPress={() => router.push('/profile/edit')}>
            <Text style={s.emptyBtnTxt}>내 정보 입력</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.topbar}>
        <Text style={s.title}>식단</Text>
        <Text style={s.meta}>{st.tagline}</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollInner} showsVerticalScrollIndicator={false}>
        {/* 계산 근거 — 숫자의 출처와 수정 경로 */}
        <TouchableOpacity style={s.basisCard} activeOpacity={0.8} onPress={() => router.push('/profile/edit')}>
          <View style={{ flex: 1 }}>
            <Text style={s.basisLabel}>계산 기준</Text>
            <Text style={s.basisMain}>
              {st.weightUsed}kg · {profile.height}cm · {profile.age}세 · {GOAL_LABEL[profile.goal]}
            </Text>
            <Text style={s.basisSub}>
              {st.weightSrc === 'trend'
                ? `최근 체중 기록의 추세값 · 기준 ${eff?.baseline}kg`
                : '내 정보에 저장된 기준 체중'}
            </Text>
          </View>
          <Text style={s.basisChev}>›</Text>
        </TouchableOpacity>

        {/* 기준 체중과 추세가 벌어졌을 때만 */}
        {eff?.shouldUpdate && (
          <View style={s.driftBox}>
            <Text style={s.driftTxt}>
              최근 추세 <Text style={s.driftHi}>{eff.trend}kg</Text> 로 기준({eff.baseline}kg)과
              {' '}{Math.abs(eff.drift)}kg 차이가 납니다.
            </Text>
            <TouchableOpacity activeOpacity={0.7} style={s.driftBtn} onPress={applyTrendWeight}>
              <Text style={s.driftBtnTxt}>기준 체중 갱신</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={s.sectionLabel}>DAILY TARGET</Text>
        <View style={s.macroRow}>
          <MacroCard value={`${st.kcal}`} unit="kcal" label="목표 칼로리" />
          <MacroCard value={`${st.protein}`} unit="g" label="단백질" />
          <MacroCard value={`${st.carb}`} unit="g" label="탄수화물" />
          <MacroCard value={`${st.fat}`} unit="g" label="지방" />
        </View>
        {/* 계산 근거 — 감이 아니라 계산으로: 유지 칼로리 ± 목표 조정 = 하루 목표 */}
        <View style={s.calcRow} accessible accessibilityLabel={`유지 칼로리 ${st.tdee}, 조정 ${st.kcal - st.tdee}, 하루 목표 ${st.kcal}킬로칼로리`}>
          <View style={s.calcCell}><Text style={s.calcNum}>{st.tdee.toLocaleString()}</Text><Text style={s.calcLabel}>유지 칼로리</Text></View>
          <Text style={s.calcOp}>{st.kcal - st.tdee >= 0 ? '+' : '−'}</Text>
          <View style={s.calcCell}><Text style={s.calcNum}>{Math.abs(st.kcal - st.tdee).toLocaleString()}</Text><Text style={s.calcLabel}>{st.kcal - st.tdee >= 0 ? '증량 조정' : '감량 조정'}</Text></View>
          <Text style={s.calcOp}>=</Text>
          <View style={s.calcCell}><Text style={[s.calcNum, s.calcHi]}>{st.kcal.toLocaleString()}</Text><Text style={s.calcLabel}>하루 목표</Text></View>
        </View>
        <Text style={s.tdeeTxt}>
          유지 칼로리(TDEE) 약 {st.tdee}kcal · Mifflin-St Jeor × 활동계수 {st.activityFactor}(주 {profile.days}일) · BMI {st.bmi} ({st.bodyType})
        </Text>

        <View style={s.sectionRow}>
          <Text style={s.sectionLabel}>하루 식단</Text>
          {!canDiet && <ProBadge style={{ marginBottom: 12 }} />}
          <Text style={s.sectionSub}>
            {FOOD_LABEL[profile.food]} 기준
            {diet?.src === 'AI' ? ' · AI 구성' : ''}
            {age !== null ? ` · ${age === 0 ? '오늘' : `${age}일 전`} 구성` : ''}
          </Text>
        </View>

        {stale && (
          <View style={s.staleBox}>
            <Text style={s.staleTxt}>
              {age}일 전에 만든 식단입니다. 체중이나 목표가 바뀌었다면 다시 구성하세요.
            </Text>
          </View>
        )}

        {diet ? (
          <>
            {diet.meals.map((m, i) => (
              <View key={i} style={s.mealCard}>
                <View style={s.mealTimeWrap}><Text style={s.mealTime}>{m.t}</Text></View>
                <View style={s.mealBody}>
                  <Text style={s.mealMenu}>{m.m}</Text>
                  <Text style={s.mealKcal}>{m.k}</Text>
                </View>
              </View>
            ))}
            {diet.tip ? (
              <View style={s.tipCard}><Text style={s.tipTxt}>💡 {diet.tip}</Text></View>
            ) : null}
          </>
        ) : canDiet ? (
          <View style={s.emptyMeal}>
            <Text style={s.emptyMealTxt}>
              체형 · 목표 · 식사 환경에 맞는{'\n'}하루 식단을 구성합니다.
            </Text>
          </View>
        ) : (
          <ProLock
            feature="ai_diet"
            desc={`목표 ${st.kcal}kcal · 단백질 ${st.protein}g 에 맞춰 ${FOOD_LABEL[profile.food]} 기준 하루 식단을 구성합니다.`}
          />
        )}

        {(canDiet || diet) && (
          <TouchableOpacity activeOpacity={0.7}
            style={[s.genBtn, diet && !stale && s.genGhost, dietLoading && s.genOff]}
            onPress={genDiet}
            disabled={dietLoading}
          >
            {dietLoading ? (
              <ActivityIndicator color={diet && !stale ? colors.mid : colors.bg} />
            ) : (
              <Text style={[s.genTxt, diet && !stale && s.genTxtGhost]}>
                {diet ? '다시 구성' : '식단 생성'}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {/* 막다른 길 방지 — 다음 행동 */}
        <TouchableOpacity activeOpacity={0.7} style={s.linkRow} onPress={() => router.push('/coach')} accessibilityRole="button">
          <View style={{ flex: 1 }}>
            <Text style={s.linkTitle}>AI 코치에게 물어보기</Text>
            <Text style={s.linkSub}>대체 음식, 외식 메뉴, 보충제 등</Text>
          </View>
          <Text style={s.basisChev}>›</Text>
        </TouchableOpacity>

        <Text style={s.notice}>일반적 영양 가이드이며 의학적 조언이 아닙니다.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function MacroCard({ value, unit, label }: { value: string; unit: string; label: string }) {
  useThemeMode();
  return (
    <View style={s.mbox} accessible accessibilityLabel={`${label} ${value}${unit}`}>
      {/* 4열 타일에서 '2713kcal' 이 단어 중간에서 줄바꿈되던 것 — 한 줄로 고정하고 폭에 맞춰 줄인다 */}
      <Text style={s.mboxVal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}<Text style={s.mboxUnit}>{unit}</Text>
      </Text>
      <Text style={s.mboxLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topbar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  meta: { fontSize: 10, color: colors.muted, letterSpacing: 1 },
  scroll: { flex: 1 },
  scrollInner: { paddingHorizontal: 16, paddingBottom: 36 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  emptyTxt: { color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  emptyBtn: { backgroundColor: colors.ink, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 12 },
  emptyBtnTxt: { color: colors.bg, fontSize: 14, fontWeight: '700' },

  basisCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.panel2, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.line2, marginTop: 8, marginBottom: 10,
  },
  basisLabel: { fontSize: 10, fontWeight: '800', color: colors.muted, letterSpacing: 1.5 },
  basisMain: { fontSize: 14, fontWeight: '700', color: colors.ink, marginTop: 5 },
  basisSub: { fontSize: 11, color: colors.muted, marginTop: 4 },
  basisChev: { fontSize: 20, color: colors.muted },

  driftBox: {
    backgroundColor: colors.goodBg, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.goodLine, marginBottom: 10, gap: 10,
  },
  driftTxt: { fontSize: 12.5, color: colors.ink, lineHeight: 19 },
  driftHi: { fontWeight: '800', color: colors.good },
  driftBtn: {
    alignSelf: 'flex-start', backgroundColor: colors.ink,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
  },
  driftBtnTxt: { fontSize: 12, fontWeight: '700', color: colors.bg },

  sectionLabel: {
    fontSize: 10, fontWeight: '800', color: colors.muted,
    letterSpacing: 2, marginBottom: 12, marginTop: 8,
  },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  sectionSub: { fontSize: 11, color: colors.muted },

  macroRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  mbox: {
    flex: 1, backgroundColor: colors.panel, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: colors.line,
  },
  mboxVal: { fontSize: 19, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  mboxUnit: { fontSize: 11, fontWeight: '600', color: colors.mid },
  mboxLabel: { fontSize: 10, color: colors.muted, marginTop: 4 },
  calcRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 12, marginTop: 4, marginBottom: 8,
  },
  calcCell: { alignItems: 'center', flex: 1 },
  calcNum: { fontSize: 18, color: colors.mid, fontFamily: FONT.num },
  calcHi: { color: colors.ink, fontWeight: '700' },
  calcLabel: { fontSize: 10, color: colors.muted, marginTop: 2 },
  calcOp: { fontSize: 16, color: colors.muted, paddingHorizontal: 2 },
  tdeeTxt: { fontSize: 11, color: colors.muted, lineHeight: 17, marginBottom: 6 },

  staleBox: {
    backgroundColor: colors.panel2, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: colors.line2, marginBottom: 10,
  },
  staleTxt: { fontSize: 12, color: colors.mid, lineHeight: 18 },

  mealCard: {
    flexDirection: 'row', gap: 14,
    backgroundColor: colors.panel, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.line, marginBottom: 10,
  },
  mealTimeWrap: {
    backgroundColor: colors.panel3, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start',
  },
  mealTime: { fontSize: 11, fontWeight: '700', color: colors.mid },
  mealBody: { flex: 1 },
  mealMenu: { fontSize: 14, fontWeight: '600', color: colors.ink, lineHeight: 20, marginBottom: 4 },
  mealKcal: { fontSize: 11.5, color: colors.muted },

  tipCard: {
    backgroundColor: colors.panel2, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.line, marginBottom: 14,
  },
  tipTxt: { fontSize: 13, color: colors.mid, lineHeight: 20 },

  emptyMeal: {
    backgroundColor: colors.panel, borderRadius: 16, padding: 28,
    borderWidth: 1, borderColor: colors.line, alignItems: 'center', marginBottom: 14,
  },
  emptyMealTxt: { color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 22 },

  genBtn: { backgroundColor: colors.ink, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  genGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.line2 },
  genOff: { opacity: 0.4 },
  genTxt: { color: colors.bg, fontSize: 15, fontWeight: '700' },
  genTxtGhost: { color: colors.mid },

  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.panel, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.line, marginTop: 12,
  },
  linkTitle: { fontSize: 13.5, fontWeight: '700', color: colors.ink },
  linkSub: { fontSize: 11, color: colors.muted, marginTop: 3 },

  notice: { fontSize: 10.5, color: colors.muted, lineHeight: 16, textAlign: 'center', marginTop: 14 },
}));
