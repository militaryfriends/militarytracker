/**
 * O8 프로젝트 제안 — 지금 몸에서 실제로 도달할 수 있는 프로젝트 2개(기간 + 예상 몸). 결제 화면.
 *
 * 블러 없음: 예상 몸 · 숫자는 결제 전에도 전부 보인다. 잠그는 건 그 몸을 만드는 실행(루틴 · 식단 · 체크인)뿐.
 * 결제 버튼 바로 위에 프로 혜택을 "이 몸을 만드는 도구"로 나열한다.
 * 거절해도 분석은 저장되고 홈의 "내 변화 프로젝트" 카드에서 이 화면으로 다시 온다.
 */
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, themed, useThemeMode } from '../../src/theme';
import { PressableScale } from '../../src/ui';
import { useAuthStore } from '../../src/stores/authStore';
import { useAppStore } from '../../src/stores/appStore';
import { useOnboardDraft } from '../../src/stores/onboardDraft';
import { useEntitlement } from '../../src/hooks/useEntitlement';
import { PRODUCTS, TRIAL_DAYS } from '../../src/config/entitlements';
import { saveOnboarding, saveProfile } from '../../src/services/authService';
import { saveAnalysis, setAnalysisDecision } from '../../src/services/bodyService';
import { buildLocalPlan } from '../../src/utils/planner';
import { showAlert } from '../../src/utils/alert';
import { ProjectCard } from '../../src/components/body/ProjectCard';
import { ChangePreview } from '../../src/components/body/ChangePreview';
import { analyzeBody } from '../../src/utils/bodyAnalysis';
import type { MonthPoint } from '../../src/utils/projection';
import { AccuracyMeter } from '../../src/components/onboard/StepBody';
import { profileFromAnalysis } from '../../src/components/body/format';
import { EmptyState, useSafeBack } from '../../src/components/ui';

/** 이 몸을 만드는 도구 — 프로 혜택 (서버 한도와 같은 값: 코치 하루 10회 = functions/src/quota.ts) */
const TOOLS: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: 'barbell-outline', label: '맞춤 루틴' },
  { icon: 'restaurant-outline', label: '단계별 식단' },
  { icon: 'calendar-outline', label: '4주 체크인' },
  { icon: 'chatbubble-ellipses-outline', label: 'AI 코치 하루 10회' },
];

