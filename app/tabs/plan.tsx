import { prescription, repsText } from '../../src/utils/prescription';
import { LoadingSkeleton } from '../../src/components/LoadingSkeleton';
import { hasHydrated } from '../../src/stores/appStore';
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, themed, useThemeMode } from '../../src/theme';
import { showAlert } from '../../src/utils/alert';
import { useAppStore } from '../../src/stores/appStore';
import { useAuthStore } from '../../src/stores/authStore';
import { exById, EQUIP_LABEL, PART_LABEL } from '../../src/data/exercises';
import { routineById } from '../../src/data/routines';
import { nextDayIdx } from '../../src/utils/stats';
import { savePlan } from '../../src/services/authService';
import { generatePlan, SubscriptionRequired, QuotaExceeded } from '../../src/services/aiService';
import { useEntitlement } from '../../src/hooks/useEntitlement';
import { buildLocalPlan } from '../../src/utils/planner';
import ExerciseMedia from '../../src/components/ExerciseMedia';
import { GhostBtn, Notice } from '../../src/components/ui';
import { WorkoutSwitch } from '../../src/components/WorkoutSwitch';
import { useTabSpace } from '../../src/components/TabBar';
import { FONT, PressableScale, PRESS_SCALE } from '../../src/ui';
import { Ionicons } from '@expo/vector-icons';

const SRC_LABEL: Record<string, string> = { AI: 'AI 구성', LOCAL: '자동 구성', PRESET: '프리셋 루틴' };

