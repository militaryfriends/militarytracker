import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, themed, useThemeMode } from '../../../src/theme';
import { showAlert } from '../../../src/utils/alert';
import { Screen, TopBar, Body, SectionLabel, PrimaryBtn, EmptyState, useSafeBack } from '../../../src/components/ui';
import ExerciseMedia from '../../../src/components/ExerciseMedia';
import { routineById, routineExCount } from '../../../src/data/routines';
import { exByIds } from '../../../src/data/exercises';
import { planFromRoutine } from '../../../src/utils/planner';
import { savePlan } from '../../../src/services/authService';
import { useAppStore } from '../../../src/stores/appStore';
import { useAuthStore } from '../../../src/stores/authStore';

export default function RoutineDetailScreen() {
  useThemeMode();
  const { routineId, onboard } = useLocalSearchParams<{ routineId: string; onboard?: string }>();
  const router = useRouter();
  const goBack = useSafeBack();
  const { user } = useAuthStore();
  const { plan, setPlan } = useAppStore();
  const [applying, setApplying] = useState(false);

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

  return (
    <Screen>
      <TopBar
        title={routine.name}
        meta={routine.short}
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
            <TouchableOpacity
              key={d.id}
              style={s.dayCard}
              activeOpacity={0.75}
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
            </TouchableOpacity>
          );
        })}

        {isOnboard ? (
          <PrimaryBtn label="이 루틴으로 시작하기" onPress={() => router.replace('/tabs/home')} style={{ marginTop: 8 }} />
        ) : (
          <PrimaryBtn
            label={isCurrent ? '현재 사용 중인 루틴' : '내 플랜으로 적용'}
            onPress={apply}
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
