/**
 * 온보딩 입력 단계(O1~O5) — 세 곳이 같은 흐름을 쓴다.
 *  first   = 처음 가입
 *  redo    = 홈 "내 몸 분석하기" — 저장된 프로필 · 목표로 채움, 습관 경로 없음
 *  restart = 마이 "온보딩 처음부터 다시 하기" — 기본 정보만 채우고 목표부터 새로 고름, 습관 경로 있음,
 *            거절해도 처음 가입처럼 루틴을 새로 정한다(draft.restart)
 *
 *  체형 경로: O1 기본 → O2 원하는 체형 → O3 현재 체형 → O4 환경·경력 → O5 식사 → O6 분석(/project/analysis)
 *  습관 경로: O1 → O2("체형보다 운동 습관이 먼저예요") → O4 → O5 → 루틴 선택(예전 Step 5) — O3·O6~O8 건너뜀
 *  두 경로 모두 입력 5단계라 "STEP n / 5". 온보딩에서는 AI 를 부르지 않는다(습관 경로의 AI 구성 버튼은 구독자만).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useThemeMode } from '../../theme';
import { showAlert } from '../../utils/alert';
import { useAuthStore } from '../../stores/authStore';
import { useAppStore } from '../../stores/appStore';
import { useOnboardDraft, DEFAULT_PROFILE, type StepKey } from '../../stores/onboardDraft';
import { saveOnboarding } from '../../services/authService';
import { generatePlan, QuotaExceeded, SubscriptionRequired } from '../../services/aiService';
import { validateProfile } from '../../utils/body';
import { useEntitlement } from '../../hooks/useEntitlement';
import { planFromRoutine } from '../../utils/planner';
import { recommendRoutine } from '../../data/routines';
import { draftAccuracy, validateBodyDraft } from './draftInput';
import { StepBasic, StepEnv, StepFood, StepRoutine } from './basicSteps';
import { StepGoal } from './StepGoal';
import { StepBody, type BodyErrors } from './StepBody';
import { o } from './styles';

const BODY_PATH: StepKey[] = ['basic', 'goal', 'body', 'env', 'food'];
const HABIT_PATH: StepKey[] = ['basic', 'goal', 'env', 'food', 'routine'];

export type FlowMode = 'first' | 'redo' | 'restart';

export function OnboardFlow({ mode }: { mode: FlowMode }) {
  useThemeMode();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, patchUser } = useAuthStore();
  const { setProfile, setPlan } = useAppStore();
  const savedProfile = useAppStore((s) => s.profile);
  const d = useOnboardDraft();
  const [idx, setIdx] = useState(0);
  const [bodyErr, setBodyErr] = useState<BodyErrors>({});
  const [loading, setLoading] = useState<string | null>(null);

  // 처음 열 때 한 번 채운다 — 다시 분석이면 저장된 프로필에서. O7 에서 돌아온 거면(resume) 입력 그대로
  useEffect(() => {
    const st = useOnboardDraft.getState();
    if (st.resume) return;
    if (mode === 'first' && st.seeded) return;
    if (mode !== 'first' && savedProfile) {
      st.reset({
        profile: { ...DEFAULT_PROFILE, ...savedProfile, goal: savedProfile.goal === 'habit' ? 'muscle' : savedProfile.goal },
        waist: savedProfile.waistCm ? String(savedProfile.waistCm) : '',
        // 처음부터 다시 하기는 목표를 새로 고른다
        pick: mode === 'redo' && savedProfile.goalArchetypeId ? { mode: 'pick', archetypeId: savedProfile.goalArchetypeId } : null,
        restart: mode === 'restart',
      });
    } else {
      st.reset({ restart: mode === 'restart' });
    }
    // 화면이 열릴 때 한 번만 — 프로필이 바뀌었다고 입력 중인 값을 덮어쓰지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const withHabit = mode !== 'redo';
  const path = d.habit && withHabit ? HABIT_PATH : BODY_PATH;
  const key = path[Math.min(idx, path.length - 1)];
  const total = path.length;

  // O7 "허리둘레를 넣으면 더 정확해져요" → O3 로 돌아온다
  useEffect(() => {
    if (!d.resume) return;
    const i = path.indexOf(d.resume);
    if (i >= 0) setIdx(i);
    d.patch({ resume: null });
  }, [d.resume, path, d]);

  const accuracy = useMemo(() => draftAccuracy(d), [d]);

  function go(delta: number) {
    setBodyErr({});
    setIdx((v) => Math.max(0, Math.min(path.length - 1, v + delta)));
  }

  function next() {
    if (key === 'basic') {
      // 빈 값만 보면 '1.75', '800', '-5' 가 통과해 BMI 235102 같은 값이 화면에 나간다
      const err = validateProfile(d.profile);
      if (err) {
        showAlert('입력 확인', err);
        return;
      }
    }
    if (key === 'body') {
      const e = validateBodyDraft(d);
      if (e.waist || e.bf || e.smm || e.date) {
        setBodyErr(e);
        return;
      }
      setBodyErr({});
    }
    if (key === 'food' && path === BODY_PATH) {
      // 가입한 사용자(redo · restart)는 redo=1 — 뒤로 가기 · 빈 화면 처리가 홈 기준이 된다
      router.push(mode === 'first' ? '/project/analysis' : '/project/analysis?redo=1');
      return;
    }
    go(1);
  }

  // ─── 습관 경로: 예전 루틴 선택 그대로 ────────────────────────────────────────
  // 루틴 추천과 AI 구성은 구독 기능이다. 구독 전에는 추천 배지도 정렬도 걸지 않는다 — 보여 주면 이미 준 것이다.
  const { can } = useEntitlement();
  const canAI = can('ai_plan');
  const recommendedId = can('routine_reco')
    ? recommendRoutine({ place: d.profile.env, days: d.profile.days, level: d.profile.level }).id
    : null;
  const habitProfile = { ...d.profile, goal: 'habit' as const };

  async function choosePreset(routineId: string) {
    if (!user || loading) return;
    setLoading(routineId);
    try {
      const plan = planFromRoutine(routineId);
      if (!plan) throw new Error('routine not found');
      await saveOnboarding(user.uid, habitProfile, plan);
      setProfile(habitProfile);
      setPlan(plan);
      patchUser({ onboardingDone: true, profile: habitProfile });
      useOnboardDraft.getState().reset();
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
      const { plan, fallback, reason } = await generatePlan(habitProfile);
      await saveOnboarding(user.uid, habitProfile, plan);
      setProfile(habitProfile);
      setPlan(plan);
      patchUser({ onboardingDone: true, profile: habitProfile });
      useOnboardDraft.getState().reset();
      router.replace('/tabs/home');
      if (fallback) {
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

  const canNext = key === 'basic'
    ? !!(d.profile.age && d.profile.height && d.profile.weight)
    : key === 'goal' ? d.pick?.mode === 'pick' : true;
  const isLastInput = key === 'food' && path === BODY_PATH;

  return (
    <SafeAreaView style={o.root} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View
          style={o.progRow}
          accessibilityRole="progressbar"
          accessibilityLabel={`${idx + 1}단계, 전체 ${total}단계`}
          accessibilityValue={{ min: 1, max: total, now: idx + 1 }}
        >
          {Array.from({ length: total }).map((_, i) => (
            <View key={i} style={[o.progBar, i <= idx && o.progOn]} />
          ))}
        </View>

        <ScrollView style={o.scroll} contentContainerStyle={o.scrollInner} keyboardShouldPersistTaps="handled">
          {key === 'basic' && <StepBasic p={d.profile} update={d.setProfile} num={idx + 1} total={total} />}
          {key === 'goal' && (
            <StepGoal
              sex={d.profile.sex}
              pick={d.pick}
              num={idx + 1}
              total={total}
              onPick={(id) => d.patch({ pick: { mode: 'pick', archetypeId: id }, habit: false })}
              onAuto={() => { d.patch({ pick: { mode: 'auto' }, habit: false }); setIdx(BODY_PATH.indexOf('body')); }}
              onHabit={withHabit ? () => { d.patch({ habit: true, pick: null }); setIdx(HABIT_PATH.indexOf('env')); } : undefined}
            />
          )}
          {key === 'body' && (
            <StepBody
              num={idx + 1}
              total={total}
              waist={d.waist}
              inbody={d.inbody}
              accuracy={accuracy}
              errors={bodyErr}
              onWaist={(v) => { d.patch({ waist: v }); setBodyErr({}); }}
              onInbody={(v) => { d.patch({ inbody: v }); setBodyErr({}); }}
            />
          )}
          {key === 'env' && <StepEnv p={d.profile} update={d.setProfile} num={idx + 1} total={total} />}
          {key === 'food' && <StepFood p={d.profile} update={d.setProfile} num={idx + 1} total={total} />}
          {key === 'routine' && (
            <StepRoutine
              num={idx + 1}
              total={total}
              recommendedId={recommendedId}
              canAI={canAI}
              onReco={() => router.push('/subscribe?f=routine_reco')}
              place={d.profile.env}
              loading={loading}
              onPreset={choosePreset}
              onAI={chooseAI}
            />
          )}
        </ScrollView>

        <View style={[o.foot, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          {idx > 0 || mode !== 'first' ? (
            <TouchableOpacity activeOpacity={0.7} style={o.backBtn} accessibilityRole="button"
              onPress={() => (idx > 0 ? go(-1) : router.back())}>
              <Text style={o.backTxt}>{idx > 0 ? '이전' : '닫기'}</Text>
            </TouchableOpacity>
          ) : null}
          {key !== 'routine' && (
            <TouchableOpacity activeOpacity={0.7}
              style={[o.nextBtn, !canNext && o.btnOff]}
              disabled={!canNext}
              onPress={next}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canNext }}
            >
              <Text style={o.nextTxt}>{isLastInput ? '내 몸 분석하기' : '다음'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