export default function PlanScreen() {
  useThemeMode();
  const tabSpace = useTabSpace();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hydrating = useAuthStore((s) => s.hydrating);
  const plan = useAppStore((s) => s.plan);
  const profile = useAppStore((s) => s.profile);
  const lv = (profile?.level ?? 2) as 1 | 2 | 3;
  const session = useAppStore((s) => s.session);
  const startSession = useAppStore((s) => s.startSession);
  const setPlan = useAppStore((s) => s.setPlan);
  // 처음 열면 오늘 할 날(다음 차례)이 골라져 있다 — 홈의 '오늘 할 일'과 같은 날
  const logs = useAppStore((s) => s.logs);
  const [activeDay, setActiveDay] = useState(() => nextDayIdx(logs, plan));
  // 플랜이 화면보다 늦게 오면(앱을 막 켰을 때) 그때 오늘 차례로 맞춘다 — 직접 고른 뒤에는 건드리지 않는다
  const picked = useRef(false);
  useEffect(() => {
    if (plan && !picked.current) setActiveDay(nextDayIdx(logs, plan));
  }, [plan, logs]);
  const [busy, setBusy] = useState<'ai' | 'local' | null>(null);
  // '자동 재구성'(결정형 알고리즘)은 무료다 — 구독 없이도 플랜을 새로 짤 수 있어야 한다
  const { can } = useEntitlement();
  const canAI = can('ai_plan');

  // 다른 화면에서 루틴을 바꾸면 선택된 데이가 범위를 벗어날 수 있다
  useEffect(() => {
    if (plan && activeDay > plan.days.length - 1) setActiveDay(0);
  }, [plan]);

  function regenerate(mode: 'ai' | 'local') {
    if (!profile || !user) {
      showAlert('알림', '신체 정보가 없습니다. 내 정보에서 신체 정보를 입력해주세요.', [
        { text: '취소', style: 'cancel' },
        { text: '내 정보로 이동', onPress: () => router.push('/profile/edit') },
      ]);
      return;
    }
    if (mode === 'ai' && !canAI) {
      router.push('/subscribe?f=ai_plan');
      return;
    }
    if (session) {
      showAlert('진행 중인 운동이 있습니다', '운동을 마치거나 종료한 뒤 플랜을 바꿔주세요.');
      return;
    }
    // 재구성은 현재 플랜을 덮어쓰고 되돌릴 수 없다 — 확인을 받는다
    const label = plan?.routineId ? `현재 루틴(${routineById(plan.routineId)?.name ?? '프리셋'})` : '현재 플랜';
    showAlert(
      mode === 'ai' ? 'AI로 다시 구성' : '자동 재구성',
      `${label}을 새 구성으로 바꿉니다. 이전 플랜은 되돌릴 수 없습니다. 진행할까요?`,
      [
        { text: '취소', style: 'cancel' },
        { text: '진행', onPress: () => doRegenerate(mode) },
      ]
    );
  }

  async function doRegenerate(mode: 'ai' | 'local') {
    if (!profile || !user) return;
    setBusy(mode);
    try {
      // 로컬 생성은 매번 다른 시드를 사용해 같은 결과가 반복되지 않는다
      let next = buildLocalPlan(profile, Date.now());
      let fallbackReason: string | null = null;
      if (mode === 'ai') {
        // 진행 중인 프로젝트가 있으면 서버가 프로젝트 단계 타임라인으로 루틴을 짠다
        const proj = useAppStore.getState().project;
        const r = await generatePlan(profile, proj?.status === 'active' ? { projectId: proj.id } : undefined);
        next = r.plan;
        if (r.fallback) fallbackReason = r.reason ?? 'AI 서버에 연결하지 못했습니다.';
      }
      await savePlan(user.uid, next);
      setPlan(next);
      setActiveDay(0);
      if (fallbackReason) {
        showAlert('자동 구성으로 대체', `${fallbackReason} 자동 알고리즘으로 구성했습니다.`);
      }
    } catch (e) {
      if (e instanceof SubscriptionRequired) router.push('/subscribe?f=ai_plan');
      else if (e instanceof QuotaExceeded) showAlert('오늘 한도 초과', `${e.message} 자동 재구성은 계속 이용할 수 있습니다.`);
      else showAlert('오류', '플랜 재생성에 실패했습니다.');
    } finally {
      setBusy(null);
    }
  }

  const planChecked = useAuthStore((st) => st.planChecked);
  const loading = !plan && (hydrating || !planChecked || !hasHydrated());
  if (loading) {
    // 로그인 직후 플랜이 오기 전에 "플랜 없음" 을 보이면 루틴을 골라 기존 플랜을 덮어쓰게 된다 — 빈 상태 대신 자리 표시(검수 2)
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <LoadingSkeleton />
      </SafeAreaView>
    );
  }

  if (!plan) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.empty}>
          <Text style={s.emptyTxt}>플랜이 없습니다.{'\n'}루틴을 선택해 시작하세요.</Text>
          <PressableScale style={s.emptyBtn} onPress={() => router.push('/routine')}>
            <Text style={s.emptyBtnTxt}>루틴 라이브러리</Text>
          </PressableScale>
        </View>
      </SafeAreaView>
    );
  }

  const dayIdx = Math.min(activeDay, plan.days.length - 1);
  const day = plan.days[dayIdx];
  const routine = plan.routineId ? routineById(plan.routineId) : null;
  const daySets = day.ids.reduce((a, id) => { const e = exById(id); return a + (e ? prescription(e, lv).sets : 0); }, 0);
  const dayMin = Math.max(10, Math.round((daySets * 2.4) / 5) * 5);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.topbar}>
        <Text style={s.title} accessibilityRole="header">운동</Text>
        <PressableScale hitSlop={8} style={s.topLink}
          onPress={() => (routine ? router.push(`/routine/${routine.id}`) : router.push('/routine'))}
          accessibilityRole="button" accessibilityLabel={routine ? `${routine.name} 루틴 보기` : '루틴 둘러보기'}>
          <Text style={s.topLinkTxt} numberOfLines={1}>{routine ? routine.name : SRC_LABEL[plan.planSrc] ?? '맞춤 구성'} ›</Text>
        </PressableScale>
      </View>
      <WorkoutSwitch value="plan" />

      {/* Day 칸 — 한 줄에 다 보이게(가로 스크롤인 걸 몰라 Day5 를 못 찾던 문제, 10/31 피드백 7-9). 고른 날 하나만 빨강 */}
      <View style={s.pillRow}>
        {plan.days.map((d, i) => (
          <PressableScale
            key={`${d.id}-${i}`}
            style={[s.pill, activeDay === i && s.pillActive]}
            onPress={() => { picked.current = true; setActiveDay(i); }}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeDay === i }}
            accessibilityLabel={`${i + 1}일차, ${d.name}`}
          >
            <Text style={[s.pillNum, activeDay === i && s.pillNumActive]}>{i + 1}</Text>
            <Text style={[s.pillSub, activeDay === i && s.pillSubActive]} numberOfLines={1}>{d.name}</Text>
          </PressableScale>
        ))}
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={[s.scrollInner, { paddingBottom: tabSpace + 8 + 54 + 28 }]} showsVerticalScrollIndicator={false}>
        <View style={s.dayHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.dayKicker}>{dayIdx + 1}일차 / {plan.days.length}일</Text>
            <Text style={s.dayName}>{day.name}</Text>
            <Text style={s.dayFocus}>{day.focus} · {day.ids.length}종목 {daySets}세트 · 약 {dayMin}분</Text>
          </View>
        </View>

        {day.ids.map((id, i) => {
          const e = exById(id);
          if (!e) return null;
          const rx = prescription(e, lv);
          return (
            <PressableScale scaleTo={PRESS_SCALE.card}
              key={`${id}-${i}`}
              style={s.exCard}
              onPress={() => router.push(`/exercise/${id}`)}
            >
              <ExerciseMedia exId={id} rounded={12} style={s.exThumb} dim={0.3} />
              <View style={s.exInfo}>
                <Text style={s.exName}>{e.n}</Text>
                <Text style={s.exPart}>
                  {PART_LABEL[e.part]} · {e.eq.map((q) => EQUIP_LABEL[q]).join('/')}
                </Text>
              </View>
              <Text style={s.exRx}>{rx.sets} × {repsText(rx.reps)}</Text>
            </PressableScale>
          );
        })}

        <View style={s.regenRow}>
          <GhostBtn
            label={canAI ? 'AI로 다시 구성' : 'AI로 다시 구성 · PRO'}
            onPress={() => regenerate('ai')}
            loading={busy === 'ai'}
            disabled={busy !== null}
            style={{ flex: 1 }}
          />
          <GhostBtn
            label="자동 재구성"
            onPress={() => regenerate('local')}
            loading={busy === 'local'}
            disabled={busy !== null}
            style={{ flex: 1 }}
          />
        </View>
        <GhostBtn label="다른 루틴 둘러보기" onPress={() => router.push('/routine')} style={{ marginTop: 10 }} />

        <Notice>일반적인 운동 가이드입니다. 통증이나 질환이 있다면 전문가와 상담하세요.</Notice>
      </ScrollView>

      {/* 지금 할 한 가지 — 떠 있는 탭 바로 위 */}
      <View style={[s.goWrap, { bottom: tabSpace + 8 }]} pointerEvents="box-none">
        <PressableScale style={s.go} onPress={() => startSession(dayIdx)} accessibilityLabel={`${day.name} 운동 시작`}>
          <Ionicons name="play" size={17} color={colors.onRed} />
          <Text style={s.goTxt}>{day.name} 운동 시작</Text>
        </PressableScale>
      </View>
    </SafeAreaView>
  );
}

