import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, themed, useThemeMode } from '../../src/theme';
import { Screen, TopBar, Body, SectionLabel, useSafeBack } from '../../src/components/ui';
import { ROUTINES, recommendRoutine, routineExCount } from '../../src/data/routines';
import { useAppStore } from '../../src/stores/appStore';
import { useEntitlement } from '../../src/hooks/useEntitlement';
import { ProBadge } from '../../src/components/ProLock';

export default function RoutineListScreen() {
  useThemeMode();
  const router = useRouter();
  const goBack = useSafeBack();
  const { profile, plan } = useAppStore();

  // 추천은 구독 기능 — 구독 전에는 배지를 걸지 않는다
  const { can } = useEntitlement();
  const canReco = can('routine_reco');
  const recommendedId = canReco && profile
    ? recommendRoutine({ place: profile.env, days: profile.days, level: profile.level }).id
    : null;

  return (
    <Screen>
      <TopBar title="루틴" meta="ROUTINE LIBRARY" onBack={goBack} />
      <Body>
        <Text style={s.lead}>
          분할 방식을 고르면 데이별 종목까지 바로 확인할 수 있습니다.
        </Text>

        {!canReco && (
          <TouchableOpacity activeOpacity={0.7} style={s.recoLock} onPress={() => router.push('/subscribe?f=routine_reco')}>
            <Text style={s.recoLockTxt}>내 조건에 맞는 루틴 추천받기</Text>
            <ProBadge />
          </TouchableOpacity>
        )}

        <SectionLabel>전체 루틴 {ROUTINES.length}개</SectionLabel>
        {ROUTINES.map((r) => {
          const isCurrent = plan?.routineId === r.id;
          return (
            <TouchableOpacity
              key={r.id}
              style={[s.card, isCurrent && s.cardCurrent]}
              activeOpacity={0.75}
              onPress={() => router.push(`/routine/${r.id}`)}
            >
              <View style={s.head}>
                <View style={s.shortBox}>
                  <Text style={s.short}>{r.short}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={s.nameRow}>
                    <Text style={s.name}>{r.name}</Text>
                    {isCurrent && <View style={s.badge}><Text style={s.badgeTxt}>사용중</Text></View>}
                    {!isCurrent && r.id === recommendedId && (
                      <View style={s.badgeGhost}><Text style={s.badgeGhostTxt}>추천</Text></View>
                    )}
                  </View>
                  <Text style={s.sub}>{r.subtitle}</Text>
                </View>
                <Text style={s.chev}>›</Text>
              </View>

              <Text style={s.desc} numberOfLines={2}>{r.desc}</Text>

              <View style={s.tagRow}>
                {r.tags.map((t) => (
                  <View key={t} style={s.tag}><Text style={s.tagTxt}>{t}</Text></View>
                ))}
                <View style={s.tag}><Text style={s.tagTxt}>{routineExCount(r)}종목</Text></View>
              </View>
            </TouchableOpacity>
          );
        })}
      </Body>
    </Screen>
  );
}

const s = themed(() => StyleSheet.create({
  lead: { fontSize: 13, color: colors.muted, lineHeight: 20, marginTop: 4 },
  recoLock: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    backgroundColor: colors.panel2, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: colors.line2, marginTop: 14,
  },
  recoLockTxt: { fontSize: 13, fontWeight: '600', color: colors.mid, flexShrink: 1 },
  card: {
    backgroundColor: colors.panel, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: colors.line, marginBottom: 10,
  },
  cardCurrent: { borderColor: colors.line2, backgroundColor: colors.panel2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shortBox: {
    width: 52, height: 52, borderRadius: 14, backgroundColor: colors.panel3,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line2,
  },
  short: { fontSize: 11, fontWeight: '800', color: colors.mid, letterSpacing: 0.3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 16, fontWeight: '700', color: colors.ink },
  sub: { fontSize: 11.5, color: colors.muted, marginTop: 3 },
  chev: { fontSize: 22, color: colors.muted, marginLeft: 4 },
  badge: { backgroundColor: colors.ink, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeTxt: { fontSize: 10, fontWeight: '800', color: colors.bg },
  badgeGhost: { backgroundColor: colors.panel3, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeGhostTxt: { fontSize: 10, fontWeight: '800', color: colors.mid },
  desc: { fontSize: 12.5, color: colors.mid, lineHeight: 19, marginTop: 12 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  tag: { backgroundColor: colors.panel3, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 },
  tagTxt: { fontSize: 10, color: colors.muted, fontWeight: '600' },
}));
