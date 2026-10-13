import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ThemeToggle, colors, themed, useThemeMode } from '../../src/theme';
import { useAppStore } from '../../src/stores/appStore';
import { useAuthStore } from '../../src/stores/authStore';
import { FEED } from '../../src/data/feed';
import { exById } from '../../src/data/exercises';
import ExerciseMedia from '../../src/components/ExerciseMedia';
import { nextDayIdx, weekStreak, currentStreakDays, totalSets } from '../../src/utils/stats';
import { HomeProjectCard } from '../../src/components/body/HomeProjectCard';

const DOW = ['월', '화', '수', '목', '금', '토', '일'];

export default function HomeScreen() {
  useThemeMode();
  const router = useRouter();
  const plan = useAppStore((s) => s.plan);
  const logs = useAppStore((s) => s.logs);
  const startSession = useAppStore((s) => s.startSession);
  const hydrating = useAuthStore((s) => s.hydrating);

  const today = new Date().toLocaleDateString('ko-KR', {
    month: '2-digit', day: '2-digit', weekday: 'short',
  });

  if (!plan && hydrating) {
    // 로그인 직후 플랜이 오기 전에 "플랜 없음" 을 보이면 루틴을 골라 기존 플랜을 덮어쓰게 된다
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.empty}>
          <ActivityIndicator color={colors.muted} />
        </View>
      </SafeAreaView>
    );
  }

  if (!plan) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.empty}>
          <Text style={s.emptyTxt}>아직 플랜이 없습니다.</Text>
          <TouchableOpacity activeOpacity={0.7} style={s.emptyBtn} onPress={() => router.push('/routine')}>
            <Text style={s.emptyBtnTxt}>루틴 선택하기</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const dayIdx = nextDayIdx(logs, plan);
  const day = plan.days[dayIdx];
  const streak = weekStreak(logs);
  const streakDays = currentStreakDays(logs);
  const weekSets = totalSets(logs, { weekOnly: true });
  // 이번 주 운동 횟수를 목표 일수와 대비해 보여준다
  const weekDone = streak.filter(Boolean).length;
  // 목표 일수는 플랜(루틴)의 데이 수 — 프로필의 주 N일과 프리셋 루틴이 다를 수 있다
  const weekGoal = Math.max(1, plan.days.length);
  const goalPct = Math.min(100, Math.round((weekDone / weekGoal) * 100));

  const lastLog = logs[0];
  const comment = lastLog && lastLog.totalSets > 0
    ? `최근 ${lastLog.dayName}에서 ${lastLog.totalSets}세트를 완료했습니다. 오늘은 ${day.name} 차례예요.`
    : `오늘은 ${day.name}입니다. 무게는 12회를 안정적으로 수행 가능한 수준으로 시작하세요.`;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.topbar}>
        <Text style={s.logo}>MILITARYTRACKER</Text>
        <View style={s.topRight}>
          <Text style={s.meta}>{today}</Text>
          <ThemeToggle />
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollInner} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={s.heroCard}>
          <View style={s.heroTopRow}>
            <View style={s.heroBadge}>
              <Text style={s.heroBadgeTxt}>DAY {dayIdx + 1} / {plan.days.length}</Text>
            </View>
            {plan.routineId && (
              <TouchableOpacity activeOpacity={0.7} onPress={() => router.push(`/routine/${plan.routineId}`)}>
                <Text style={s.heroLink}>루틴 보기 ›</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={s.heroName}>{day.name}</Text>
          <Text style={s.heroFocus}>{day.focus}</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.heroThumbs} contentContainerStyle={s.heroThumbsInner}>
            {day.ids.map((id, i) => (
              <TouchableOpacity key={`${id}-${i}`} onPress={() => router.push(`/exercise/${id}`)} activeOpacity={0.8}>
                <ExerciseMedia exId={id} rounded={10} style={s.heroThumb} dim={0.35} />
                <Text style={s.heroThumbTxt} numberOfLines={1}>{exById(id)?.n ?? ''}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity activeOpacity={0.7}
            style={s.startBtn}
            onPress={() => startSession(dayIdx)}
            accessibilityRole="button"
            accessibilityLabel={`${day.name} 운동 시작`}
          >
            <Text style={s.startBtnTxt}>▶  운동 시작</Text>
          </TouchableOpacity>
        </View>

        {/* 내 변화 프로젝트 — 분석 · 진행 · 체크인 */}
        <HomeProjectCard />

        {/* Streak — 탭하면 운동 기록으로 */}
        <TouchableOpacity
          style={s.card}
          activeOpacity={0.8}
          onPress={() => router.push('/history')}
          accessibilityRole="button"
          accessibilityLabel="이번 주 운동 현황, 운동 기록 보기"
        >
          <View style={s.cardHead}>
            <Text style={s.sectionLabel}>THIS WEEK</Text>
            <Text style={s.cardMeta}>{weekSets}세트 ›</Text>
          </View>

          <View style={s.goalRow}>
            <Text style={s.goalTxt}>
              <Text style={s.goalNum}>{weekDone}</Text>
              <Text style={s.goalSlash}> / {weekGoal}일</Text>
              {weekDone >= weekGoal ? <Text style={s.goalDone}>  목표 달성</Text> : null}
            </Text>
            {streakDays > 1 && <Text style={s.goalStreak}>{streakDays}일 연속</Text>}
          </View>
          <View style={s.goalBar}>
            <View style={[s.goalFill, { width: `${goalPct}%` }]} />
          </View>

          <View style={s.streakRow}>
            {DOW.map((d, i) => (
              <View key={i} style={[s.streakCell, streak[i] && s.streakOn]}>
                <Text style={[s.streakDay, streak[i] && s.streakDayOn]}>{d}</Text>
              </View>
            ))}
          </View>
        </TouchableOpacity>

        {/* 오늘의 팁 — 유료 'AI 코치' 와 이름을 겹치지 않는다 */}
        <View style={s.card}>
          <Text style={s.sectionLabel}>TODAY</Text>
          <Text style={s.commentTxt}>{comment}</Text>
        </View>

        {/* Library */}
        <View style={s.secRow}>
          <Text style={s.secTitle}>라이브러리</Text>
          <Text style={s.secMeta}>{FEED.length} 시리즈</Text>
        </View>
        <View style={s.grid}>
          {FEED.map((f) => (
            <TouchableOpacity
              key={f.id}
              style={s.gridCard}
              activeOpacity={0.75}
              onPress={() => router.push(`/library/${f.id}`)}
            >
              <View style={s.gridThumb}>
                <Image source={f.img} style={s.gridThumbImg} resizeMode="cover" />
                <View style={s.gridThumbOverlay} />
                <View style={s.gridBadge}>
                  <Text style={s.gridBadgeTxt}>{f.cnt}</Text>
                </View>
              </View>
              <Text style={s.gridName} numberOfLines={2}>{f.n}</Text>
              <Text style={s.gridPart}>{f.part}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

    </SafeAreaView>
  );
}

const s = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topbar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingLeft: 20, paddingRight: 10, paddingTop: 6, paddingBottom: 2,
  },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  logo: { fontSize: 13, fontWeight: '800', color: colors.ink, letterSpacing: 2.5 },
  meta: { fontSize: 10, color: colors.muted, letterSpacing: 1 },
  scroll: { flex: 1 },
  scrollInner: { paddingHorizontal: 16, paddingBottom: 36 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  emptyTxt: { color: colors.muted, fontSize: 14 },
  emptyBtn: {
    backgroundColor: colors.ink, borderRadius: 12,
    paddingHorizontal: 22, paddingVertical: 12,
  },
  emptyBtnTxt: { color: colors.bg, fontSize: 14, fontWeight: '700' },

  heroCard: {
    backgroundColor: colors.panel2, borderRadius: 20, padding: 20,
    marginBottom: 12, borderWidth: 1, borderColor: colors.line2,
  },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  heroBadge: {
    alignSelf: 'flex-start', backgroundColor: colors.panel3,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
  },
  heroBadgeTxt: { fontSize: 10, fontWeight: '700', color: colors.muted, letterSpacing: 1.5 },
  heroLink: { fontSize: 11.5, color: colors.mid, fontWeight: '600' },
  heroName: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5, marginBottom: 4 },
  heroFocus: { fontSize: 13, color: colors.muted, marginBottom: 14 },
  heroThumbs: { flexGrow: 0, flexShrink: 0, marginBottom: 16, marginHorizontal: -4 },
  heroThumbsInner: { gap: 8, paddingHorizontal: 4 },
  heroThumb: { width: 72, height: 72 },
  heroThumbTxt: { fontSize: 10, color: colors.muted, marginTop: 5, width: 72, textAlign: 'center' },
  startBtn: { backgroundColor: colors.ink, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  startBtnTxt: { color: colors.bg, fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },

  card: {
    backgroundColor: colors.panel, borderRadius: 18, padding: 18,
    marginBottom: 12, borderWidth: 1, borderColor: colors.line,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardMeta: { fontSize: 10.5, color: colors.mid, marginBottom: 14 },
  sectionLabel: {
    fontSize: 10, fontWeight: '800', color: colors.muted,
    letterSpacing: 2, marginBottom: 14,
  },
  goalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  goalTxt: { fontSize: 13, color: colors.muted },
  goalNum: { fontSize: 20, fontWeight: '800', color: colors.ink },
  goalSlash: { fontSize: 13, color: colors.muted },
  goalDone: { fontSize: 11.5, color: colors.good, fontWeight: '700' },
  goalStreak: { fontSize: 11.5, color: colors.mid, fontWeight: '600' },
  goalBar: {
    height: 4, borderRadius: 3, backgroundColor: colors.panel3,
    overflow: 'hidden', marginBottom: 14,
  },
  goalFill: { height: '100%', borderRadius: 3, backgroundColor: colors.ink },
  streakRow: { flexDirection: 'row', gap: 5 },
  streakCell: {
    flex: 1, aspectRatio: 1, borderRadius: 8,
    backgroundColor: colors.panel3, borderWidth: 1, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  streakOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  streakDay: { fontSize: 10, color: colors.muted, fontWeight: '600' },
  streakDayOn: { color: colors.bg, fontWeight: '700' },
  commentTxt: { fontSize: 14, color: colors.mid, lineHeight: 22 },

  secRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'baseline', marginBottom: 12, marginTop: 6,
  },
  secTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  secMeta: { fontSize: 11, color: colors.muted },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridCard: { width: '47.5%' },
  gridThumb: {
    aspectRatio: 1, borderRadius: 16, backgroundColor: colors.panel2,
    marginBottom: 8, overflow: 'hidden', justifyContent: 'flex-end', padding: 10,
  },
  gridThumbImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  gridThumbOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.mediaDim },
  gridBadge: {
    alignSelf: 'flex-start', backgroundColor: colors.mediaBadge,
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 0.5, borderColor: colors.mediaBadgeLine,
  },
  gridBadgeTxt: { fontSize: 10, color: colors.onMediaSub, fontWeight: '600' },
  gridName: { fontSize: 12.5, fontWeight: '600', color: colors.ink, lineHeight: 17, marginBottom: 3 },
  gridPart: { fontSize: 11, color: colors.muted },
}));
