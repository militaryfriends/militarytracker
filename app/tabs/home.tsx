import { prescription, rxText } from '../../src/utils/prescription';
import { LoadingSkeleton } from '../../src/components/LoadingSkeleton';
import { hasHydrated } from '../../src/stores/appStore';
import { RemeasureNote } from '../../src/components/body/RemeasureNote';
import { WaitlistNote } from '../../src/components/WaitlistNote';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ThemeToggle, colors, themed, useThemeMode } from '../../src/theme';
import { useAppStore } from '../../src/stores/appStore';
import { useAuthStore } from '../../src/stores/authStore';
import { FEED, coverExId } from '../../src/data/feed';
import { exById } from '../../src/data/exercises';
import ExerciseMedia from '../../src/components/ExerciseMedia';
import { nextDayIdx, weekStreak, currentStreakDays, totalSets } from '../../src/utils/stats';
import { HomeHero } from '../../src/components/body/HomeHero';
import { FONT, PressableScale, PRESS_SCALE } from '../../src/ui';
import { calcBodyStats } from '../../src/utils/body';
import { localDate } from '../../src/services/workoutService';
import { useScreenSize } from '../../src/ui/screenSize';
import { TabFade } from '../../src/components/TabBar';

const DOW = ['월', '화', '수', '목', '금', '토', '일'];

