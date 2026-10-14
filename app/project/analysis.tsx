/**
 * O6 분석 로딩 — 체크리스트 7단계. 끝난 단계마다 그 사용자의 실제 계산값이 회색 한 줄로 남는다.
 * "바빠 보이되 거짓은 없다": 계산(엔진)은 수십 ms 면 끝나지만, 단계마다 최소 표시 시간을 지킨다(총 약 11.7초).
 *  · 퍼센트 진행바는 없다 — 체크리스트가 진행 표시다.
 *  · 단계 완료마다 가벼운 햅틱, 끝나면 성공 햅틱.
 *  · 뒤로가기 막음. 앱이 백그라운드에 가 있으면 시계가 멈췄다가 남은 단계부터 이어서.
 *  · 저장(bodyAnalyses)이 실패해도 결과는 기기에 있으니 화면은 계속 간다 — pending 으로 들고 있다가 다시 올린다.
 * 온보딩에서는 AI 를 부르지 않는다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { colors, themed, useThemeMode } from '../../src/theme';
import { haptic } from '../../src/ui';
import { useAuthStore } from '../../src/stores/authStore';
import { useAppStore } from '../../src/stores/appStore';
import { useOnboardDraft } from '../../src/stores/onboardDraft';
import { buildAnalysisInput } from '../../src/components/onboard/draftInput';
import { analyzeBody, type AnalysisCore } from '../../src/utils/bodyAnalysis';
import { validateProfile } from '../../src/utils/body';
import { buildLocalPlan } from '../../src/utils/planner';
import { saveAnalysis, toAnalysis } from '../../src/services/bodyService';
import { kg, kcal, pct0, profileFromAnalysis, signedKg } from '../../src/components/body/format';
import { AvatarView } from '../../src/components/body/AvatarView';
import { has3D } from '../../src/components/body/avatar3d/Avatar3D';
import { coordOf } from '../../src/components/body/avatar3d/morph';

/** [문구, 최소 표시 ms] — 명세 O6 표 */
const STEPS: [string, number][] = [
  ['입력한 신체 정보를 확인하는 중입니다', 900],
  ['현재 체형을 분석하는 중입니다', 1600],
  ['목표 체형과 비교하는 중입니다', 1400],
  ['맞춤 루틴을 고안하는 중입니다', 1800],
  ['맞춤 식단을 제작하는 중입니다', 1800],
  ['변화 과정을 시뮬레이션하는 중입니다', 1800],
  ['프로젝트를 구성하는 중입니다', 1400],
];
const ENDS = STEPS.reduce<number[]>((acc, [, ms]) => [...acc, (acc[acc.length - 1] ?? 0) + ms], []);
const TOTAL = ENDS[ENDS.length - 1];
/** "분석이 완료되었습니다" 를 보여 주는 시간 */
const DONE_HOLD = 1000;

/** 주 N일 → 자동 구성 플랜(buildLocalPlan)의 분할 이름 */
const SPLIT_LABEL: Record<number, string> = {
  2: '상하체 분할', 3: '푸시·풀·레그 분할', 4: '푸시·풀·레그·상체 분할', 5: '부위별 5분할', 6: '푸시·풀·레그 2회전',
};

/** 단계마다 보여 줄 실제 계산값 한 줄 */
function stepLines(core: AnalysisCore): string[] {
  const i = core.input;
  const body = [`키 ${kg(i.heightCm)}cm`, `체중 ${kg(i.weightKg)}kg`];
  if (i.waistCm) body.push(`허리 ${kg(i.waistCm)}cm`);
  if (i.inbody) body.push(`인바디 ${pct0(i.inbody.bfPct)}%`);
  const comp = core.comp.src === 'inbody'
    ? `체지방률 ${pct0(core.comp.bfPct)}% (인바디)`
    : `추정 체지방률 약 ${pct0(core.comp.bfPct)}%`;
  const fat = Math.abs(core.gap.fatKg) < 0.05 ? '체지방 유지' : `체지방 ${signedKg(core.gap.fatKg)}`;
  const lean = core.gap.leanKg < 0.05 ? (core.gap.muscleAhead ? '근육은 이미 목표 이상' : '제지방 유지') : `제지방 ${signedKg(core.gap.leanKg)}`;
  const rec = core.projects.find((p) => p.recommended) ?? core.projects[0];
  return [
    body.join(' · '),
    comp,
    `${fat} · ${lean}`,
    `주 ${i.days}회 · ${SPLIT_LABEL[i.days] ?? `${i.days}분할`}`,
    `하루 ${kcal(rec.nutrition.kcal)} · 단백질 ${rec.nutrition.proteinG}g`,
    `${core.track.length - 1}개월 변화 계산 완료`,
    `프로젝트 ${core.projects.length}개 준비 완료`,
  ];
}