export default function ProjectsScreen() {
  useThemeMode();
  const router = useRouter();
  const goBack = useSafeBack();
  const insets = useSafeAreaInsets();
  const { redo } = useLocalSearchParams<{ redo?: string }>();
  const user = useAuthStore((st) => st.user);
  const patchUser = useAuthStore((st) => st.patchUser);
  const a = useAppStore((st) => st.analysis);
  const project = useAppStore((st) => st.project);
  const { setAnalysis, setPlan, setProfile } = useAppStore();
  const { pro, sub } = useEntitlement();
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { width } = useWindowDimensions();

  // 저장된 분석에는 프로젝트별 트랙이 없다 — 같은 입력 · 같은 엔진이면 같은 결과라 다시 계산해 달마다 몸을 보여 준다
  const tracks = useMemo<Record<string, MonthPoint[]> | null>(() => {
    if (!a) return null;
    try {
      const core = analyzeBody(a.input, { mode: a.goal.mode, archetypeId: a.goal.archetypeId });
      if (core.engineVersion !== a.engineVersion) return null;
      return Object.fromEntries(core.projects.map((p) => [p.id, p.track]));
    } catch {
      return null;
    }
  }, [a]);

  if (!a) {
    return (
      <SafeAreaView style={s.root}>
        <EmptyState text="분석 결과가 없어요." cta="내 몸 분석하기" onCta={() => router.replace('/project/new')} />
      </SafeAreaView>
    );
  }

  const sel = picked ?? a.projects.find((p) => p.recommended)?.id ?? a.projects[0].id;
  const running = !!project && project.analysisId === a.id && project.status === 'active';
  const trial = TRIAL_DAYS > 0 && !sub.trialUsed && !pro;
  const monthly = PRODUCTS.find((p) => p.id === 'mt_pro_monthly') ?? PRODUCTS[0];
  const yearly = PRODUCTS.find((p) => p.id === 'mt_pro_yearly');
  const priceLine = pro
    ? '구독 중이라 추가 결제 없이 시작해요'
    : trial
    ? `${TRIAL_DAYS}일 무료 체험 후 월 ${monthly.price.replace('₩', '')}원`
    : `월 ${monthly.price.replace('₩', '')}원${yearly ? ` · 연 ${yearly.price.replace('₩', '')}원` : ''}`;

  function start() {
    if (!a) return;
    if (pro) router.push(`/project/start?project=${sel}`);
    else router.push(`/subscribe?f=body_project&project=${sel}`);
  }

  // "아니에요, 괜찮아요 운동 자세만 볼래요" — 분석은 그대로 저장, 무료로 들어간다(착지는 자세 탭)
  async function decline() {
    if (!user || !a || busy) return;
    setBusy(true);
    try {
      const d = useOnboardDraft.getState();
      const profile = profileFromAnalysis(a, d.seeded ? d.profile : useAppStore.getState().profile);
      // 처음 가입 · "온보딩 처음부터 다시 하기" → 루틴도 새 입력으로. 홈에서 다시 분석 → 프로필만
      if (!user.onboardingDone || d.restart) {
        const plan = d.localPlan ?? buildLocalPlan(profile);
        await saveOnboarding(user.uid, profile, plan);
        setPlan(plan);
        setProfile(profile);
        patchUser({ onboardingDone: true, profile });
      } else if (redo) {
        await saveProfile(user.uid, profile);
        setProfile(profile);
        patchUser({ profile });
      }
      const next = { ...a, decision: 'declined' as const };
      setAnalysis(next);
      if (a.pending) saveAnalysis(next).then((ok) => ok && setAnalysis({ ...next, pending: undefined })).catch(() => {});
      else setAnalysisDecision(a.id, 'declined').catch(() => {});
      useOnboardDraft.getState().reset();
      router.replace('/tabs/form');
    } catch {
      showAlert('오류', '저장에 실패했습니다. 연결을 확인하고 다시 시도해주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={s.inner} showsVerticalScrollIndicator={false}>
        {user?.onboardingDone ? (
          <TouchableOpacity onPress={goBack} hitSlop={12} style={s.back} accessibilityRole="button" accessibilityLabel="뒤로">
            <Text style={s.backTxt}>←</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={s.title} accessibilityRole="header">내 변화 프로젝트</Text>
        <Text style={s.sub}>지금 몸에서 실제로 도달할 수 있는 프로젝트 2가지예요</Text>
        <View style={s.acc}>
          <AccuracyMeter accuracy={a.comp.accuracy} compact />
        </View>

        {(() => {
          const cur = a.projects.find((p) => p.id === sel) ?? a.projects[0];
          return (
            <ChangePreview
              key={cur.id}
              sex={a.input.sex}
              title={cur.name}
              months={cur.months}
              start={{ cell: a.cell, coord: a.coord, weightKg: a.input.weightKg, bfPct: a.comp.bfPct }}
              end={cur.end}
              track={tracks?.[cur.id] ?? null}
              width={Math.min(width, 520) - 36}
            />
          );
        })()}

        {a.projects.map((p) => (
          <ProjectCard
            key={p.id}
            sex={a.input.sex}
            project={p}
            fromCell={a.cell}
            selected={p.id === sel}
            onPress={running ? undefined : () => setPicked(p.id)}
            days={a.input.days}
          />
        ))}

        <TouchableOpacity onPress={() => router.push(redo ? '/project/compare?redo=1' : '/project/compare')} style={s.again} accessibilityRole="button">
          <Text style={s.againTxt}>지금 몸 vs 목표 몸 다시 보기</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={[s.foot, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        {running ? (
          <>
            <Text style={s.lead}>진행 중인 프로젝트예요</Text>
            <PressableScale style={s.cta} onPress={() => router.replace('/project/checkin')} accessibilityLabel="진행 상황 보기">
              <Text style={s.ctaTxt}>진행 상황 보기</Text>
            </PressableScale>
          </>
        ) : (
          <>
            <Text style={s.toolsHead}>이 몸을 만드는 도구</Text>
            <View style={s.tools}>
              {TOOLS.map((t) => (
                <View key={t.label} style={s.tool}>
                  <Ionicons name={t.icon} size={15} color={colors.ink} />
                  <Text style={s.toolTxt} numberOfLines={1}>{t.label}</Text>
                </View>
              ))}
            </View>
            <PressableScale style={s.cta} onPress={start} disabled={busy}
              accessibilityLabel={pro ? '맞춤형 프로젝트 바로 시작하기' : '결제하시면 바로 맞춤형 프로젝트 진행합니다'}>
              <Text style={s.ctaTxt}>{pro ? '맞춤형 프로젝트 바로 시작하기' : '결제하시면 바로 맞춤형 프로젝트 진행합니다!'}</Text>
            </PressableScale>
            <Text style={s.price}>{priceLine}</Text>
            <TouchableOpacity onPress={decline} disabled={busy} style={s.decline} accessibilityRole="button">
              <Text style={s.declineTxt}>아니에요, 괜찮아요 운동 자세만 볼래요</Text>
            </TouchableOpacity>
          </>
        )}
        <Text style={s.notice}>예상 몸은 입력값과 보수적인 변화 속도로 계산한 추정치예요. 실제 결과는 운동·식단 실천에 따라 달라져요.</Text>
      </View>
    </SafeAreaView>
  );
}

const s = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  inner: { paddingHorizontal: 18, paddingTop: 22, paddingBottom: 16 },
  back: { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start', marginBottom: 4 },
  backTxt: { fontSize: 20, color: colors.ink, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  sub: { fontSize: 13.5, color: colors.muted, marginTop: 6, lineHeight: 20 },
  acc: { marginTop: 10, marginBottom: 16 },
  again: { alignItems: 'center', paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  againTxt: { fontSize: 12.5, color: colors.mid, fontWeight: '600', textDecorationLine: 'underline' },
  foot: {
    paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg,
  },
  toolsHead: { fontSize: 11, fontWeight: '800', color: colors.muted, letterSpacing: 1 },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, marginBottom: 10 },
  tool: {
    flexDirection: 'row', alignItems: 'center', gap: 6, width: '48.8%',
    backgroundColor: colors.panel2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: colors.line,
  },
  toolTxt: { fontSize: 12.5, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  lead: { fontSize: 13, fontWeight: '700', color: colors.ink, textAlign: 'center', marginBottom: 8 },
  cta: { backgroundColor: colors.ink, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 12, alignItems: 'center' },
  ctaTxt: { color: colors.bg, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  price: { fontSize: 11.5, color: colors.muted, textAlign: 'center', marginTop: 6 },
  decline: { alignItems: 'center', minHeight: 40, justifyContent: 'center' },
  declineTxt: { fontSize: 13, color: colors.mid, fontWeight: '600' },
  notice: { fontSize: 11, color: colors.muted, lineHeight: 16, textAlign: 'center', marginTop: 2 },
}));
