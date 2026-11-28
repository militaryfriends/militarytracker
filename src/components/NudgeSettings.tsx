/**
 * 결석 알림 설정 — 내 몸 › 설정. 세기(끔 · 순한맛 · 매운맛)와 운동 시간을 고르고, 어떤 말이 오는지 미리 본다.
 * 문구 · 단계는 utils/nudge.ts, 예약은 services/reminders.ts. 알림은 앱(iOS · Android)에서만 울린다.
 */
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { Text } from './Text';
import { colors, themed, useThemeMode } from '../theme';
import { PressableScale, Segmented } from '../ui';
import { canNudge, scheduleSubNotices, setNudgePrefs, useNudgePrefs } from '../services/reminders';
import { useEntitlement } from '../hooks/useEntitlement';
import { webSwitch } from '../ui/webSwitch';
import {
  NUDGE_HOURS, NUDGE_HOUR_LABEL, NUDGE_LEVEL_LABEL, nudgePlan, type NudgeHour, type NudgeLevel,
} from '../utils/nudge';

const LEVELS: readonly { value: NudgeLevel; label: string }[] = (['off', 'mild', 'hot'] as const)
  .map((v) => ({ value: v, label: NUDGE_LEVEL_LABEL[v] }));
const HOURS: readonly { value: string; label: string }[] = NUDGE_HOURS
  .map((h) => ({ value: String(h), label: NUDGE_HOUR_LABEL[h] }));

export function NudgeSettings() {
  useThemeMode();
  const prefs = useNudgePrefs();
  const [open, setOpen] = useState(false);
  const plan = nudgePlan(prefs.level);
  const { sub } = useEntitlement();
  const toggleSub = (on: boolean) => {
    setNudgePrefs({ sub: on });
    // 직접 켰을 때만 알림 권한을 묻는다
    if (on) void scheduleSubNotices(sub, true);
  };

  return (
    <View style={s.card}>
      <Text style={s.title}>결석 알림</Text>
      <Text style={s.sub}>
        운동을 3일 넘게 쉬면 정해 둔 시간에 불러요. 쉴수록 말이 세지고, 14일째가 마지막이에요.
      </Text>
      <Segmented<NudgeLevel> label="알림 세기" options={LEVELS} value={prefs.level}
        onChange={(level) => setNudgePrefs({ level })} />

      {prefs.level !== 'off' ? (
        <>
          <Text style={s.label}>운동하기로 한 시간</Text>
          <Segmented<string> label="운동하기로 한 시간" options={HOURS} value={String(prefs.hour)}
            onChange={(h) => setNudgePrefs({ hour: Number(h) as NudgeHour })} />

          <PressableScale style={s.more} onPress={() => setOpen((v) => !v)} accessibilityRole="button"
            accessibilityState={{ expanded: open }}>
            <Text style={s.moreTxt}>{open ? '미리 보기 접기' : '어떤 알림이 오는지 미리 보기 ›'}</Text>
          </PressableScale>
          {open ? (
            <View style={s.list}>
              {plan.map((n) => (
                <View key={n.days} style={s.row}>
                  <Text style={s.day}>{n.days}일째</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle}>{n.title}</Text>
                    <Text style={s.rowBody}>{n.body}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <Text style={s.hint}>꺼 두면 쉬어도 부르지 않아요.</Text>
      )}
      <View style={s.subRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>구독 알림</Text>
          <Text style={s.subHint}>무료 체험은 해지 마감 이틀 전과 마감 직전에, 해지한 구독은 끝나기 사흘 전과 하루 전에 알려 드려요.</Text>
        </View>
        <Switch value={prefs.sub} onValueChange={toggleSub} accessibilityLabel="구독 알림"
          trackColor={{ false: colors.panel3, true: colors.ink }}
          thumbColor={prefs.sub ? colors.bg : '#FFFFFF'}
          {...webSwitch(colors.bg)}
          ios_backgroundColor={colors.panel3} />
      </View>
      {!canNudge() ? <Text style={s.hint}>알림은 앱에서만 울려요. 여기서는 설정과 미리 보기만 됩니다.</Text> : null}
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  card: {
    backgroundColor: colors.panel, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.line,
  },
  title: { fontSize: 14, fontWeight: '700', color: colors.ink },
  sub: { fontSize: 11.5, color: colors.muted, lineHeight: 17, marginTop: 4, marginBottom: 12 },
  label: { fontSize: 12, color: colors.muted, fontWeight: '600', marginTop: 14, marginBottom: 8 },
  hint: { fontSize: 11.5, color: colors.muted, marginTop: 10, lineHeight: 17 },
  subRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: colors.line,
  },
  subHint: { fontSize: 11.5, color: colors.muted, lineHeight: 17, marginTop: 4 },
  more: { minHeight: 44, justifyContent: 'center', marginTop: 6 },
  moreTxt: { fontSize: 12.5, color: colors.mid, fontWeight: '700' },
  list: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 2 },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  day: { width: 44, fontSize: 12, fontWeight: '800', color: colors.mid, marginTop: 1 },
  rowTitle: { fontSize: 13.5, fontWeight: '800', color: colors.ink },
  rowBody: { fontSize: 12.5, color: colors.mid, lineHeight: 19, marginTop: 3 },
}));
