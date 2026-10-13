import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, themed, useThemeMode } from '../../src/theme';
import { showAlert } from '../../src/utils/alert';
import { useAppStore } from '../../src/stores/appStore';
import { useAuthStore } from '../../src/stores/authStore';
import { exById, EQUIP_LABEL, PART_LABEL } from '../../src/data/exercises';
import { routineById } from '../../src/data/routines';
import { savePlan } from '../../src/services/authService';
import { generatePlan, SubscriptionRequired, QuotaExceeded } from '../../src/services/aiService';
import { useEntitlement } from '../../src/hooks/useEntitlement';
import { buildLocalPlan } from '../../src/utils/planner';
import ExerciseMedia from '../../src/components/ExerciseMedia';
import { PrimaryBtn, GhostBtn, Notice } from '../../src/components/ui';

const SRC_LABEL: Record<string, string> = { AI: 'AI 구성', LOCAL: '자동 구성', PRESET: '프리셋 루틴' };

export default function PlanScreen() {
  useThemeMode();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hydrating = useAuthStore((s) => s.hydrating);
  const plan = useAppStore((s) => s.plan);
  const profile = useAppStore((s) => s.profile);
  const session = useAppStore((s) => s.session);
  const startSession = useAppStore((s) => s.startSession);
  const setPlan = useAppStore((s) => s.setPlan);
  const [activeDay, setActiveDay] = useState(0);
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
        const r = await generatePlan(profile);
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

  if (!plan && hydrating) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.empty}>
          <ActivityIndicator color={colors.muted} />
          <Text style={[s.emptyTxt, { marginTop: 12 }]}>플랜을 불러오는 중…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!plan) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.empty}>
          <Text style={s.emptyTxt}>플랜이 없습니다.{'\n'}루틴을 선택해 시작하세요.</Text>
          <TouchableOpacity activeOpacity={0.7} style={s.emptyBtn} onPress={() => router.push('/routine')}>
            <Text style={s.emptyBtnTxt}>루틴 라이브러리</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const dayIdx = Math.min(activeDay, plan.days.length - 1);
  const day = plan.days[dayIdx];
  const routine = plan.routineId ? routineById(plan.routineId) : null;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.topbar}>
        <Text style={s.title}>운동 플랜</Text>
        <Text style={s.meta}>{SRC_LABEL[plan.planSrc] ?? plan.planSrc}</Text>
      </View>

      {/* Routine banner */}
      <TouchableOpacity
        style={s.routineBar}
        activeOpacity={0.8}
        onPress={() => (routine ? router.push(`/routine/${routine.id}`) : router.push('/routine'))}
      >
        <View style={{ flex: 1 }}>
          <Text style={s.routineName}>{routine ? routine.name : '맞춤 구성 플랜'}</Text>
          <Text style={s.routineSub} numberOfLines={1}>{plan.planReason}</Text>
        </View>
        <Text style={s.routineLink}>{routine ? '루틴 보기 ›' : '루틴 탐색 ›'}</Text>
      </TouchableOpacity>

      {/* Day pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.pillScroll} contentContainerStyle={s.pillContent}>
        {plan.days.map((d, i) => (
          <TouchableOpacity activeOpacity={0.7}
            key={`${d.id}-${i}`}
            style={[s.pill, activeDay === i && s.pillActive]}
            onPress={() => setActiveDay(i)}
          >
            <Text style={[s.pillTxt, activeDay === i && s.pillTxtActive]}>Day {i + 1}</Text>
            <Text style={[s.pillSub, activeDay === i && s.pillSubActive]}>{d.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollInner} showsVerticalScrollIndicator={false}>
        <View style={s.dayHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.dayName}>{day.name}</Text>
            <Text style={s.dayFocus}>{day.focus}</Text>
          </View>
          <TouchableOpacity activeOpacity={0.7} style={s.startBtn} onPress={() => startSession(dayIdx)}>
            <Text style={s.startBtnTxt}>▶  시작</Text>
          </TouchableOpacity>
        </View>

        {day.ids.map((id, i) => {
          const e = exById(id);
          if (!e) return null;
          return (
            <TouchableOpacity
              key={`${id}-${i}`}
              style={s.exCard}
              activeOpacity={0.75}
              onPress={() => router.push(`/exercise/${id}`)}
            >
              <ExerciseMedia exId={id} rounded={12} style={s.exThumb} dim={0.3} />
              <View style={s.exInfo}>
                <Text style={s.exOrder}>{String(i + 1).padStart(2, '0')}</Text>
                <Text style={s.exName}>{e.n}</Text>
                <Text style={s.exPart}>
                  {PART_LABEL[e.part]} · {e.eq.map((q) => EQUIP_LABEL[q]).join('/')}
                </Text>
              </View>
              <View style={s.exSetsWrap}>
                <Text style={s.exSetsNum}>{e.s}</Text>
                <Text style={s.exSetsSub}>세트</Text>
                <Text style={s.exRep}>{e.r}</Text>
              </View>
            </TouchableOpacity>
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
        <PrimaryBtn label="다른 루틴 둘러보기" onPress={() => router.push('/routine')} style={{ marginTop: 10 }} />

        <Notice>일반적인 운동 가이드입니다. 통증이나 질환이 있다면 전문가와 상담하세요.</Notice>
      </ScrollView>

    </SafeAreaView>
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
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  emptyTxt: { color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  emptyBtn: { backgroundColor: colors.ink, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 12 },
  emptyBtnTxt: { color: colors.bg, fontSize: 14, fontWeight: '700' },

  routineBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 12, padding: 14,
    backgroundColor: colors.panel2, borderRadius: 14,
    borderWidth: 1, borderColor: colors.line2,
  },
  routineName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  routineSub: { fontSize: 11, color: colors.muted, marginTop: 3 },
  routineLink: { fontSize: 11.5, color: colors.mid, fontWeight: '600' },

  // 가로 스크롤러: ScrollView 기본값이 flexShrink:1 이라 형제에 눌려 잘린다
  pillScroll: { flexGrow: 0, flexShrink: 0 },
  pillContent: { paddingHorizontal: 16, paddingBottom: 14, gap: 8, flexDirection: 'row' },
  pill: {
    backgroundColor: colors.panel2, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 10,
    borderWidth: 1, borderColor: colors.line, alignItems: 'center', minWidth: 80,
  },
  pillActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  pillTxt: { fontSize: 11, fontWeight: '700', color: colors.muted, letterSpacing: 0.5 },
  pillTxtActive: { color: colors.bg },
  pillSub: { fontSize: 10.5, color: colors.muted, marginTop: 2 },
  pillSubActive: { color: colors.onAccentSub },

  scroll: { flex: 1 },
  scrollInner: { paddingHorizontal: 16, paddingBottom: 36 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12 },
  dayName: { fontSize: 22, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  dayFocus: { fontSize: 12, color: colors.muted, marginTop: 3 },
  startBtn: { backgroundColor: colors.ink, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11 },
  startBtnTxt: { color: colors.bg, fontSize: 13, fontWeight: '700' },

  exCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.panel, borderRadius: 16, padding: 12,
    marginBottom: 10, borderWidth: 1, borderColor: colors.line,
  },
  exThumb: { width: 56, height: 56 },
  exInfo: { flex: 1 },
  exOrder: { fontSize: 10, fontWeight: '800', color: colors.muted, letterSpacing: 1 },
  exName: { fontSize: 15, fontWeight: '600', color: colors.ink, marginTop: 2 },
  exPart: { fontSize: 11, color: colors.muted, marginTop: 3 },
  exSetsWrap: { alignItems: 'center', minWidth: 42 },
  exSetsNum: { fontSize: 20, fontWeight: '800', color: colors.ink, lineHeight: 24 },
  exSetsSub: { fontSize: 10, color: colors.muted, letterSpacing: 0.5 },
  exRep: { fontSize: 11, color: colors.mid, marginTop: 2 },

  regenRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
}));