const s = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topbar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8,
  },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  meta: { fontSize: 10, color: colors.muted, letterSpacing: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  emptyTxt: { color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  emptyBtn: { backgroundColor: colors.red, borderRadius: 26, paddingHorizontal: 22, paddingVertical: 12 },
  emptyBtnTxt: { color: colors.onRed, fontSize: 14, fontWeight: '700' },

  topLink: { minHeight: 44, justifyContent: 'center', maxWidth: '60%' },
  topLinkTxt: { fontSize: 13, fontWeight: '600', color: colors.mid },

  pillRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 14 },
  pill: {
    flex: 1, minWidth: 0, height: 56, borderRadius: 18, paddingHorizontal: 4,
    backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center',
  },
  pillActive: { backgroundColor: colors.panel3, borderColor: colors.ink, borderWidth: 1.5 },
  pillNum: { fontFamily: FONT.num, fontSize: 20, lineHeight: 22, color: colors.muted },
  pillNumActive: { color: colors.ink },
  pillSub: { fontSize: 12, fontWeight: '600', color: colors.muted },
  pillSubActive: { color: colors.ink },

  scroll: { flex: 1 },
  // 아래에 떠 있는 시작 버튼 + 탭만큼 비운다
  scrollInner: { paddingHorizontal: 16, paddingBottom: 200 },
  dayHeader: { marginBottom: 10, paddingHorizontal: 4 },
  dayKicker: { fontFamily: FONT.num, fontSize: 15, color: colors.muted, letterSpacing: 0.3 },
  dayName: { fontSize: 34, fontWeight: '800', color: colors.ink, letterSpacing: -1.2, lineHeight: 40 },
  dayFocus: { fontSize: 13, color: colors.mid, marginTop: 4 },

  exCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 4,
    borderTopWidth: 1, borderTopColor: colors.line,
  },
  exThumb: { width: 44, height: 44 },
  exInfo: { flex: 1, minWidth: 0 },
  exName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  exPart: { fontSize: 12, color: colors.mid, marginTop: 2 },
  exRx: { fontFamily: FONT.num, fontSize: 19, color: colors.mid },

  goWrap: { position: 'absolute', left: 20, right: 20, alignItems: 'center' },
  go: {
    width: '100%', maxWidth: 440, height: 54, borderRadius: 27, backgroundColor: colors.red,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  goTxt: { fontSize: 16, fontWeight: '700', color: colors.onRed },

  regenRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
}));
import { prescription, repsText } from '../../src/utils/prescription';
import { LoadingSkeleton } from '../../src/components/LoadingSkeleton';
import { hasHydrated } from '../../src/stores/appStore';
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, themed, useThemeMode } from '../../src/theme';
import { showAlert } from '../../src/utils/alert';
import { useAppStore } from '../../src/stores/appStore';
import { useAuthStore } from '../../src/stores/authStore';
import { exById, EQUIP_LABEL, PART_LABEL } from '../../src/data/exercises';
import { routineById } from '../../src/data/routines';
import { nextDayIdx } from '../../src/utils/stats';
import { savePlan } from '../../src/services/authService';
import { generatePlan, SubscriptionRequired, QuotaExceeded } from '../../src/services/aiService';
import { useEntitlement } from '../../src/hooks/useEntitlement';
import { buildLocalPlan } from '../../src/utils/planner';
import ExerciseMedia from '../../src/components/ExerciseMedia';
import { GhostBtn, Notice } from '../../src/components/ui';
import { WorkoutSwitch } from '../../src/components/WorkoutSwitch';
import { useTabSpace } from '../../src/components/TabBar';
import { FONT, PressableScale, PRESS_SCALE } from '../../src/ui';
import { Ionicons } from '@expo/vector-icons';