export default function HomeScreen() {
  useThemeMode();
  const router = useRouter();
  const plan = useAppStore((s) => s.plan);
  const profile = useAppStore((s) => s.profile);
  const logs = useAppStore((s) => s.logs);
  const weights = useAppStore((s) => s.weights);
  const project = useAppStore((s) => s.project);
  const { width } = useScreenSize();
  const startSession = useAppStore((s) => s.startSession);
  const hydrating = useAuthStore((s) => s.hydrating);

  // 월 = 0 … 일 = 6 (이번 주 칸과 같은 순서)
  const todayDow = (new Date().getDay() + 6) % 7;

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
          <Text style={s.emptyTxt}>아직 플랜이 없습니다.</Text>
          <PressableScale style={s.emptyBtn} onPress={() => router.push('/routine')}>
            <Text style={s.emptyBtnTxt}>루틴 선택하기</Text>
          </PressableScale>
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
  const todayStr = localDate(new Date());
  const todaySets = logs.filter((l) => l.date === todayStr).reduce((a, l) => a + l.totalSets, 0);

  const lastLog = logs[0];
  const comment = lastLog && lastLog.totalSets > 0
    // '최근'이 언제인지 날짜를 붙인다 — 바로 위 이번 주 0세트와 어긋나 보이지 않게(검수 5)
    // 오늘 이미 운동했으면 '오늘은 ○○ 차례'라고 또 시키지 않는다 — 방금 끝냈는데 다음 날 루틴을 오늘 하라고 읽혔다(11/27 화면 점검)
    ? lastLog.date === todayStr
      ? `오늘 ${lastLog.dayName}에서 ${lastLog.totalSets}세트를 했어요. 다음은 ${day.name} 차례예요.`
      : `${Number(lastLog.date.slice(5, 7))}/${Number(lastLog.date.slice(8, 10))} ${lastLog.dayName}에서 ${lastLog.totalSets}세트를 했어요. 오늘은 ${day.name} 차례예요.`
    : (() => {
      const first = day.ids.map((id) => exById(id)).find(Boolean);
      const rx = first ? prescription(first, (profile?.level ?? 2) as 1 | 2 | 3) : null;
      return rx
        ? `오늘은 ${day.name}입니다. 첫 종목 ${first!.n}은 ${rxText(rx)} — 세트마다 ${rx.rir}회쯤 여유가 남는 무게로 시작하세요.`
        : `오늘은 ${day.name}입니다.`;
    })();

  // 오늘 할 일 — 운동 한 줄 + 식단 · 체중 (한 일은 흰 체크, 지금 할 것 하나만 빨강)
  const lv = (profile?.level ?? 2) as 1 | 2 | 3;
  const daySets = day.ids.reduce((a, id) => { const e = exById(id); return a + (e ? prescription(e, lv).sets : 0); }, 0);
  const dayMin = Math.max(10, Math.round((daySets * 2.4) / 5) * 5);
  const workoutDone = todaySets > 0;
  const doneName = logs.find((l) => l.date === todayStr && l.totalSets > 0)?.dayName;
  const weekAgo = localDate(new Date(Date.now() - 6 * 86_400_000));
  const lastW = weights.reduce<(typeof weights)[number] | null>((a, w) => (!a || w.date > a.date ? w : a), null);
  const weighed = !!lastW && lastW.date >= weekAgo;
  const doneCount = (workoutDone ? 1 : 0) + (weighed ? 1 : 0);
  const stats = calcBodyStats(profile, weights, project);
  const weekday = new Date().toLocaleDateString('ko-KR', { weekday: 'long' });
  const dateLine = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.topbar}>
        <View style={s.titleBox}>
          <Text style={s.date}>{dateLine}</Text>
          <Text style={s.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} accessibilityRole="header">
            {workoutDone ? `${weekday}, 오늘 운동 끝` : `${weekday}, ${day.name}`}
          </Text>
        </View>
        <ThemeToggle />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollInner} showsVerticalScrollIndicator={false}>
        <HomeHero avatarW={Math.round(Math.min(168, (Math.min(width, 480) - 40) * 0.44))} />
        <RemeasureNote />
        <WaitlistNote />

        {/* 오늘 할 일 */}
        <View style={s.sheet}>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle} accessibilityRole="header">오늘 할 일</Text>
            <Text style={s.sheetMeta}><Text style={s.sheetNum}>{doneCount}</Text> / 2 완료</Text>
          </View>
          {/* 운동 칸 — 썸네일 · 이름 · 버튼, 그 아래에 몇 일차 · 부위를 같은 칸 안에 둔다(칸 밖에 떠 있던 한 줄, 11/27 배치 점검) */}
          <View style={s.mainBox}>
            <View style={s.mainRow}>
              <PressableScale onPress={() => router.push(`/exercise/${day.ids[0]}`)} accessibilityLabel="첫 종목 자세 보기">
                <ExerciseMedia exId={day.ids[0]} rounded={13} style={s.mainThumb} dim={0.2} />
                {workoutDone ? (
                  <View style={[s.tick, s.tickOn, s.thumbTick]}>
                    <Ionicons name="checkmark" size={13} color={colors.bg} />
                  </View>
                ) : null}
              </PressableScale>
              <View style={s.mainTxt}>
                {/* 끝낸 날은 '오늘 한 운동'을 보여 준다 — 예전엔 다음 날 루틴 이름 아래에 '오늘 3세트 완료'가 붙어 무엇을 끝냈는지 헷갈렸다 */}
                <Text style={s.mainName} numberOfLines={1}>{workoutDone && doneName ? doneName : day.name}</Text>
                <Text style={s.mainSub} numberOfLines={1}>
                  {workoutDone ? `오늘 ${todaySets}세트 완료` : `${day.ids.length}종목 ${daySets}세트 · 약 ${dayMin}분`}
                </Text>
              </View>
              <PressableScale
                style={[s.go, workoutDone && s.goDone]}
                onPress={() => startSession(dayIdx)}
                accessibilityLabel={workoutDone ? `다음 운동 ${day.name} 미리 하기` : `${day.name} 운동 시작`}
              >
                {workoutDone ? null : <Ionicons name="play" size={15} color={colors.onRed} />}
                <Text style={[s.goTxt, workoutDone && s.goDoneTxt]}>{workoutDone ? '다음 운동' : '시작'}</Text>
              </PressableScale>
            </View>
            <Text style={s.focus} numberOfLines={1}>
              {workoutDone ? `다음 차례 · ${day.name} · ${day.focus}` : `${dayIdx + 1}일차 / ${plan.days.length}일 · ${day.focus}`}
            </Text>
          </View>

          {/* 체크되는 일(운동 · 체중)을 먼저, 식단은 체크가 아니라 보러 가는 줄이라 아이콘으로 구분한다 — '2 / 2 완료'인데 빈 동그라미가 남던 문제 */}
          <TodayRow done={weighed} title="체중 기록" onPress={() => router.push('/tabs/my?weigh=1')}
            sub={lastW ? `최근 ${lastW.kg}kg · ${lastW.date.slice(5).replace('-', '월 ')}일` : '기록하면 지금 몸이 바로 바뀌어요'} />
          <View style={s.sep} />
          <TodayRow icon="restaurant-outline" title="오늘 식단" onPress={() => router.push('/tabs/diet')}
            sub={stats ? `하루 ${stats.kcal.toLocaleString()}kcal · 단백질 ${stats.protein}g` : '끼니별 식단 보기'} />
        </View>

        {/* 이번 주 — 탭하면 운동 기록으로 */}
        <PressableScale scaleTo={PRESS_SCALE.card}
          style={s.card}
          onPress={() => router.push('/history')}
          accessibilityRole="button"
          accessibilityLabel="이번 주 운동 현황, 운동 기록 보기"
        >
          <View style={s.weekRow}>
            <View style={s.weekBox}>
              <Text style={s.weekK}>이번 주</Text>
              <Text style={s.weekV}>{weekDone} / {weekGoal}일</Text>
            </View>
            <View style={s.streakRow}>
              {DOW.map((d, i) => (
                <View key={i} style={[s.streakCell, streak[i] && s.streakOn, !streak[i] && i === todayDow && s.streakToday]}>
                  <Text style={[s.streakDay, streak[i] && s.streakDayOn, !streak[i] && i === todayDow && s.streakDayToday]}>{d}</Text>
                </View>
              ))}
            </View>
          </View>
          <Text style={s.weekNote}>
            {weekSets}세트{streakDays > 1 ? ` · ${streakDays}일 연속` : ''}{weekDone >= weekGoal ? ' · 이번 주 목표 달성' : ''} · 기록 보기 ›
          </Text>
        </PressableScale>

        {/* 오늘의 팁 — 유료 'AI 코치' 와 이름을 겹치지 않는다 */}
        <View style={s.card}>
          <Text style={s.sectionLabel}>오늘의 팁</Text>
          <Text style={s.commentTxt}>{comment}</Text>
        </View>

        {/* Library */}
        <View style={s.secRow}>
          <Text style={s.secTitle}>라이브러리</Text>
          <Text style={s.secMeta}>{FEED.length} 시리즈</Text>
        </View>
        <View style={s.grid}>
          {FEED.map((f) => (
            <PressableScale scaleTo={PRESS_SCALE.card}
              key={f.id}
              style={s.gridCard}
              onPress={() => router.push(`/library/${f.id}`)}
            >
              <View style={s.gridThumb}>
                <ExerciseMedia exId={coverExId(f)} rounded={0} dim={0} style={s.gridThumbImg} />
                <View style={s.gridThumbOverlay} />
                <View style={s.gridBadge}>
                  <Text style={s.gridBadgeTxt}>{f.cnt}</Text>
                </View>
              </View>
              <Text style={s.gridName} numberOfLines={2}>{f.n}</Text>
              <Text style={s.gridPart}>{f.part}</Text>
            </PressableScale>
          ))}
        </View>
      </ScrollView>
      <TabFade />
    </SafeAreaView>
  );
}

