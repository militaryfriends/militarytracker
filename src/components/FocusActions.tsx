/**
 * 부위 집중 루틴 동작 — 루틴 상세 아래(2026-11-28 대표 결정).
 *  · ○○데이에 붙이기(주 버튼): 플랜은 그대로, 고른 요일 운동 끝에 이 묶음이 붙는다. 맞는 요일을 먼저 골라 둔다.
 *  · 지금 한 번만 하기: 플랜을 건드리지 않고 이 종목들로 바로 운동한다(기록은 남고, 다음 차례 계산에서는 건너뛴다).
 *  · 이미 붙어 있으면 어느 요일인지 보여 주고 떼기.
 */
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { colors, themed, useThemeMode } from '../theme';
import { PrimaryBtn, GhostBtn } from './ui';
import { PressableScale } from '../ui';
import { showAlert } from '../utils/alert';
import { eulReul } from '../utils/josa';
import { attachAddon, attachedDay, detachAddon, suggestDay } from '../utils/planAddons';
import { savePlan } from '../services/authService';
import { useAppStore } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import type { Routine, RoutineDay } from '../data/routines';

export function FocusActions({ routine, day }: { routine: Routine; day: RoutineDay }) {
  useThemeMode();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const plan = useAppStore((s) => s.plan);
  const setPlan = useAppStore((s) => s.setPlan);
  const startCustom = useAppStore((s) => s.startCustom);
  const [busy, setBusy] = useState(false);

  // 여러 세션이 있는 루틴(코어 A · B)은 세션마다 따로 붙인다
  const rid = routine.days.length > 1 ? `${routine.id}/${day.id}` : routine.id;
  const name = routine.days.length > 1 ? day.name : routine.name;
  const src = useMemo(() => ({ rid, name: name.slice(0, 24), ids: day.exIds, attach: routine.attach ?? [] }), [rid, name, day.exIds, routine.attach]);
  const attached = attachedDay(plan, rid);
  const [pick, setPick] = useState<number>(() => (plan ? suggestDay(plan, src) : 0));

  async function save(next: NonNullable<typeof plan>, msg: string) {
    if (!user) return;
    setBusy(true);
    try {
      await savePlan(user.uid, next);
      setPlan(next);
      showAlert(msg);
    } catch {
      showAlert('오류', '플랜을 저장하지 못했어요. 연결을 확인해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  function attach() {
    if (!plan) return;
    const next = attachAddon(plan, pick, src);
    if (next === plan) {
      showAlert('붙일 종목이 없어요', `${plan.days[pick].name}에 이 종목들이 이미 들어 있어요.`);
      return;
    }
    void save(next, `${plan.days[pick].name} 끝에 ${eulReul(src.name)} 붙였어요.`);
  }

  function detach() {
    if (!plan || attached < 0) return;
    void save(detachAddon(plan, attached, rid), `${plan.days[attached].name}에서 뗐어요.`);
  }

  function now() {
    const ok = startCustom(src.name, day.exIds);
    if (!ok) {
      showAlert('진행 중인 운동이 있어요', '지금 하던 운동을 마치거나 끝낸 뒤에 시작해 주세요.');
      return;
    }
    router.navigate('/tabs/plan');
  }

  return (
    <View style={s.wrap}>
      {plan && attached >= 0 ? (
        <View style={s.attached}>
          <Ionicons name="checkmark-circle" size={18} color={colors.ink} />
          <Text style={s.attachedTxt}>{plan.days[attached].name} 끝에 붙어 있어요</Text>
          <PressableScale onPress={detach} disabled={busy} hitSlop={10} accessibilityRole="button" accessibilityLabel="떼기">
            <Text style={s.detach}>떼기</Text>
          </PressableScale>
        </View>
      ) : plan ? (
        <>
          <Text style={s.label}>어느 날 끝에 붙일까요?</Text>
          <View style={s.days}>
            {plan.days.map((d, i) => (
              <PressableScale key={d.id} style={[s.day, pick === i && s.dayOn]} onPress={() => setPick(i)}
                accessibilityRole="radio" accessibilityState={{ selected: pick === i }} accessibilityLabel={`${d.name}, ${d.focus}`}>
                <View style={[s.radio, pick === i && s.radioOn]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.dayName}>{d.name}</Text>
                  <Text style={s.dayFocus} numberOfLines={1}>{d.focus} · {d.ids.length}종목</Text>
                </View>
              </PressableScale>
            ))}
          </View>
          <PrimaryBtn label={`${plan.days[pick]?.name ?? ''}에 붙이기`} onPress={attach} loading={busy} />
          <Text style={s.hint}>플랜은 그대로예요. 그날 운동 끝에 이 {day.exIds.length}동작이 더해지고, 언제든 뗄 수 있어요.</Text>
        </>
      ) : null}
      <GhostBtn label="지금 한 번만 하기" onPress={now} style={{ marginTop: 10 }} />
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '700', color: colors.ink, marginBottom: 10 },
  days: { gap: 8, marginBottom: 14 },
  day: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.panel,
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.line,
  },
  dayOn: { borderColor: colors.ink },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.muted },
  radioOn: { borderColor: colors.ink, borderWidth: 5 },
  dayName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  dayFocus: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
  hint: { fontSize: 11.5, color: colors.muted, lineHeight: 17, marginTop: 10 },
  attached: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.panel2,
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.line2,
  },
  attachedTxt: { flex: 1, fontSize: 13.5, fontWeight: '700', color: colors.ink },
  detach: { fontSize: 13, fontWeight: '700', color: colors.mid },
}));