const SRC_LABEL: Record<string, string> = { AI: 'AI 구성', LOCAL: '자동 구성', PRESET: '프리셋 루틴' };

export default function PlanScreen() {
  useThemeMode();
  const tabSpace = useTabSpace();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hydrating = useAuthStore((s) => s.hydrating);
  const plan = useAppStore((s) => s.plan);
  const profile = useAppStore((s) => s.profile);
  const lv = (profile?.level ?? 2) as 1 | 2 | 3;
  const session = useAppStore((s) => s.session);
  const startSession = useAppStore((s) => s.startSession);
  const setPlan = useAppStore((s) => s.setPlan);
  // 처음 열면 오늘 할 날(다음 차례)이 골라져 있다 — 홈의 '오늘 할 일'과 같은 날
  const logs = useAppStore((s) => s.logs);
  const [activeDay, setActiveDay] = useState(() => nextDayIdx(logs, plan));
  // 플랜이 화면보다 늦게 오면(앱을 막 켰을 때) 그때 오늘 차례로 맞춘다 — 직접 고른 뒤에는 건드리지 않는다
  const picked = useRef(false);
  useEffect(() => {
    if (plan && !picked.current) setActiveDay(nextDayIdx(logs, plan));
  }, [plan, logs]);
  const [busy, setBusy] = useState<'ai' | 'local' | null>(null);
  // '자동 재구성'(결정형 알고리즘)은 무료다 — 구독 없이도 플랜을 새로 짤 수 있어야 한다
  const { can } = useEntitlement();
  const canAI = can('ai_plan');

  // 다른 화면에서 루틴을 바꾸면 선택된 데이가 범위를 벗어날 수 있다
  useEffect(() => {
    if (plan && activeDay > plan.days.length - 1) setActiveDay(0);
  }, [plan]);

  function regenerate(mode: 'ai' | 'local') {
    if (!profile || !user) {
      showAlert('알림', '신체 정보가 없습니다. 내 정보에서 신체 정보를 입력해주세요.', [
        { text: '취소', style: 'cancel' },
        { text: '내 정보로 이동', onPress: () => router.push('/profile/edit') },
      ]);
      return;
    }
    if (mode === 'ai' && !canAI) {
      router.push('/subscribe?f=ai_plan');
      return;
    }
    if (session) {
      showAlert('진행 중인 운동이 있습니다', '운동을 마치거나 종료한 뒤 플랜을 바꿔주세요.');
      return;
    }
    // 재구성은 현재 플랜을 덮어쓰고 되돌릴 수 없다 — 확인을 받는다
    const label = plan?.routineId ? `현재 루틴(${routineById(plan.routineId)?.name ?? '프리셋'})` : '현재 플랜';
    showAlert(
      mode === 'ai' ? 'AI로 다시 구성' : '자동 재구성',
      `${label}을 새 구성으로 바꿉니다. 이전 플랜은 되돌릴 수 없습니다. 진행할까요?`,
      [
        { text: '취소', style: 'cancel' },
        { text: '진행', onPress: () => doRegenerate(mode) },
      ]
    );
  }

  async function doRegenerate(mode: 'ai' | 'local') {
    if (!profile || !user) return;
    setBusy(mode);
    try {
      // 로컬 생성은 매번 다른 시드를 사용해 같은 결과가 반복되지 않는다
      let next = buildLocalPlan(profile, Date.now());
      let fallbackReason: string | null = null;
      if (mode === 'ai') {
        // 진행 중인 프로젝트가 있으면 서버가 프로젝트 단계 타임라인으로 루틴을 짠다
        const proj = useAppStore.getState().project;
        const r = await generatePlan(profile, proj?.status === 'active' ? { projectId: proj.id } : undefined);
        next = r.plan;
        if (r.fallback) fallbackReason = r.reason ?? 'AI 서버에 연결하지 못했습니다.';
      }
      await savePlan(user.uid, next);
      setPlan(next);
      setActiveDay(0);
      if (fallbackReason) {
        showAlert('자동 구성으로 대체', `${fallbackReason} 자동 알고리즘으로 구성했습니다.`);
      }
    } catch (e) {
      if (e instanceof SubscriptionRequired) router.push('/subscribe?f=ai_plan');
      else if (e instanceof QuotaExceeded) showAlert('오늘 한도 초과', `${e.message} 자동 재구성은 계속 이용할 수 있습니다.`);
      else showAlert('오류', '플랜 재생성에 실패했습니다.');
    } finally {
      setBusy(null);
    }
  }

  const planChecked = useAuthStore((st) => st.planChecked);
  const loading = !plan && (hydrating || !planChecked || !hasHydrated());
  if (loading) {
    // 로그인 직후 플랜이 오기 전에 "플랜 없음" 을 보이면 루틴을 골라 기존 플랜을 덮어쓰게 된다 — 빈 상태 대신 자리 표시(검수 2)
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <LoadingSkeleton />
      </SafeAreaView>
    );
  }

  if (!plan) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.empty}>
          <Text style={s.emptyTxt}>플랜이 없습니다.{'\n'}루틴을 선택해 시작하세요.</Text>
          <PressableScale style={s.emptyBtn} onPress={() => router.push('/routine')}>
            <Text style={s.emptyBtnTxt}>루틴 라이브러리</Text>
          </PressableScale>
        </View>
      </SafeAreaView>
    );
  }

  const dayIdx = Math.min(activeDay, plan.days.length - 1);
  const day = plan.days[dayIdx];
  const routine = plan.routineId ? routineById(plan.routineId) : null;
  const daySets = day.ids.reduce((a, id) => { const e = exById(id); return a + (e ? prescription(e, lv).sets : 0); }, 0);
  const dayMin = Math.max(10, Math.round((daySets * 2.4) / 5) * 5);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.topbar}>
        <Text style={s.title} accessibilityRole="header">운동</Text>
        <PressableScale hitSlop={8} style={s.topLink}
          onPress={() => (routine ? router.push(`/routine/${routine.id}`) : router.push('/routine'))}
          accessibilityRole="button" accessibilityLabel={routine ? `${routine.name} 루틴 보기` : '루틴 둘러보기'}>
          <Text style={s.topLinkTxt} numberOfLines={1}>{routine ? routine.name : SRC_LABEL[plan.planSrc] ?? '맞춤 구성'} ›</Text>
        </PressableScale>
      </View>
      <WorkoutSwitch value="plan" />

      {/* Day 칸 — 한 줄에 다 보이게(가로 스크롤인 걸 몰라 Day5 를 못 찾던 문제, 10/31 피드백 7-9). 고른 날 하나만 빨강 */}
      <View style={s.pillRow}>
        {plan.days.map((d, i) => (
          <PressableScale
            key={`${d.id}-${i}`}
            style={[s.pill, activeDay === i && s.pillActive]}
            onPress={() => { picked.current = true; setActiveDay(i); }}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeDay === i }}
            accessibilityLabel={`Day ${i + 1}, ${d.name}`}
          >
            <Text style={[s.pillNum, activeDay === i && s.pillNumActive]}>{i + 1}</Text>
            <Text style={[s.pillSub, activeDay === i && s.pillSubActive]} numberOfLines={1}>{d.name}</Text>
          </PressableScale>
        ))}
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={[s.scrollInner, { paddingBottom: tabSpace + 8 + 54 + 28 }]} showsVerticalScrollIndicator={false}>
        <View style={s.dayHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.dayKicker}>DAY {dayIdx + 1} / {plan.days.length}</Text>
            <Text style={s.dayName}>{day.name}</Text>
            <Text style={s.dayFocus}>{day.focus} · {day.ids.length}종목 {daySets}세트 · 약 {dayMin}분</Text>
          </View>
        </View>

        {day.ids.map((id, i) => {
          const e = exById(id);
          if (!e) return null;
          const rx = prescription(e, lv);
          return (
            <PressableScale scaleTo={PRESS_SCALE.card}
              key={`${id}-${i}`}
              style={s.exCard}
              onPress={() => router.push(`/exercise/${id}`)}
            >
              <ExerciseMedia exId={id} rounded={12} style={s.exThumb} dim={0.3} />
              <View style={s.exInfo}>
                <Text style={s.exName}>{e.n}</Text>
                <Text style={s.exPart}>
                  {PART_LABEL[e.part]} · {e.eq.map((q) => EQUIP_LABEL[q]).join('/')}
                </Text>
              </View>
              <Text style={s.exRx}>{rx.sets} × {repsText(rx.reps)}</Text>
            </PressableScale>
          );
        })}

        <View style={s.regenRow}>
          <GhostBtn
            label={canAI ? 'AI로 다시 구성' : 'AI로 다시 구성 · PRO'}
            onPress={() => regenerate('ai')}
            loading={busy === 'ai'}
            disabled={busy !== null}
            style={{ flex: 1 }}
          />
          <GhostBtn
            label="자동 재구성"
            onPress={() => regenerate('local')}
            loading={busy === 'local'}
            disabled={busy !== null}
            style={{ flex: 1 }}
          />
        </View>
        <GhostBtn label="다른 루틴 둘러보기" onPress={() => router.push('/routine')} style={{ marginTop: 10 }} />

        <Notice>일반적인 운동 가이드입니다. 통증이나 질환이 있다면 전문가와 상담하세요.</Notice>
      </ScrollView>

      {/* 지금 할 한 가지 — 떠 있는 탭 바로 위 */}
      <View style={[s.goWrap, { bottom: tabSpace + 8 }]} pointerEvents="box-none">
        <PressableScale style={s.go} onPress={() => startSession(dayIdx)} accessibilityLabel={`${day.name} 운동 시작`}>
          <Ionicons name="play" size={17} color={colors.onRed} />
          <Text style={s.goTxt}>{day.name} 운동 시작</Text>
        </PressableScale>
      </View>
    </SafeAreaView>
  );
}

