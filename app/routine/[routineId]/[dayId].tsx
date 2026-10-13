import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, themed, useThemeMode } from '../../../src/theme';
import { Screen, TopBar, Body, SectionLabel, PrimaryBtn, EmptyState, Notice, useSafeBack } from '../../../src/components/ui';
import ExerciseMedia from '../../../src/components/ExerciseMedia';
import { routineById, routineDay, routineExercises } from '../../../src/data/routines';
import { EQUIP_LABEL, LEVEL_LABEL, PART_LABEL } from '../../../src/data/exercises';
import { useAppStore } from '../../../src/stores/appStore';
import { showAlert } from '../../../src/utils/alert';

export default function RoutineDayScreen() {
  useThemeMode();
  const { routineId, dayId } = useLocalSearchParams<{ routineId: string; dayId: string }>();
  const router = useRouter();
  const goBack = useSafeBack();
  const plan = useAppStore((s) => s.plan);
  const session = useAppStore((s) => s.session);
  const startSession = useAppStore((s) => s.startSession);

  const routine = routineById(String(routineId));
  const day = routineDay(String(routineId), String(dayId));
  const list = routineExercises(String(routineId), String(dayId));

  if (!routine || !day) {
    return (
      <Screen>
        <TopBar title="데이" onBack={goBack} />
        <EmptyState text="데이를 찾을 수 없습니다." />
      </Screen>
    );
  }

  // 현재 플랜이 이 루틴이면 해당 데이로 바로 세션을 시작할 수 있다
  const planDayIdx = plan?.routineId === routine.id
    ? plan.days.findIndex((d) => d.id === day.id)
    : -1;

  const totalSets = list.reduce((a, e) => a + e.s, 0);
  // 세트당 수행 ~40초 + 종목별 권장 휴식 — 휴식을 빼고 계산하면 120초 휴식 종목에서 크게 빗나간다
  const estMin = Math.round(list.reduce((a, e) => a + e.s * (e.rest + 40), 0) / 60);

  return (
    <Screen>
      <TopBar title={day.name} meta={routine.short} onBack={goBack} />
      <Body>
        <Text style={s.focus}>{day.focus}</Text>
        <Text style={s.desc}>{day.desc}</Text>

        <View style={s.statRow}>
          <Stat value={`${list.length}`} label="종목" />
          <Stat value={`${totalSets}`} label="총 세트" />
          <Stat value={`${estMin}분`} label="예상 시간" />
        </View>

        {planDayIdx >= 0 && (
          <PrimaryBtn
            label="▶  이 데이 운동 시작"
            onPress={() => {
              if (session) {
                // 진행 중인 세션을 덮어쓰면 입력하던 세트가 전부 사라진다
                showAlert('진행 중인 운동이 있습니다', '홈에서 진행 중인 운동을 마치거나 종료한 뒤 시작할 수 있습니다.', [
                  { text: '확인', onPress: () => router.replace('/tabs/home') },
                ]);
                return;
              }
              if (startSession(planDayIdx)) router.replace('/tabs/home');
            }}
            style={{ marginBottom: 14 }}
          />
        )}

        <SectionLabel>운동 종목</SectionLabel>
        {list.map((e, i) => (
          <TouchableOpacity
            key={e.id}
            style={s.exCard}
            activeOpacity={0.75}
            onPress={() => router.push(`/exercise/${e.id}`)}
          >
            <ExerciseMedia exId={e.id} rounded={12} style={s.exThumb} dim={0.3} />
            <View style={s.exInfo}>
              <Text style={s.exOrder}>{String(i + 1).padStart(2, '0')}</Text>
              <Text style={s.exName}>{e.n}</Text>
              <Text style={s.exMeta}>
                {PART_LABEL[e.part]} · {e.g}
              </Text>
              <View style={s.tagRow}>
                {e.eq.map((q) => (
                  <View key={q} style={s.tag}><Text style={s.tagTxt}>{EQUIP_LABEL[q]}</Text></View>
                ))}
                <View style={s.tag}><Text style={s.tagTxt}>{LEVEL_LABEL[e.lv]}</Text></View>
              </View>
            </View>
            <View style={s.exSets}>
              <Text style={s.exSetsNum}>{e.s}</Text>
              <Text style={s.exSetsSub}>세트</Text>
              <Text style={s.exRep}>{e.r}</Text>
            </View>
          </TouchableOpacity>
        ))}

        <Notice>일반적인 운동 가이드입니다. 통증이나 질환이 있다면 전문가와 상담하세요.</Notice>
      </Body>
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  useThemeMode();
  return (
    <View style={s.stat}>
      <Text style={s.statVal}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  focus: { fontSize: 14, color: colors.ink, fontWeight: '600', marginTop: 4 },
  desc: { fontSize: 13, color: colors.muted, lineHeight: 21, marginTop: 8 },
  statRow: { flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 14 },
  stat: {
    flex: 1, backgroundColor: colors.panel, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.line,
  },
  statVal: { fontSize: 18, fontWeight: '800', color: colors.ink },
  statLabel: { fontSize: 10, color: colors.muted, marginTop: 4 },

  exCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.panel, borderRadius: 16, padding: 12,
    borderWidth: 1, borderColor: colors.line, marginBottom: 10,
  },
  exThumb: { width: 64, height: 64 },
  exInfo: { flex: 1 },
  exOrder: { fontSize: 10, fontWeight: '800', color: colors.muted, letterSpacing: 1 },
  exName: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 2 },
  exMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  tagRow: { flexDirection: 'row', gap: 4, marginTop: 6, flexWrap: 'wrap' },
  tag: { backgroundColor: colors.panel3, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  tagTxt: { fontSize: 10, color: colors.muted, fontWeight: '600' },
  exSets: { alignItems: 'center', minWidth: 44 },
  exSetsNum: { fontSize: 19, fontWeight: '800', color: colors.ink, lineHeight: 23 },
  exSetsSub: { fontSize: 10, color: colors.muted, letterSpacing: 0.5 },
  exRep: { fontSize: 10.5, color: colors.mid, marginTop: 2 },
}));