export default function AnalysisScreen() {
  useThemeMode();
  const router = useRouter();
  const { redo } = useLocalSearchParams<{ redo?: string }>();
  const user = useAuthStore((st) => st.user);
  const setAnalysis = useAppStore((st) => st.setAnalysis);

  // 계산은 한 번 — 같은 입력이면 같은 결과
  const work = useMemo(() => {
    const d = useOnboardDraft.getState();
    if (!d.seeded || validateProfile(d.profile)) return null;
    const input = buildAnalysisInput(d);
    const core = analyzeBody(input, d.pick ?? { mode: 'auto' });
    // 거절 경로에서 쓸 무료 자동 구성 플랜도 지금 만들어 둔다(O6 "맞춤 루틴" 단계)
    const profile = profileFromAnalysis(core, d.profile);
    return { core, lines: stepLines(core), plan: buildLocalPlan(profile) };
  }, []);

  // 렌더 중에 다른 화면이 구독하는 상태를 바꾸지 않도록 effect 에서
  useEffect(() => {
    if (work) useOnboardDraft.getState().patch({ localPlan: work.plan });
  }, [work]);

  const [elapsed, setElapsed] = useState(0);
  const done = elapsed >= TOTAL;
  const stepIdx = ENDS.findIndex((e) => elapsed < e);
  const current = stepIdx < 0 ? STEPS.length : stepIdx;
  const prevDone = useRef(0);
  const saved = useRef(false);

  // 입력이 없으면(웹 새로고침 등) 처음으로
  useEffect(() => {
    if (work) return;
    router.replace(user?.onboardingDone ? '/project/new' : '/onboard');
  }, [work, router, user?.onboardingDone]);

  // 시계 — 화면이 앞에 있을 때만 간다
  useEffect(() => {
    if (!work) return;
    let active = AppState.currentState === 'active' || AppState.currentState == null;
    let last = Date.now();
    const sub = AppState.addEventListener('change', (st) => {
      active = st === 'active';
      last = Date.now();
    });
    const t = setInterval(() => {
      const now = Date.now();
      if (active) setElapsed((e) => Math.min(TOTAL + DONE_HOLD + 1, e + (now - last)));
      last = now;
    }, 100);
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [work]);

  // 뒤로가기 막음 (안드로이드 하드웨어 버튼)
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  // 단계가 끝날 때마다 톡 — 끝나면 성공
  useEffect(() => {
    const n = Math.min(current, STEPS.length);
    if (n > prevDone.current) {
      prevDone.current = n;
      if (n === STEPS.length) haptic.success();
      else haptic.tap();
    }
  }, [current]);

  // 끝: 결과 저장 → 1초 뒤 "지금 몸 vs 목표 몸"
  useEffect(() => {
    if (!done || !work || !user || saved.current) return;
    saved.current = true;
    const a = toAnalysis(user.uid, work.core);
    setAnalysis({ ...a, pending: true });
    saveAnalysis(a)
      .then((ok) => {
        const cur = useAppStore.getState().analysis;
        if (ok && cur?.id === a.id) {
          const { pending: _p, ...rest } = cur;
          setAnalysis(rest);
        }
      })
      .catch(() => {}); // pending 으로 남아 다음 동기화 때 다시 올린다 (session.ts)
  }, [done, work, user, setAnalysis]);

  useEffect(() => {
    if (elapsed < TOTAL + DONE_HOLD || !saved.current) return;
    router.replace(redo ? '/project/compare?redo=1' : '/project/compare');
  }, [elapsed, router, redo]);

  // 3D 몸 — 현재 체형 분석이 끝나면 지금 몸, 시뮬레이션 단계 동안 추천 프로젝트 기간만큼 달마다 변한다
  const { height: winH } = useWindowDimensions();
  const body = useMemo(() => {
    if (!work) return null;
    const core = work.core;
    const rec = core.projects.find((p) => p.recommended) ?? core.projects[0];
    const sex = core.input.sex;
    const SIM = 5; // '변화 과정을 시뮬레이션하는 중입니다'
    let month = 0;
    if (current > SIM) month = rec.months;
    else if (current === SIM) {
      const k = Math.min(1, Math.max(0, (elapsed - ENDS[SIM - 1]) / STEPS[SIM][1]));
      month = Math.round(k * k * (3 - 2 * k) * rec.months);
    }
    const pt = rec.track[Math.min(month, rec.track.length - 1)];
    return {
      sex,
      shown: current >= 2,
      month,
      cell: pt.cell,
      coord: month === 0 ? core.coord : coordOf(sex, pt.bfPct, pt.nffmi),
      line: month === 0 ? `지금 몸 · 체지방 약 ${pct0(core.comp.bfPct)}%` : `${month}개월 뒤 예상 몸 · ${kg(pt.weightKg)}kg · 체지방 ${pct0(pt.bfPct)}%`,
    };
  }, [work, current, elapsed]);
  const avH = Math.min(240, winH - 600);
  const showBody = !!body && has3D(body.sex) && avH >= 120;

  if (!work) return <SafeAreaView style={s.root} />;

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.inner}>
        {done ? (
          <Animated.View entering={FadeIn.duration(260)} style={s.doneHead}>
            <Ionicons name="checkmark-circle" size={30} color={colors.ink} />
            <Text style={s.title} accessibilityRole="header" accessibilityLiveRegion="polite">분석이 완료되었습니다</Text>
          </Animated.View>
        ) : (
          <Text style={s.title} accessibilityRole="header">몸을 분석하고 있어요</Text>
        )}

        {showBody && body ? (
          <View style={s.hero} accessibilityLabel={body.shown ? body.line : '몸을 읽는 중'}>
            <View style={{ opacity: body.shown ? 1 : 0.28 }}>
              <AvatarView sex={body.sex} cell={body.cell} coord={body.coord} width={Math.round(avH / 1.5)} live morphMs={260} />
            </View>
            <Text style={s.heroTxt}>{body.shown ? body.line : ' '}</Text>
          </View>
        ) : null}

        <View style={[s.list, showBody && s.listTight]}>
          {STEPS.map(([title], i) => {
            const state = i < current ? 'done' : i === current ? 'now' : 'wait';
            return (
              <View key={title} style={s.row} accessibilityLabel={`${title}${state === 'done' ? `, 완료, ${work.lines[i]}` : ''}`}>
                <View style={s.icon}>
                  {state === 'done' ? (
                    <Animated.View entering={FadeIn.duration(180)}>
                      <Ionicons name="checkmark-circle" size={22} color={colors.ink} />
                    </Animated.View>
                  ) : state === 'now' ? (
                    <ActivityIndicator size="small" color={colors.ink} />
                  ) : (
                    <View style={s.ring} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.stepTxt, state === 'now' && s.stepNow, state === 'wait' && s.stepWait]}>{title}</Text>
                  {state === 'done' ? (
                    <Animated.Text entering={FadeInDown.duration(220)} style={s.sub}>{work.lines[i]}</Animated.Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, paddingHorizontal: 24, paddingTop: 40 },
  doneHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 23, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  list: { marginTop: 30, gap: 22 },
  listTight: { marginTop: 14, gap: 16 },
  hero: { alignItems: 'center', marginTop: 14 },
  heroTxt: { fontSize: 12, color: colors.muted, marginTop: 4, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  icon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', marginTop: -1 },
  ring: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.line2 },
  stepTxt: { fontSize: 15, color: colors.mid, lineHeight: 22 },
  stepNow: { color: colors.ink, fontWeight: '800' },
  stepWait: { color: colors.placeholder },
  sub: { fontSize: 12.5, color: colors.muted, marginTop: 3, lineHeight: 18 },
}));