const s = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topbar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8,
  },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  meta: { fontSize: 10, color: colors.muted, letterSpacing: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  emptyTxt: { color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  emptyBtn: { backgroundColor: colors.red, borderRadius: 26, paddingHorizontal: 22, paddingVertical: 12 },
  emptyBtnTxt: { color: colors.onRed, fontSize: 14, fontWeight: '700' },

  topLink: { minHeight: 44, justifyContent: 'center', maxWidth: '60%' },
  topLinkTxt: { fontSize: 13, fontWeight: '600', color: colors.mid },

  pillRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 14 },
  pill: {
    flex: 1, minWidth: 0, height: 56, borderRadius: 18, paddingHorizontal: 4,
    backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center',
  },
  pillActive: { backgroundColor: colors.panel3, borderColor: colors.ink, borderWidth: 1.5 },
  pillNum: { fontFamily: FONT.num, fontSize: 20, lineHeight: 22, color: colors.muted },
  pillNumActive: { color: colors.ink },
  pillSub: { fontSize: 12, fontWeight: '600', color: colors.muted },
  pillSubActive: { color: colors.ink },

  scroll: { flex: 1 },
  // 아래에 떠 있는 시작 버튼 + 탭만큼 비운다
  scrollInner: { paddingHorizontal: 16, paddingBottom: 200 },
  dayHeader: { marginBottom: 10, paddingHorizontal: 4 },
  dayKicker: { fontFamily: FONT.num, fontSize: 15, color: colors.muted, letterSpacing: 0.3 },
  dayName: { fontSize: 34, fontWeight: '800', color: colors.ink, letterSpacing: -1.2, lineHeight: 40 },
  dayFocus: { fontSize: 13, color: colors.mid, marginTop: 4 },

  exCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 4,
    borderTopWidth: 1, borderTopColor: colors.line,
  },
  exThumb: { width: 44, height: 44 },
  exInfo: { flex: 1, minWidth: 0 },
  exName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  exPart: { fontSize: 12, color: colors.mid, marginTop: 2 },
  exRx: { fontFamily: FONT.num, fontSize: 19, color: colors.mid },

  goWrap: { position: 'absolute', left: 20, right: 20, alignItems: 'center' },
  go: {
    width: '100%', maxWidth: 440, height: 54, borderRadius: 27, backgroundColor: colors.red,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  goTxt: { fontSize: 16, fontWeight: '700', color: colors.onRed },

  regenRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
}));