/** done = 체크되는 일, icon = 체크가 아니라 보러 가는 줄 */
function TodayRow({ done = false, icon, title, sub, onPress }: {
  done?: boolean; icon?: keyof typeof Ionicons.glyphMap; title: string; sub: string; onPress: () => void;
}) {
  useThemeMode();
  return (
    <PressableScale scaleTo={PRESS_SCALE.card} style={s.todayRow} onPress={onPress} accessibilityRole="button"
      accessibilityLabel={`${title}, ${sub}${done ? ', 완료' : ''}`}>
      {icon ? (
        <View style={s.rowIcon}><Ionicons name={icon} size={19} color={colors.mid} /></View>
      ) : (
        <View style={[s.tick, done && s.tickOn]}>
          {done ? <Ionicons name="checkmark" size={15} color={colors.bg} /> : null}
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={s.todayTitle}>{title}</Text>
        <Text style={s.todaySub} numberOfLines={1}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.muted} />
    </PressableScale>
  );
}

const s = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topbar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingLeft: 20, paddingRight: 10, paddingTop: 8, paddingBottom: 6, gap: 8,
  },
  titleBox: { flex: 1, minWidth: 0 },
  date: { fontSize: 12, fontWeight: '600', color: colors.muted },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.5, marginTop: 2 },
  scroll: { flex: 1 },
  scrollInner: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 132 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  emptyTxt: { color: colors.muted, fontSize: 14 },
  emptyBtn: {
    backgroundColor: colors.red, borderRadius: 24, minHeight: 48, justifyContent: 'center',
    paddingHorizontal: 24, paddingVertical: 12,
  },
  emptyBtnTxt: { color: colors.onRed, fontSize: 14.5, fontWeight: '700' },

  // 아래에서 올라온 시트 모양
  sheet: {
    backgroundColor: colors.panel, borderRadius: 28, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6,
    marginBottom: 12, borderWidth: 1, borderColor: colors.line2,
  },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 4, marginBottom: 10 },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  sheetMeta: { fontSize: 13, color: colors.mid },
  sheetNum: { fontFamily: FONT.num, fontSize: 18, color: colors.ink },
  mainBox: {
    paddingHorizontal: 12, paddingTop: 12, paddingBottom: 10, marginBottom: 4,
    borderRadius: 20, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line,
  },
  mainRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  thumbTick: { position: 'absolute', right: -6, bottom: -6, width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.panel2 },
  mainThumb: { width: 52, height: 52 },
  mainTxt: { flex: 1, minWidth: 0 },
  mainName: { fontSize: 17, fontWeight: '700', color: colors.ink },
  mainSub: { fontSize: 12, color: colors.mid, marginTop: 2 },
  go: {
    height: 48, paddingHorizontal: 18, borderRadius: 24, backgroundColor: colors.red,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  goTxt: { fontSize: 15, fontWeight: '700', color: colors.onRed },
  goDone: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.line2 },
  goDoneTxt: { color: colors.ink },
  focus: { fontSize: 12, color: colors.mid, marginTop: 11, paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.line },
  todayRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingLeft: 4, paddingRight: 2 },
  tick: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line2, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  rowIcon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  todayTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  todaySub: { fontSize: 12, color: colors.mid, marginTop: 1 },
  sep: { height: 1, marginLeft: 40, backgroundColor: colors.line },

  card: {
    backgroundColor: colors.panel, borderRadius: 22, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: colors.line,
  },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: colors.muted, marginBottom: 8 },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  weekBox: { width: 62 },
  weekK: { fontSize: 12, fontWeight: '600', color: colors.muted },
  weekV: { fontFamily: FONT.num, fontSize: 20, color: colors.ink, marginTop: 1 },
  weekNote: { fontSize: 12, color: colors.mid, marginTop: 10 },
  streakRow: { flex: 1, flexDirection: 'row', gap: 5 },
  streakCell: {
    flex: 1, height: 38, borderRadius: 10,
    backgroundColor: colors.panel3, alignItems: 'center', justifyContent: 'center',
  },
  streakOn: { backgroundColor: colors.ink },
  streakToday: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.ink },
  streakDay: { fontSize: 12, color: colors.mid, fontWeight: '600' },
  streakDayOn: { color: colors.bg, fontWeight: '700' },
  streakDayToday: { color: colors.ink, fontWeight: '700' },
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
