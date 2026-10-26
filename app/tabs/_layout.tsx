import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, themed, useThemeMode } from '../../src/theme';
import { useAppStore } from '../../src/stores/appStore';
import SessionPlayer from '../../src/components/SessionPlayer';
import SessionSummary from '../../src/components/SessionSummary';
import { useEffect } from 'react';
import { scheduleComeback } from '../../src/services/reminders';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, focused }: { name: IoniconName; focused: boolean }) {
  useThemeMode();
  return (
    <View style={[ic.wrap, focused && ic.wrapActive]}>
      <Ionicons name={name} size={22} color={focused ? colors.ink : colors.muted} />
    </View>
  );
}

const ic = themed(() => StyleSheet.create({
  wrap: { width: 44, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  // panel2 는 bg 대비 1.12:1 라 있으나 마나였다 — 채움 아이콘 + ink 색이 실제 활성 표시고, 배경은 조금 더 띄운다
  wrapActive: { backgroundColor: colors.panel3 },
}));

export default function TabLayout() {
  useThemeMode();
  // 세션·요약 오버레이는 탭 위에 올린다.
  // 개별 탭 화면에 두면 해당 탭을 떠나는 순간 진행 중인 운동이 사라진다.
  const session = useAppStore((s) => s.session);
  const summary = useAppStore((s) => s.summary);
  const overlay = !!session || !!summary;
  // 마지막 운동이 바뀔 때마다 "다시 시작" 알림을 다시 예약 (첫 운동을 마친 뒤 권한을 묻는다)
  const lastAt = useAppStore((s) => s.logs[0]?.createdAt ?? null);
  useEffect(() => {
    if (lastAt) void scheduleComeback(lastAt, true);
  }, [lastAt]);
  const insets = useSafeAreaInsets();
  // height/paddingBottom 을 고정하면 react-navigation 의 inset 계산을 덮어써 홈 인디케이터 위에 라벨이 앉는다
  const bottomPad = Math.max(insets.bottom, 10);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          // 운동 중에는 탭 전환으로 세션을 벗어나지 않도록 탭바를 숨긴다
          tabBarStyle: overlay
            ? { display: 'none' }
            : {
                backgroundColor: colors.bg,
                borderTopColor: colors.line,
                borderTopWidth: 0.5,
                height: 58 + bottomPad,
                paddingTop: 6,
                paddingBottom: bottomPad,
              },
          tabBarActiveTintColor: colors.ink,
          tabBarInactiveTintColor: colors.muted,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2 },
          tabBarAllowFontScaling: false,
          tabBarShowLabel: true,
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: '홈',
            tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'home' : 'home-outline'} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="plan"
          options={{
            title: '운동',
            tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'barbell' : 'barbell-outline'} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="form"
          options={{
            title: '자세',
            tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'body' : 'body-outline'} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="diet"
          options={{
            title: '식단',
            tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'nutrition' : 'nutrition-outline'} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="my"
          options={{
            title: 'MY',
            tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'person' : 'person-outline'} focused={focused} />,
          }}
        />
      </Tabs>

      {session && <SessionPlayer />}
      <SessionSummary />
    </View>
  );
}
