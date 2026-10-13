import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SectionList, LayoutAnimation } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, themed, useThemeMode } from '../../src/theme';
import { Screen, TopBar, EmptyState, useSafeBack } from '../../src/components/ui';
import { useAppStore } from '../../src/stores/appStore';
import { useAuthStore } from '../../src/stores/authStore';
import { exById, PART_LABEL } from '../../src/data/exercises';
import { WorkoutLog } from '../../src/types';
import {
  fmtDateKo, fmtDuration, fmtVolume, fmtSetDetail, totalSets, totalVolume,
} from '../../src/utils/stats';

export default function HistoryScreen() {
  const mode = useThemeMode();
  const router = useRouter();
  const goBack = useSafeBack();
  const logs = useAppStore((s) => s.logs);
  const stats = useAuthStore((s) => s.user?.stats);
  const [openId, setOpenId] = useState<string | null>(null);

  // 월별 그룹
  const sections = useMemo(() => {
    const map = new Map<string, WorkoutLog[]>();
    logs.forEach((l) => {
      const key = l.date.slice(0, 7); // YYYY-MM
      map.set(key, [...(map.get(key) ?? []), l]);
    });
    return [...map.entries()].map(([key, data]) => ({
      title: `${Number(key.slice(5, 7))}월`,
      key,
      data,
    }));
  }, [logs]);

  if (!logs.length) {
    return (
      <Screen>
        <TopBar title="운동 기록" onBack={goBack} />
        <EmptyState
          text={'아직 완료한 운동이 없습니다.\n첫 운동을 마치면 여기에 쌓입니다.'}
          cta="오늘 운동 시작하기"
          onCta={() => router.replace('/tabs/home')}
        />
      </Screen>
    );
  }

  const allSets = totalSets(logs);
  // 누적치는 서버 요약이 있으면 그쪽 — 앱은 최근 60건만 들고 있다
  const allLogs = Math.max(stats?.totalLogs ?? 0, logs.length);
  const allVolume = Math.max(stats?.totalVolume ?? 0, totalVolume(logs));

  return (
    <Screen>
      <TopBar
        title="운동 기록"
        onBack={goBack}
        right={
          <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/history/records')} hitSlop={8}>
            <Text style={s.prLink}>개인 기록 ›</Text>
          </TouchableOpacity>
        }
      />

      <View style={s.summaryRow}>
        <Summary value={`${allLogs}`} label="총 운동" />
        <Summary value={`${allSets}`} label="총 세트" />
        <Summary value={fmtVolume(allVolume)} label="누적 볼륨" />
      </View>

      <SectionList
        sections={sections}
        // 모드가 바뀌면 줄도 다시 그린다 (renderItem 안에서 색을 읽는다)
        extraData={`${mode}:${openId}`}
        keyExtractor={(l, i) => l.id ?? `${l.date}-${i}`}
        contentContainerStyle={s.listInner}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text style={s.monthLabel}>{section.title}</Text>
        )}
        renderItem={({ item }) => {
          const id = item.id ?? `${item.date}-${item.createdAt}`;
          const open = openId === id;
          const done = item.exercises.filter((x) => x.sets > 0);
          return (
            <TouchableOpacity
              style={[s.card, open && s.cardOpen]}
              activeOpacity={0.8}
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setOpenId(open ? null : id);
              }}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              accessibilityLabel={`${fmtDateKo(item.date)} ${item.dayName || '운동'} ${item.totalSets}세트`}
            >
              <View style={s.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={s.date}>
                    {fmtDateKo(item.date)}
                    {item.id?.startsWith('local-') ? <Text style={s.pendingTag}>  · 동기화 대기</Text> : null}
                  </Text>
                  <Text style={s.dayName}>{item.dayName || '운동'}</Text>
                </View>
                <View style={s.cardStats}>
                  <Text style={s.statMain}>{item.totalSets}세트</Text>
                  <Text style={s.statSub}>
                    {item.totalVolume > 0 ? fmtVolume(item.totalVolume) : '—'}
                    {item.durationSec > 0 ? ` · ${fmtDuration(item.durationSec)}` : ''}
                  </Text>
                </View>
                <Text style={[s.chev, open && s.chevOpen]}>›</Text>
              </View>

              {open && (
                <View style={s.detail}>
                  {done.length === 0 && <Text style={s.noDetail}>기록된 세트가 없습니다.</Text>}
                  {done.map((x, i) => {
                    const e = exById(x.id);
                    return (
                      <TouchableOpacity activeOpacity={0.7}
                        key={`${x.id}-${i}`}
                        style={s.exRow}
                        onPress={() => router.push(`/exercise/${x.id}`)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={s.exName}>{e?.n ?? x.id}</Text>
                          <Text style={s.exPart}>
                            {e ? PART_LABEL[e.part] : ''} · {x.sets}세트
                          </Text>
                        </View>
                        <Text style={s.exSets} numberOfLines={2}>
                          {x.detail?.length
                            ? x.detail.map(fmtSetDetail).join('  ')
                            : `${x.sets}세트`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />
    </Screen>
  );
}

function Summary({ value, label }: { value: string; label: string }) {
  useThemeMode();
  return (
    <View style={s.summary}>
      <Text style={s.summaryVal}>{value}</Text>
      <Text style={s.summaryLabel}>{label}</Text>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  pendingTag: { color: colors.muted, fontSize: 11, fontWeight: '400' },
  prLink: { fontSize: 12, color: colors.mid, fontWeight: '600' },
  summaryRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 6 },
  summary: {
    flex: 1, backgroundColor: colors.panel2, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.line2,
  },
  summaryVal: { fontSize: 17, fontWeight: '800', color: colors.ink },
  summaryLabel: { fontSize: 10, color: colors.muted, marginTop: 4 },

  listInner: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 10 },
  monthLabel: {
    fontSize: 10, fontWeight: '800', color: colors.muted,
    letterSpacing: 2, marginTop: 14, marginBottom: 10,
  },
  card: {
    backgroundColor: colors.panel, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: colors.line, marginBottom: 8,
  },
  cardOpen: { borderColor: colors.line2, backgroundColor: colors.panel2 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  date: { fontSize: 11, color: colors.muted },
  dayName: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 3 },
  cardStats: { alignItems: 'flex-end' },
  statMain: { fontSize: 14, fontWeight: '700', color: colors.ink },
  statSub: { fontSize: 10.5, color: colors.muted, marginTop: 3 },
  chev: { fontSize: 20, color: colors.muted, marginLeft: 2 },
  chevOpen: { color: colors.ink },

  detail: { marginTop: 14, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12, gap: 8 },
  noDetail: { fontSize: 12, color: colors.muted },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  exName: { fontSize: 13.5, fontWeight: '600', color: colors.ink },
  exPart: { fontSize: 10.5, color: colors.muted, marginTop: 2 },
  exSets: { fontSize: 11, color: colors.mid, textAlign: 'right', maxWidth: 140 },
}));
