/**
 * 결제 후 프로젝트 시작 — O6 와 같은 체크리스트 로딩.
 *   1) 분석 결과가 서버에 올라가 있는지 (pending 이면 다시 올린다)
 *   2) projectStart: 서버가 구독을 확인하고, 저장된 입력으로 엔진을 다시 돌려 bodyProjects 를 만든다
 *   3) aiPlan(projectId): 프로젝트 단계 타임라인으로 루틴 — 실패하면 자동 구성으로 시작(운동 탭에서 다시 시도)
 *   4) aiDiet(projectId): 칼로리 · 단백질 · 끼니별 숫자는 서버(엔진)가 넣는다. AI 는 메뉴 글만.
 *   5) 프로필 · 플랜 저장, 온보딩 완료 → 홈("프로젝트가 시작되었습니다" + 첫 체크인 D-28)
 * 숫자를 AI 가 바꿀 수 없게: 앱이 보내는 건 id 뿐이고 서버가 숫자를 정한다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, themed, useThemeMode } from '../../src/theme';
import { PressableScale, haptic } from '../../src/ui';
import { useAuthStore } from '../../src/stores/authStore';
import { useAppStore } from '../../src/stores/appStore';
import { useOnboardDraft } from '../../src/stores/onboardDraft';
import { saveAnalysis } from '../../src/services/bodyService';
import { generateDiet, generatePlan, startProject, SubscriptionRequired } from '../../src/services/aiService';
import { saveOnboarding } from '../../src/services/authService';
import { buildLocalPlan } from '../../src/utils/planner';
import { profileFromAnalysis } from '../../src/components/body/format';
import type { BodyProject, DietPlan, Plan } from '../../src/types';

const STEPS = [
  '분석 결과를 확인하는 중입니다',
  '프로젝트를 확정하는 중입니다',
  '프로젝트 루틴을 완성하는 중입니다',
  '단계별 식단을 완성하는 중입니다',
  '프로젝트를 저장하는 중입니다',
];
/** 단계마다 최소 표시 시간 — 너무 빨리 넘어가면 무엇이 됐는지 읽을 수 없다 */
const MIN_MS = 700;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function ProjectStartScreen() {
  useThemeMode();
  const router = useRouter();
  const { project: projectRef } = useLocalSearchParams<{ project?: string }>();
  const user = useAuthStore((st) => st.user);
  const patchUser = useAuthStore((st) => st.patchUser);
  const [step, setStep] = useState(0);
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const running = useRef(false);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => !error);
    return () => sub.remove();
  }, [error]);

  const run = useCallback(async () => {
    if (running.current || !user) return;
    running.current = true;
    setError(null);
    setStep(0);
    setLines([]);
    const st = useAppStore.getState();
    const a = st.analysis;
    const ref = projectRef === 'p1' || projectRef === 'p2' ? projectRef : null;
    const note = (i: number, t: string) => setLines((l) => { const n = [...l]; n[i] = t; return n; });
    const timed = async <T,>(fn: () => Promise<T>): Promise<T> => {
      const t0 = Date.now();
      const r = await fn();
      await wait(Math.max(0, MIN_MS - (Date.now() - t0)));
      return r;
    };
    try {
      if (!a || !ref) throw new Error('선택한 프로젝트를 찾지 못했습니다. 분석 화면에서 다시 골라주세요.');

      // 1) 분석 문서가 서버에 있어야 서버가 다시 계산할 수 있다
      await timed(async () => {
        if (!a.pending) return;
        const ok = await saveAnalysis(a);
        if (!ok) throw new Error('네트워크 연결을 확인하고 다시 시도해주세요.');
        useAppStore.getState().setAnalysis({ ...a, pending: undefined });
      });
      haptic.tap();
      note(0, '확인 완료');
      setStep(1);

      // 2) 프로젝트 — 서버가 엔진으로 다시 계산한 값
      const proj: BodyProject = await timed(() => startProject(a.id, ref));
      st.setProject(proj);
      st.setAnalysis({ ...useAppStore.getState().analysis!, decision: 'started' });
      haptic.tap();
      note(1, `${proj.name} · ${proj.months}개월`);
      setStep(2);

      const d = useOnboardDraft.getState();
      const profile = profileFromAnalysis(a, d.seeded ? d.profile : st.profile);

      // 3) 루틴 — 실패해도 자동 구성으로 시작한다
      let plan: Plan;
      let planNote: string;
      try {
        const r = await timed(() => generatePlan(profile, { projectId: proj.id }));
        plan = r.plan;
        planNote = r.fallback ? '자동 구성으로 시작 — 운동 탭에서 다시 시도할 수 있어요' : `${plan.days.length}개 데이 구성 완료`;
      } catch (e) {
        if (e instanceof SubscriptionRequired) throw e;
        plan = d.localPlan ?? buildLocalPlan(profile);
        planNote = '자동 구성으로 시작 — 운동 탭에서 다시 시도할 수 있어요';
      }
      haptic.tap();
      note(2, planNote);
      setStep(3);

      // 4) 식단 — 숫자는 서버가 정한다(target)
      let diet: DietPlan | null = null;
      try {
        diet = await timed(() => generateDiet(profile, undefined, { projectId: proj.id }));
      } catch (e) {
        if (e instanceof SubscriptionRequired) throw e;
      }
      haptic.tap();
      note(3, diet?.target
        ? `하루 ${diet.target.kcal.toLocaleString('ko-KR')}kcal · 단백질 ${diet.target.protein}g`
        : `하루 ${proj.nutrition.kcal.toLocaleString('ko-KR')}kcal · 단백질 ${proj.nutrition.proteinG}g`);
      setStep(4);

      // 5) 저장 — 온보딩 중이었다면 여기서 끝난다
      await timed(() => saveOnboarding(user.uid, profile, plan));
      st.setProfile(profile);
      st.setPlan(plan);
      if (diet) st.setDiet(diet);
      patchUser({ onboardingDone: true, profile });
      useOnboardDraft.getState().reset();
      note(4, '첫 체크인은 4주 뒤예요');
      setStep(5);
      setDone(true);
      haptic.success();
      await wait(1100);
      router.replace('/tabs/home');
    } catch (e) {
      running.current = false;
      if (e instanceof SubscriptionRequired) {
        router.replace(`/subscribe?f=body_project&project=${ref ?? ''}`);
        return;
      }
      haptic.error();
      setError(e instanceof Error && e.message ? e.message : '프로젝트를 시작하지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
  }, [user, projectRef, router, patchUser]);

  useEffect(() => {
    run();
  }, [run]);

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.inner}>
        {done ? (
          <Animated.View entering={FadeIn.duration(260)} style={s.doneHead}>
            <Ionicons name="checkmark-circle" size={30} color={colors.ink} />
            <Text style={s.title} accessibilityLiveRegion="polite">프로젝트가 시작되었습니다</Text>
          </Animated.View>
        ) : (
          <Text style={s.title} accessibilityRole="header">프로젝트를 준비하고 있어요</Text>
        )}
        <View style={s.list}>
          {STEPS.map((t, i) => {
            const state = i < step ? 'done' : i === step && !error ? 'now' : i === step && error ? 'fail' : 'wait';
            return (
              <View key={t} style={s.row}>
                <View style={s.icon}>
                  {state === 'done' ? <Ionicons name="checkmark-circle" size={22} color={colors.ink} />
                    : state === 'now' ? <ActivityIndicator size="small" color={colors.ink} />
                    : state === 'fail' ? <Ionicons name="alert-circle" size={22} color={colors.wrong} />
                    : <View style={s.ring} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.stepTxt, state === 'now' && s.stepNow, state === 'wait' && s.stepWait]}>{t}</Text>
                  {state === 'done' && lines[i] ? <Text style={s.sub}>{lines[i]}</Text> : null}
                </View>
              </View>
            );
          })}
        </View>

        {error ? (
          <View style={s.err}>
            <Text style={s.errTxt} accessibilityRole="alert">{error}</Text>
            <PressableScale style={s.retry} onPress={run} accessibilityLabel="다시 시도">
              <Text style={s.retryTxt}>다시 시도</Text>
            </PressableScale>
            <PressableScale haptic={false} style={s.later}
              onPress={() => router.replace(user?.onboardingDone ? '/tabs/home' : '/project')}>
              <Text style={s.laterTxt}>{user?.onboardingDone ? '홈으로' : '프로젝트 화면으로'}</Text>
            </PressableScale>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const s = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, paddingHorizontal: 24, paddingTop: 40 },
  doneHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 23, fontWeight: '800', color: colors.ink, letterSpacing: -0.3, flexShrink: 1 },
  list: { marginTop: 30, gap: 22 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  icon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', marginTop: -1 },
  ring: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.line2 },
  stepTxt: { fontSize: 15, color: colors.mid, lineHeight: 22 },
  stepNow: { color: colors.ink, fontWeight: '800' },
  stepWait: { color: colors.placeholder },
  sub: { fontSize: 12.5, color: colors.muted, marginTop: 3, lineHeight: 18 },
  err: { marginTop: 30, gap: 10 },
  errTxt: { fontSize: 13.5, color: colors.wrong, lineHeight: 20 },
  retry: { backgroundColor: colors.ink, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  retryTxt: { color: colors.bg, fontSize: 15, fontWeight: '800' },
  later: { alignItems: 'center', paddingVertical: 12 },
  laterTxt: { color: colors.mid, fontSize: 13.5, fontWeight: '600' },
}));
