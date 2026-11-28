import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { colors, useThemeMode } from '../../src/theme';
import { FloatingTabBar } from '../../src/components/TabBar';
import { useKeyboardOpen } from '../../src/hooks/useKeyboardInset';
import { useAppStore } from '../../src/stores/appStore';
import SessionPlayer from '../../src/components/SessionPlayer';
import SessionSummary from '../../src/components/SessionSummary';
import { useEffect } from 'react';
import { scheduleComeback, scheduleSubNotices, useNudgePrefs } from '../../src/services/reminders';
import { useEntitlement } from '../../src/hooks/useEntitlement';
import { nextDayIdx } from '../../src/utils/stats';

export default function TabLayout() {
  useThemeMode();
  // 세션·요약 오버레이는 탭 위에 올린다.
  // 개별 탭 화면에 두면 해당 탭을 떠나는 순간 진행 중인 운동이 사라진다.
  const session = useAppStore((s) => s.session);
  const summary = useAppStore((s) => s.summary);
  const overlay = !!session || !!summary;
  // 마지막 운동이 바뀔 때마다 "다시 시작" 알림을 다시 예약 (첫 운동을 마친 뒤 권한을 묻는다)
  const lastAt = useAppStore((s) => s.logs[0]?.createdAt ?? null);
  // 세기 · 시간을 바꿔도 다시 예약한다. 첫 알림에는 다음에 할 운동 이름을 넣는다
  const nudge = useNudgePrefs();
  const nextName = useAppStore((s) => (s.plan ? s.plan.days[nextDayIdx(s.logs, s.plan)]?.name : undefined));
  useEffect(() => {
    if (lastAt) void scheduleComeback(lastAt, true, nextName);
  }, [lastAt, nudge.level, nudge.hour, nextName]);
  // 무료 체험 · 해지 예약이 끝나기 전 알림 — 구독 상태나 설정이 바뀌면 다시 예약한다
  const { sub } = useEntitlement();
  useEffect(() => {
    void scheduleSubNotices(sub);
  }, [sub.status, sub.expiresAt, sub.source, nudge.sub]); // eslint-disable-line react-hooks/exhaustive-deps
  const kbOpen = useKeyboardOpen();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* 탭은 화면 위에 떠 있다(src/components/TabBar.tsx) — 운동 중 · 키보드가 떴을 때는 숨긴다.
          form(종목과 자세)은 탭에 없고 운동 탭에서 들어간다. */}
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <FloatingTabBar {...props} hidden={overlay || kbOpen} />}
      >
        <Tabs.Screen name="home" options={{ title: '오늘' }} />
        <Tabs.Screen name="plan" options={{ title: '운동' }} />
        <Tabs.Screen name="coach" options={{ title: '코치' }} />
        <Tabs.Screen name="diet" options={{ title: '식단' }} />
        <Tabs.Screen name="my" options={{ title: '내 몸' }} />
        <Tabs.Screen name="form" options={{ title: '종목과 자세' }} />
      </Tabs>

      {session && <SessionPlayer />}
      <SessionSummary />
    </View>
  );
}
