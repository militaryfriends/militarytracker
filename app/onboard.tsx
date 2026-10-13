import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, themed, useThemeMode } from '../src/theme';
import { showAlert } from '../src/utils/alert';
import { UserProfile } from '../src/types';
import { useAuthStore } from '../src/stores/authStore';
import { useAppStore } from '../src/stores/appStore';
import { saveOnboarding } from '../src/services/authService';
import { generatePlan, SubscriptionRequired, QuotaExceeded } from '../src/services/aiService';
import { validateProfile } from '../src/utils/body';
import { useEntitlement } from '../src/hooks/useEntitlement';
import { ProBadge } from '../src/components/ProLock';
import { planFromRoutine } from '../src/utils/planner';
import { ROUTINES, recommendRoutine, routineExCount } from '../src/data/routines';

const TOTAL = 5;

const defaultProfile: UserProfile = {
  sex: 'male', age: '', height: '', weight: '',
  goal: 'muscle', env: 'gym', days: 3, level: 1,
  food: 'convenience', allergy: '',
};

export default function OnboardScreen() {
  useThemeMode();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, patchUser } = useAuthStore();
  const { setProfile, setPlan } = useAppStore();
  const [step, setStep] = useState(0);
  const [p, setP] = useState<UserProfile>(defaultProfile);
  const [loading, setLoading] = useState<string | null>(null);

  function update<K extends keyof UserProfile>(key: K, val: UserProfile[K]) {
    setP((prev) => ({ ...prev, [key]: val }));
  }

  const canNext = step === 0 ? !!(p.age && p.height && p.weight) : true;

  function next() {
    if (step === 0) {
      // 빈 값만 보면 '1.75', '800', '-5' 가 통과해 BMI 235102 같은 값이 화면에 나간다
      const err = validateProfile(p);
      if (err) {
        showAlert('입력 확인', err);
        return;
      }
    }
    setStep((v) => v + 1);
  }

  // 루틴 추천과 AI 구성은 구독 기능이다.
  // 구독 전에는 추천 배지도 정렬도 걸지 않는다 — 보여 주면 이미 준 것이다.
  const { can } = useEntitlement();
  const canAI = can('ai_plan');
  const canReco = can('routine_reco');
  const recommendedId = canReco
    ? recommendRoutine({ place: p.env, days: p.days, level: p.level }).id
    : null;

  async function choosePreset(routineId: string) {
    if (!user || loading) return;
    setLoading(routineId);
    try {
      const plan = planFromRoutine(routineId);
      if (!plan) throw new Error('routine not found');
      await saveOnboarding(user.uid, p, plan);
      setProfile(p);
      setPlan(plan);
      patchUser({ onboardingDone: true, profile: p });
      router.replace(`/routine/${routineId}?onboard=1`);
    } catch {
      showAlert('오류', '루틴 저장에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(null);
    }
  }

  async function chooseAI() {
    if (!user || loading) return;
    if (!canAI) {
      router.push('/subscribe?f=ai_plan');
      return;
    }
    setLoading('ai');
    try {
      const { plan, fallback, reason } = await generatePlan(p);
      await saveOnboarding(user.uid, p, plan);
      setProfile(p);
      setPlan(plan);
      patchUser({ onboardingDone: true, profile: p });
      router.replace('/tabs/home');
      if (fallback) {
        // 구독자가 "AI 플랜" 을 받았다고 믿게 두지 않는다 — 운동 탭에서 다시 시도할 수 있다
        showAlert('자동 구성으로 시작', `${reason ?? 'AI 서버에 연결하지 못했습니다.'} 우선 자동 알고리즘으로 구성했어요. 운동 탭에서 'AI로 다시 구성' 을 누르면 다시 시도합니다.`);
      }
    } catch (e) {
      if (e instanceof SubscriptionRequired) router.push('/subscribe?f=ai_plan');
      else if (e instanceof QuotaExceeded) showAlert('오늘 한도 초과', `${e.message} 아래 루틴 중 하나로 시작해주세요.`);
      else showAlert('오류', '플랜 생성에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View
        style={s.progRow}
        accessibilityRole="progressbar"
        accessibilityLabel={`온보딩 ${step + 1}단계, 전체 ${TOTAL}단계`}
        accessibilityValue={{ min: 1, max: TOTAL, now: step + 1 }}
      >
        {Array.from({ length: TOTAL }).map((_, i) => (
          <View key={i} style={[s.progBar, i <= step && s.progOn]} />
        ))}
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollInner} keyboardShouldPersistTaps="handled">
        {step === 0 && <Step1 p={p} update={update} />}
        {step === 1 && <Step2 p={p} update={update} />}
        {step === 2 && <Step3 p={p} update={update} />}
        {step === 3 && <Step4 p={p} update={update} />}
        {step === 4 && (
          <StepRoutine
            recommendedId={recommendedId}
            canAI={canAI}
            onReco={() => router.push('/subscribe?f=routine_reco')}
            place={p.env}
            loading={loading}
            onPreset={choosePreset}
            onAI={chooseAI}
          />
        )}
      </ScrollView>

      {step < TOTAL - 1 && (
        <View style={[s.foot, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          {step > 0 && (
            <TouchableOpacity activeOpacity={0.7} style={s.backBtn} onPress={() => setStep((v) => v - 1)} accessibilityRole="button">
              <Text style={s.backTxt}>이전</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity activeOpacity={0.7}
            style={[s.nextBtn, !canNext && s.btnOff]}
            disabled={!canNext}
            onPress={next}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canNext }}
          >
            <Text style={s.nextTxt}>다음</Text>
          </TouchableOpacity>
        </View>
      )}
      {step === TOTAL - 1 && (
        <View style={[s.foot, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          <TouchableOpacity activeOpacity={0.7} style={s.backBtn} onPress={() => setStep((v) => v - 1)}>
            <Text style={s.backTxt}>이전</Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Step 1: 신체 정보 ──────────────────────────────────────────────────────
function Step1({ p, update }: { p: UserProfile; update: <K extends keyof UserProfile>(k: K, v: UserProfile[K]) => void }) {
  useThemeMode();
  return (
    <View>
      <Text style={s.stepNum}>STEP 1 / 5</Text>
      <Text style={s.q}>기본 신체 정보를{'\n'}알려주세요</Text>
      <Text style={s.desc}>플랜과 식단 계산의 기준이 됩니다.</Text>

      <View style={s.grid2}>
        <Opt label="남성" on={p.sex === 'male'} onPress={() => update('sex', 'male')} />
        <Opt label="여성" on={p.sex === 'female'} onPress={() => update('sex', 'female')} />
      </View>

      <Text style={s.label}>나이</Text>
      <TextInput style={s.input} placeholder="25" placeholderTextColor={colors.muted} keyboardType="numeric" value={p.age} onChangeText={(v) => update('age', v)} />

      <View style={s.grid2}>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>키 (cm)</Text>
          <TextInput style={s.input} placeholder="175" placeholderTextColor={colors.muted} keyboardType="decimal-pad" value={p.height} onChangeText={(v) => update('height', v)} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>몸무게 (kg)</Text>
          <TextInput style={s.input} placeholder="72" placeholderTextColor={colors.muted} keyboardType="decimal-pad" value={p.weight} onChangeText={(v) => update('weight', v)} />
        </View>
      </View>
    </View>
  );
}

// ─── Step 2: 목표 ────────────────────────────────────────────────────────────
function Step2({ p, update }: { p: UserProfile; update: <K extends keyof UserProfile>(k: K, v: UserProfile[K]) => void }) {
  useThemeMode();
  return (
    <View>
      <Text style={s.stepNum}>STEP 2 / 5</Text>
      <Text style={s.q}>목표가 무엇인가요?</Text>
      <Text style={s.desc}>목표에 따라 세트·반복수와 칼로리가 달라집니다.</Text>
      <Opt label="근성장" sub="점진적 과부하 · 증량 식단" on={p.goal === 'muscle'} onPress={() => update('goal', 'muscle')} />
      <Opt label="체지방 감량" sub="볼륨 유지 · 감량 식단" on={p.goal === 'cut'} onPress={() => update('goal', 'cut')} />
      <Opt label="운동 습관 만들기" sub="짧은 루틴 · 꾸준함 우선" on={p.goal === 'habit'} onPress={() => update('goal', 'habit')} />
    </View>
  );
}

// ─── Step 3: 환경 & 경력 ─────────────────────────────────────────────────────
function Step3({ p, update }: { p: UserProfile; update: <K extends keyof UserProfile>(k: K, v: UserProfile[K]) => void }) {
  useThemeMode();
  return (
    <View>
      <Text style={s.stepNum}>STEP 3 / 5</Text>
      <Text style={s.q}>어디서, 얼마나{'\n'}운동하나요?</Text>
      <View style={s.grid2}>
        <Opt label="헬스장" on={p.env === 'gym'} onPress={() => update('env', 'gym')} />
        <Opt label="홈트레이닝" on={p.env === 'home'} onPress={() => update('env', 'home')} />
      </View>

      <Text style={s.label}>주당 운동 일수</Text>
      <View style={s.chipRow}>
        {([2, 3, 4, 5, 6] as const).map((d) => (
          <TouchableOpacity activeOpacity={0.7} key={d} style={[s.chip, p.days === d && s.chipOn]} onPress={() => update('days', d)}>
            <Text style={[s.chipTxt, p.days === d && s.chipOnTxt]}>주 {d}일</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.label}>운동 경력</Text>
      <Opt label="입문" sub="3개월 미만 · 머신과 기본 동작 위주" on={p.level === 1} onPress={() => update('level', 1)} />
      <Opt label="중급" sub="분할 운동 경험 있음" on={p.level === 2} onPress={() => update('level', 2)} />
      <Opt label="상급" sub="프리웨이트 메인" on={p.level === 3} onPress={() => update('level', 3)} />
    </View>
  );
}

// ─── Step 4: 식사 환경 ──────────────────────────────────────────────────────
function Step4({ p, update }: { p: UserProfile; update: <K extends keyof UserProfile>(k: K, v: UserProfile[K]) => void }) {
  useThemeMode();
  return (
    <View>
      <Text style={s.stepNum}>STEP 4 / 5</Text>
      <Text style={s.q}>식사 환경을{'\n'}알려주세요</Text>
      <Text style={s.desc}>체형과 목표에 맞는 현실적인 식단을 구성합니다.</Text>
      <Opt label="편의점 위주" on={p.food === 'convenience'} onPress={() => update('food', 'convenience')} />
      <Opt label="자취 · 직접 요리" on={p.food === 'self'} onPress={() => update('food', 'self')} />
      <Opt label="집밥" on={p.food === 'family'} onPress={() => update('food', 'family')} />
      <Opt label="외식이 잦음" on={p.food === 'out'} onPress={() => update('food', 'out')} />
      <Text style={s.label}>알레르기 · 제외할 음식 (선택)</Text>
      <TextInput style={s.input} placeholder="예: 유제품, 갑각류" placeholderTextColor={colors.muted} value={p.allergy} onChangeText={(v) => update('allergy', v)} />
    </View>
  );
}

// ─── Step 5: 루틴 선택 ──────────────────────────────────────────────────────
function StepRoutine({
  recommendedId, canAI, place, loading, onPreset, onAI, onReco,
}: {
  /** null 이면 추천이 잠겨 있다 — 배지도 정렬도 걸지 않는다 */
  recommendedId: string | null;
  canAI: boolean;
  place: UserProfile['env'];
  loading: string | null;
  onPreset: (id: string) => void;
  onAI: () => void;
  onReco: () => void;
}) {
  useThemeMode();
  const list = [...ROUTINES].sort((a, b) => {
    if (recommendedId) {
      if (a.id === recommendedId) return -1;
      if (b.id === recommendedId) return 1;
    }
    const aFit = a.place.includes(place) ? 0 : 1;
    const bFit = b.place.includes(place) ? 0 : 1;
    return aFit - bFit;
  });

  return (
    <View>
      <Text style={s.stepNum}>STEP 5 / 5</Text>
      <Text style={s.q}>루틴을 선택하세요</Text>
      <Text style={s.desc}>선택한 루틴이 내 플랜이 됩니다. 나중에 언제든 바꿀 수 있어요.</Text>

      {/* 구독 전엔 잠긴 카드가 화면에서 가장 눈에 띄는 요소가 되지 않도록 고스트 스타일로 낮춘다 */}
      <TouchableOpacity activeOpacity={0.7}
        style={[canAI ? s.aiCard : s.aiCardLocked, loading === 'ai' && s.btnOff]}
        onPress={onAI}
        disabled={!!loading}
        accessibilityRole="button"
        accessibilityLabel={canAI ? 'AI 맞춤 구성' : 'AI 맞춤 구성, 구독 기능'}
      >
        {loading === 'ai' ? (
          <ActivityIndicator color={canAI ? colors.bg : colors.ink} />
        ) : (
          <>
            <View style={s.aiHead}>
              <Text style={canAI ? s.aiTitle : s.aiTitleLocked}>AI 맞춤 구성</Text>
              {!canAI && <ProBadge />}
            </View>
            <Text style={canAI ? s.aiSub : s.aiSubLocked}>
              {canAI
                ? '입력한 정보로 종목까지 직접 골라 드립니다'
                : '구독 기능입니다. 아래 루틴은 지금 바로 무료로 쓸 수 있어요'}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {!recommendedId && (
        <TouchableOpacity activeOpacity={0.7} style={s.recoLock} onPress={onReco} disabled={!!loading}>
          <Text style={s.recoLockTxt}>내 조건에 맞는 루틴 추천받기</Text>
          <ProBadge />
        </TouchableOpacity>
      )}

      <Text style={s.label}>루틴 라이브러리</Text>
      {list.map((r) => (
        <TouchableOpacity activeOpacity={0.7}
          key={r.id}
          style={[s.rCard, !!recommendedId && r.id === recommendedId && s.rCardRec, loading === r.id && s.btnOff]}
          onPress={() => onPreset(r.id)}
          disabled={!!loading}
        >
          <View style={s.rHead}>
            <Text style={s.rName}>{r.name}</Text>
            {!!recommendedId && r.id === recommendedId && (
              <View style={s.recBadge}><Text style={s.recBadgeTxt}>추천</Text></View>
            )}
          </View>
          <Text style={s.rSub}>{r.subtitle}</Text>
          <View style={s.rMetaRow}>
            <Text style={s.rMeta}>{r.days.length}개 데이</Text>
            <Text style={s.rDot}>·</Text>
            <Text style={s.rMeta}>{routineExCount(r)}종목</Text>
            <Text style={s.rDot}>·</Text>
            <Text style={s.rMeta}>{r.place.includes('home') ? '홈트 가능' : '헬스장'}</Text>
          </View>
          {loading === r.id && <ActivityIndicator color={colors.mid} style={{ marginTop: 8 }} />}
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Shared ─────────────────────────────────────────────────────────────────
function Opt({ label, sub, on, onPress }: { label: string; sub?: string; on: boolean; onPress: () => void }) {
  useThemeMode();
  return (
    <TouchableOpacity activeOpacity={0.7} style={[s.opt, on && s.optOn]} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={[s.optTxt, on && s.optTxtOn]}>{label}</Text>
        {sub ? <Text style={s.optSub}>{sub}</Text> : null}
      </View>
      <Text style={[s.optDot, on && s.optDotOn]}>{on ? '●' : '○'}</Text>
    </TouchableOpacity>
  );
}

const s = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  progRow: { flexDirection: 'row', gap: 5, padding: 22, paddingBottom: 0 },
  progBar: { flex: 1, height: 3, borderRadius: 3, backgroundColor: colors.panel3 },
  progOn: { backgroundColor: colors.ink },
  scroll: { flex: 1 },
  scrollInner: { padding: 22, paddingBottom: 16 },
  foot: { flexDirection: 'row', gap: 10, padding: 18 },
  backBtn: {
    flex: 0, minWidth: 90, borderWidth: 1, borderColor: colors.line2,
    borderRadius: 10, paddingVertical: 15, alignItems: 'center',
  },
  backTxt: { color: colors.mid, fontSize: 14, fontWeight: '600' },
  nextBtn: { flex: 1, backgroundColor: colors.ink, borderRadius: 10, paddingVertical: 15, alignItems: 'center' },
  btnOff: { opacity: 0.35 },
  nextTxt: { color: colors.bg, fontSize: 15, fontWeight: '700' },

  stepNum: { fontSize: 11, fontWeight: '700', color: colors.muted, letterSpacing: 2, marginBottom: 10 },
  q: { fontSize: 23, fontWeight: '700', color: colors.ink, lineHeight: 32, marginBottom: 6 },
  desc: { fontSize: 13, color: colors.muted, marginBottom: 20, lineHeight: 20 },
  label: { fontSize: 12, color: colors.muted, marginTop: 16, marginBottom: 6 },
  input: {
    backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line2,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: colors.ink,
  },
  grid2: { flexDirection: 'row', gap: 9 },
  opt: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.line2,
    borderRadius: 10, padding: 15, marginBottom: 9, flex: 1,
  },
  optOn: { borderColor: colors.ink, backgroundColor: colors.panel2 },
  optTxt: { fontSize: 15, color: colors.mid },
  optTxtOn: { color: colors.ink, fontWeight: '600' },
  optSub: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
  optDot: { fontSize: 14, color: colors.muted },
  optDotOn: { color: colors.ink },
  chipRow: { flexDirection: 'row', gap: 7, flexWrap: 'wrap', marginBottom: 4 },
  chip: { borderWidth: 1, borderColor: colors.line2, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipTxt: { fontSize: 13, color: colors.mid },
  chipOnTxt: { color: colors.bg, fontWeight: '600' },

  aiCard: {
    backgroundColor: colors.ink, borderRadius: 16, padding: 18,
    alignItems: 'center', marginTop: 4, minHeight: 78, justifyContent: 'center',
  },
  aiCardLocked: {
    backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line2, borderRadius: 16,
    padding: 18, alignItems: 'center', marginTop: 4, minHeight: 78, justifyContent: 'center',
  },
  aiTitleLocked: { fontSize: 15, fontWeight: '700', color: colors.mid },
  aiSubLocked: { fontSize: 12, color: colors.muted, marginTop: 4, lineHeight: 18 },
  aiHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  aiTitle: { fontSize: 16, fontWeight: '800', color: colors.bg },
  aiSub: { fontSize: 12, color: colors.onAccentSub, marginTop: 4, lineHeight: 18 },
  recoLock: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    backgroundColor: colors.panel2, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: colors.line2, marginTop: 10,
  },
  recoLockTxt: { fontSize: 13, fontWeight: '600', color: colors.mid, flexShrink: 1 },

  rCard: {
    backgroundColor: colors.panel, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.line, marginBottom: 10,
  },
  rCardRec: { borderColor: colors.line2, backgroundColor: colors.panel2 },
  rHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  recBadge: { backgroundColor: colors.panel3, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  recBadgeTxt: { fontSize: 10, fontWeight: '800', color: colors.ink, letterSpacing: 0.5 },
  rSub: { fontSize: 12, color: colors.muted, marginTop: 4 },
  rMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  rMeta: { fontSize: 11, color: colors.mid },
  rDot: { fontSize: 11, color: colors.muted },
}));
