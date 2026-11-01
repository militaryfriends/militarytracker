/**
 * 온보딩 — 질문 하나에 화면 하나(2026-11-01, 대표 피드백 10/31 1절의 12단계). 세 곳이 같은 흐름을 쓴다.
 *  first   = 처음 가입
 *  redo    = 홈 "내 몸 계산하기" — 저장된 프로필로 채움
 *  restart = 마이 "온보딩 처음부터 다시 하기" — 거절해도 처음 가입처럼 루틴을 새로 정한다(draft.restart)
 *
 *  1 성별 → 2 나이 → 3 키 → 4 체중 → 5 허리 · 인바디(선택) → 6 운동 경력 → 7 운동 장소 → 8 주 운동 일수 → 9 식사 환경
 *  → 10 신경 쓰이는 부위(선택) → 11 계산 중(/project/analysis) → 12 지금 내 몸(3D) → 프로젝트 카드 4장(/project)
 *  '원하는 체형' 고르기는 없다 — 목표는 결과를 본 뒤 카드에서 고른다. 온보딩에서는 AI 를 부르지 않는다.
 *  예전 습관 경로(목표 단계의 "습관이 먼저")는 카드 화면의 "운동 자세만 볼래요"가 대신한다.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  InteractionManager, KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useThemeMode } from '../../theme';
import { showAlert } from '../../utils/alert';
import { useAuthStore } from '../../stores/authStore';
import { useAppStore } from '../../stores/appStore';
import { useOnboardDraft, DEFAULT_PROFILE, type StepKey } from '../../stores/onboardDraft';
import { validateField, validateProfile } from '../../utils/body';
import { draftAccuracy, validateBodyDraft } from './draftInput';
import { StepFood } from './basicSteps';
import { StepDays, StepFocus, StepLevel, StepNumber, StepPlace, StepSex } from './questionSteps';
import { StepBody, type BodyErrors } from './StepBody';
import { o } from './styles';
import { preload3D } from '../body/avatar3d/Avatar3D';

const BODY_PATH: StepKey[] = ['sex', 'age', 'height', 'weight', 'body', 'level', 'place', 'days', 'food', 'focus'];
/** 계산 · 결과까지 합친 전체 단계 수(진행 막대 · STEP n / 12) */
const TOTAL_STEPS = 12;

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
        pick: null,
        restart: mode === 'restart',
      });
    } else {
      st.reset({ restart: mode === 'restart' });
    }
    // 화면이 열릴 때 한 번만 — 프로필이 바뀌었다고 입력 중인 값을 덮어쓰지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const path = BODY_PATH;
  const key = path[Math.min(idx, path.length - 1)];
  const total = TOTAL_STEPS;
  const [numErr, setNumErr] = useState<string | null>(null);

  // O7 "허리둘레를 넣으면 더 정확해져요" → O3 로 돌아온다
  useEffect(() => {
    if (!d.resume) return;
    const i = path.indexOf(d.resume);
    if (i >= 0) setIdx(i);
    d.patch({ resume: null });
  }, [d.resume, path, d]);

  // 3D 모델을 미리 읽어 둔다 — 숫자 입력(키패드)이 끝난 '현재 체형' 단계부터, 화면 전환이 끝난 뒤.
  // 첫 3D 표시(glb 파싱 · 텍스처)가 계산 화면에서 JS 를 몇 초 붙잡던 것(10/31 피드백 1절 "계산 21초")을 미리 치운다.
  const sex = d.profile.sex;
  const warm = idx >= path.indexOf('body');
  useEffect(() => {
    if (!warm || !sex) return;
    const t = InteractionManager.runAfterInteractions(() => preload3D(sex));
    return () => t.cancel();
  }, [warm, sex]);

  const accuracy = useMemo(() => draftAccuracy(d), [d]);

  function go(delta: number) {
    setBodyErr({});
    setNumErr(null);
    setIdx((v) => Math.max(0, Math.min(path.length - 1, v + delta)));
  }

  function next() {
    // 빈 값만 보면 '1.75', '800', '-5' 가 통과해 BMI 235102 같은 값이 화면에 나간다
    if (key === 'age' || key === 'height' || key === 'weight') {
      const err = validateField(key, d.profile[key]);
      if (err) {
        setNumErr(err);
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
    if (key === 'focus') {
      const err = validateProfile(d.profile);
      if (err) {
        showAlert('입력 확인', err);
        return;
      }
      // 가입한 사용자(redo · restart)는 redo=1 — 뒤로 가기 · 빈 화면 처리가 홈 기준이 된다
      router.push(mode === 'first' ? '/project/analysis' : '/project/analysis?redo=1');
      return;
    }
    go(1);
  }

  const canNext = key === 'age' || key === 'height' || key === 'weight' ? !!String(d.profile[key]).trim() : true;
  const isLastInput = key === 'focus';
  const num = idx + 1;
  const numStep = (k: 'age' | 'height' | 'weight', q: string, unit: string, ph: string, decimal: boolean, desc?: string) => (
    <StepNumber num={num} total={total} q={q} desc={desc} unit={unit} placeholder={ph} decimal={decimal}
      value={String(d.profile[k] ?? '')} error={numErr}
      onChange={(v) => { d.setProfile(k, v); setNumErr(null); }} onSubmit={next} />
  );

  return (
    <SafeAreaView style={o.root} edges={['top']}>
      {/* 안드로이드도 키패드만큼 줄인다 — 줄이지 않으면 키패드가 '다음' 버튼을 가린다(10/31 녹화 0:01) */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View
          style={o.progRow}
          accessibilityRole="progressbar"
          accessibilityLabel={`${num}단계, 전체 ${total}단계`}
          accessibilityValue={{ min: 1, max: total, now: num }}
        >
          {Array.from({ length: total }).map((_, i) => (
            <View key={i} style={[o.progBar, i <= idx && o.progOn]} />
          ))}
        </View>

        <ScrollView style={o.scroll} contentContainerStyle={o.scrollInner} keyboardShouldPersistTaps="handled">
          {key === 'sex' && <StepSex p={d.profile} update={d.setProfile} num={num} total={total} />}
          {key === 'age' && numStep('age', '나이를 알려주세요', '세', '25', false)}
          {key === 'height' && numStep('height', '키를 알려주세요', 'cm', '175', true)}
          {key === 'weight' && numStep('weight', '지금 체중을\n알려주세요', 'kg', '72', true, '아침 공복 체중이면 가장 정확해요.')}
          {key === 'body' && (
            <StepBody
              num={num}
              total={total}
              waist={d.waist}
              inbody={d.inbody}
              accuracy={accuracy}
              errors={bodyErr}
              onWaist={(v) => { d.patch({ waist: v }); setBodyErr({}); }}
              onInbody={(v) => { d.patch({ inbody: v }); setBodyErr({}); }}
            />
          )}
          {key === 'level' && <StepLevel p={d.profile} update={d.setProfile} num={num} total={total} />}
          {key === 'place' && <StepPlace p={d.profile} update={d.setProfile} num={num} total={total} />}
          {key === 'days' && <StepDays p={d.profile} update={d.setProfile} num={num} total={total} />}
          {key === 'food' && <StepFood p={d.profile} update={d.setProfile} num={num} total={total} />}
          {key === 'focus' && <StepFocus p={d.profile} update={d.setProfile} num={num} total={total} />}
        </ScrollView>

        <View style={[o.foot, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          {idx > 0 || mode !== 'first' ? (
            <TouchableOpacity activeOpacity={0.7} style={o.backBtn} accessibilityRole="button"
              onPress={() => (idx > 0 ? go(-1) : router.back())}>
              <Text style={o.backTxt}>{idx > 0 ? '이전' : '닫기'}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity activeOpacity={0.7}
            style={[o.nextBtn, !canNext && o.btnOff]}
            disabled={!canNext}
            onPress={next}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canNext }}
          >
            <Text style={o.nextTxt}>{isLastInput ? '내 몸 계산하기' : key === 'body' && !d.waist.trim() && !d.inbody.on ? '건너뛰기' : '다음'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
