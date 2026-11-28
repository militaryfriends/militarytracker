import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../../../src/components/Text';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, themed, useThemeMode } from '../../../src/theme';
import { showAlert } from '../../../src/utils/alert';
import { Screen, TopBar, Body, SectionLabel, PrimaryBtn, EmptyState, useSafeBack } from '../../../src/components/ui';
import ExerciseMedia from '../../../src/components/ExerciseMedia';
import { isFocus, routineById, routineExCount } from '../../../src/data/routines';
import { FocusActions } from '../../../src/components/FocusActions';
import { Segmented } from '../../../src/ui';
import { PART_LABEL } from '../../../src/data/exercises';
import { exByIds } from '../../../src/data/exercises';
import { planFromRoutine } from '../../../src/utils/planner';
import { savePlan } from '../../../src/services/authService';
import { useAppStore } from '../../../src/stores/appStore';
import { useAuthStore } from '../../../src/stores/authStore';
import { PressableScale, PRESS_SCALE } from '../../../src/ui';

export default function RoutineDetailScreen() {
  useThemeMode();
  const { routineId, onboard } = useLocalSearchParams<{ routineId: string; onboard?: string }>();
  const router = useRouter();
  const goBack = useSafeBack();
  const { user } = useAuthStore();
  const { plan, setPlan } = useAppStore();
  const [applying, setApplying] = useState(false);
  const [dayPick, setDayPick] = useState(0);

  const routine = routineById(String(routineId));
  const isOnboard = onboard === '1';
  const isCurrent = plan?.routineId === routine?.id;

  if (!routine) {
    return (
      <Screen>
        <TopBar title="루틴" onBack={goBack} />
        <EmptyState text="루틴을 찾을 수 없습니다." />
      </Screen>
    );
  }

  /** 분할 루틴은 플랜 전체를 바꾼다 — 한 번 묻는다 */
  function confirmApply() {
    if (!routine) return;
    if (!plan) { void apply(); return; }
    showAlert('플랜을 바꿀까요?', `지금 플랜이 ${routine.name}(주 ${routine.daysPerWeek}일)으로 바뀌어요. 붙여 둔 부위 집중 묶음도 빠져요.`, [
      { text: '취소', style: 'cancel' },
      { text: '바꾸기', onPress: () => { void apply(); } },
    ]);
  }

  async function apply() {
    if (!user || !routine) return;
    setApplying(true);
    try {
      const next = planFromRoutine(routine.id);
      if (!next) throw new Error('invalid');
      await savePlan(user.uid, next);
      setPlan(next);
      showAlert('적용 완료', `${routine.name} 루틴이 내 플랜으로 설정되었습니다.`);
    } catch {
      showAlert('오류', '루틴 적용에 실패했습니다.');
    } finally {
      setApplying(false);
    }
  }

  if (isFocus(routine)) {
    const day = routine.days[Math.min(dayPick, routine.days.length - 1)];
    const list = exByIds(day.exIds);
    return (
      <Screen>
        <TopBar title={routine.name} onBack={() => router.back()} />
        <Body>
          <Text style={s.kicker}>부위 집중 · {routine.group}</Text>
          <Text style={s.subtitle}>{routine.subtitle}</Text>
          <Text style={s.desc}>{routine.desc}</Text>
          {routine.days.length > 1 ? (
            <View style={{ marginTop: 14 }}>
              <Segmented<string> label="세션" options={routine.days.map((d, i) => ({ value: String(i), label: d.name }))}
                value={String(dayPick)} onChange={(v) => setDayPick(Number(v))} />
            </View>
          ) : null}
          <SectionLabel>{list.length}동작</SectionLabel>
          {list.map((e, i) => (
            <PressableScale key={e.id} scaleTo={PRESS_SCALE.card} style={s.exRow} onPress={() => router.push(`/exercise/${e.id}`)}
              accessibilityRole="button" accessibilityLabel={`${i + 1}번째, ${e.n}`}>
              <Text style={s.exNum}>{i + 1}</Text>
              <ExerciseMedia exId={e.id} rounded={10} style={s.exThumb} dim={0.3} />
              <View style={{ flex: 1 }}>
                <Text style={s.exName}>{e.n}</Text>
                <Text style={s.exMeta}>{e.g.startsWith(PART_LABEL[e.part]) ? e.g : `${PART_LABEL[e.part]} · ${e.g}`}</Text>
              </View>
              <Text style={s.chev}>›</Text>
            </PressableScale>
          ))}
          <FocusActions routine={routine} day={day} />
        </Body>
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar
        title={routine.name}
        onBack={isOnboard ? undefined : () => router.back()}
      />
      <Body>
        <Text style={s.subtitle}>{routine.subtitle}</Text>
        <Text style={s.desc}>{routine.desc}</Text>

        <View style={s.statRow}>
          <Stat value={`주 ${routine.daysPerWeek}일`} label="빈도" />
          <Stat value={`${routine.days.length}개`} label="데이" />
          <Stat value={`${routineExCount(routine)}종목`} label="총 종목" />
        </View>

        <SectionLabel>데이 구성</SectionLabel>
        {routine.days.map((d, i) => {
          const list = exByIds(d.exIds);
          return (
            <PressableScale haptic="select" scaleTo={PRESS_SCALE.card}
              key={d.id}
              style={s.dayCard}
              onPress={() => router.push(`/routine/${routine.id}/${d.id}`)}
            >
              <View style={s.dayHead}>
                <View style={s.dayNumBox}><Text style={s.dayNum}>{i + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.dayName}>{d.name}</Text>
                  <Text style={s.dayFocus}>{d.focus} · {list.length}종목</Text>
                </View>
                <Text style={s.chev}>›</Text>
              </View>

              <View style={s.thumbRow}>
                {list.slice(0, 4).map((e) => (
                  <ExerciseMedia key={e.id} exId={e.id} rounded={10} style={s.thumb} dim={0.3} />
                ))}
                {list.length > 4 && (
                  <View style={[s.thumb, s.more]}>
                    <Text style={s.moreTxt}>+{list.length - 4}</Text>
                  </View>
                )}
              </View>
            </PressableScale>
          );
        })}

        {isOnboard ? (
          <PrimaryBtn label="이 루틴으로 시작하기" onPress={() => router.replace('/tabs/home')} style={{ marginTop: 8 }} />
        ) : (
          <PrimaryBtn
            label={isCurrent ? '현재 사용 중인 루틴' : '내 플랜으로 바꾸기'}
            onPress={confirmApply}
            loading={applying}
            disabled={isCurrent}
            style={{ marginTop: 8 }}
          />
        )}
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
  subtitle: { fontSize: 13, color: colors.mid, marginTop: 4 },
  kicker: { fontSize: 12, fontWeight: '700', color: colors.muted, marginTop: 4 },
  exRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.panel, borderRadius: 14,
    padding: 10, borderWidth: 1, borderColor: colors.line, marginBottom: 8,
  },
  exNum: { width: 18, textAlign: 'center', fontSize: 13, fontWeight: '800', color: colors.muted },
  exThumb: { width: 52, height: 52 },
  exName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  exMeta: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
  desc: { fontSize: 13, color: colors.muted, lineHeight: 21, marginTop: 8 },
  statRow: { flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 4 },
  stat: {
    flex: 1, backgroundColor: colors.panel, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.line,
  },
  statVal: { fontSize: 16, fontWeight: '800', color: colors.ink },
  statLabel: { fontSize: 10, color: colors.muted, marginTop: 4 },

  dayCard: {
    backgroundColor: colors.panel, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: colors.line, marginBottom: 10,
  },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dayNumBox: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: colors.panel3,
    alignItems: 'center', justifyContent: 'center',
  },
  dayNum: { fontSize: 14, fontWeight: '800', color: colors.mid },
  dayName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  dayFocus: { fontSize: 11.5, color: colors.muted, marginTop: 3 },
  chev: { fontSize: 22, color: colors.muted },
  thumbRow: { flexDirection: 'row', gap: 6, marginTop: 14 },
  thumb: { flex: 1, aspectRatio: 1 },
  more: {
    backgroundColor: colors.panel3, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  moreTxt: { fontSize: 12, fontWeight: '700', color: colors.muted },
}));
