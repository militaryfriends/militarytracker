/**
 * 부위 집중 루틴 동작 — 루틴 상세 아래(2026-11-28 대표 결정).
 *  · ○○데이에 붙이기: 플랜의 요일 수 · 순서는 그대로, 고른 요일 운동 끝에 이 묶음이 더해진다. 맞는 요일을 먼저 골라 둔다.
 *    그날 이미 있거나 같은 동작 · 내 기구로 못 하는 종목 · 허리 부하 두 번째 종목은 빼고 붙인다(utils/planAddons · addonFilter).
 *  · 지금 한 번만 하기: 플랜을 건드리지 않고 이 종목들로 바로 운동한다(기록은 남고, 다음 차례 순서에는 영향 없음).
 *  · nowFirst(따로 하루를 잡는 편)면 '지금 한 번만 하기'가 주 버튼.
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
import { eulReul, iGa } from '../utils/josa';
import { attachAddon, attachedDay, detachAddon, suggestDay } from '../utils/planAddons';
import { addonSkip } from '../utils/addonFilter';
import { savePlan } from '../services/authService';
import { useAppStore } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import { addonSource, type Routine, type RoutineDay } from '../data/routines';

/** 붙인 뒤 그날 종목이 이보다 많으면 한 번 묻는다 */
const MANY = 10;

export function FocusActions({ routine, day }: { routine: Routine; day: RoutineDay }) {
  useThemeMode();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const plan = useAppStore((s) => s.plan);
  const profile = useAppStore((s) => s.profile);
  const session = useAppStore((s) => s.session);
  const setPlan = useAppStore((s) => s.setPlan);
  const startCustom = useAppStore((s) => s.startCustom);
  const [busy, setBusy] = useState(false);

  // 여러 세션이 있는 루틴(코어 A · B)은 세션마다 따로 붙인다
  const rid = routine.days.length > 1 ? `${routine.id}/${day.id}` : routine.id;
  const src = useMemo(() => addonSource(rid) ?? { rid, name: routine.name.slice(0, 24), ids: day.exIds, attach: routine.attach ?? [] }, [rid, routine, day.exIds]);
  const skip = useMemo(() => addonSkip(profile), [profile]);
  const attached = attachedDay(plan, rid);
  const [pickRaw, setPick] = useState<number>(() => (plan ? suggestDay(plan, src) : 0));
  // 플랜이 바뀌어 요일 수가 줄어도 깨지지 않게
  const pick = plan ? Math.min(pickRaw, plan.days.length - 1) : 0;

  function busyGuard(): boolean {
    if (session) {
      showAlert('진행 중인 운동이 있어요', '지금 하던 운동을 마치거나 끝낸 뒤에 바꿔 주세요.');
      return true;
    }
    return false;
  }

  async function save(next: NonNullable<typeof plan>, title: string, msg?: string) {
    if (!user) return;
    setBusy(true);
    try {
      await savePlan(user.uid, next);
      setPlan(next);
      showAlert(title, msg);
    } catch {
      showAlert('오류', '플랜을 저장하지 못했어요. 연결을 확인해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  function attach() {
    if (!plan || busyGuard()) return;
    const target = plan.days[pick];
    const next = attachAddon(plan, pick, src, skip);
    if (next === plan) {
      showAlert('붙일 종목이 없어요', `${target.name}에 같은 동작이 이미 있거나, 지금 장소 · 기구로 할 수 없는 종목이에요.`);
      return;
    }
    const added = next.days[pick].addons?.find((a) => a.rid === rid)?.ids.length ?? 0;
    const left = src.ids.length - added;
    const total = next.days[pick].ids.length;
    const title = `${target.name} 끝에 ${eulReul(src.name)} 붙였어요`;
    const msg = `${added}동작이 더해져 그날은 ${total}종목이에요.${left > 0 ? ` 이미 있거나 비슷한 동작 · 지금 기구로 못 하는 동작 ${left}개는 뺐어요.` : ''}`;
    if (total > MANY) {
      showAlert(`${iGa(target.name)} ${total}종목이 돼요`, '그날 운동이 꽤 길어져요. 그래도 붙일까요?', [
        { text: '취소', style: 'cancel' },
        { text: '붙이기', onPress: () => { void save(next, title, msg); } },
      ]);
      return;
    }
    void save(next, title, msg);
  }

  function detach() {
    if (!plan || attached < 0 || busyGuard()) return;
    void save(detachAddon(plan, attached, rid), `${plan.days[attached].name}에서 뗐어요`);
  }

  function now() {
    const ok = startCustom(src.name, day.exIds);
    if (!ok) {
      showAlert('진행 중인 운동이 있어요', '지금 하던 운동을 마치거나 끝낸 뒤에 시작해 주세요.');
      return;
    }
    router.navigate('/tabs/plan');
  }

  const nowFirst = !!routine.nowFirst;
  const nowHint = '플랜은 그대로 두고 이 동작들로 바로 운동해요. 기록은 남고, 다음 차례 순서는 바뀌지 않아요.';

  return (
    <View style={s.wrap}>
      {nowFirst ? (
        <>
          <PrimaryBtn label="지금 한 번만 하기" onPress={now} />
          <Text style={s.hint}>{nowHint}</Text>
        </>
      ) : null}

      {plan && attached >= 0 ? (
        <View style={[s.attached, nowFirst && { marginTop: 16 }]}>
          <Ionicons name="checkmark-circle" size={18} color={colors.ink} />
          <Text style={s.attachedTxt}>{plan.days[attached].name} 끝에 붙어 있어요</Text>
          <PressableScale onPress={detach} disabled={busy} hitSlop={10} accessibilityRole="button" accessibilityLabel="떼기">
            <Text style={s.detach}>떼기</Text>
          </PressableScale>
        </View>
      ) : plan ? (
        <View style={nowFirst ? { marginTop: 20 } : undefined}>
          <Text style={s.label}>{nowFirst ? '아니면 운동하는 날 끝에 붙이기' : '어느 날 운동 끝에 붙일까요?'}</Text>
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
          {nowFirst ? (
            <GhostBtn label={`${plan.days[pick]?.name ?? ''}에 붙이기`} onPress={attach} loading={busy} />
          ) : (
            <PrimaryBtn label={`${plan.days[pick]?.name ?? ''}에 붙이기`} onPress={attach} loading={busy} />
          )}
          <Text style={s.hint}>요일 수와 순서는 그대로예요. 그날 운동 끝에 더해지고, 운동 탭에서 언제든 뗄 수 있어요.</Text>
        </View>
      ) : (
        <Text style={s.hint}>플랜이 생기면 운동하는 날에 붙일 수도 있어요.</Text>
      )}

      {!nowFirst ? (
        <>
          <GhostBtn label="지금 한 번만 하기" onPress={now} style={{ marginTop: 14 }} />
          <Text style={s.hint}>{nowHint}</Text>
        </>
      ) : null}
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 24 },
  label: { fontSize: 13.5, fontWeight: '700', color: colors.ink, marginBottom: 10 },
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
  hint: { fontSize: 11.5, color: colors.muted, lineHeight: 17, marginTop: 8 },
  attached: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.panel2,
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.line2,
  },
  attachedTxt: { flex: 1, fontSize: 13.5, fontWeight: '700', color: colors.ink },
  detach: { fontSize: 13, fontWeight: '700', color: colors.mid },
}));
