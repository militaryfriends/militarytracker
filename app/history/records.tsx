import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, themed, useThemeMode } from '../../src/theme';
import { Screen, TopBar, EmptyState, useSafeBack } from '../../src/components/ui';
import { useAppStore } from '../../src/stores/appStore';
import { useAuthStore } from '../../src/stores/authStore';
import { EX, Part, PART_LABEL, PART_ORDER } from '../../src/data/exercises';
import { personalBest, e1rm, setScore, fmtDateKo, fmtSetDetail } from '../../src/utils/stats';
import { WorkoutLog, SetDetail, UserStats } from '../../src/types';

interface RecordRow {
  id: string;
  name: string;
  part: Part;
  best: SetDetail;
  est1rm: number;
  date: string;
}

/** 이 기록을 세운 날짜를 역추적 — 최근 로그 밖의 기록은 서버 요약(stats.pr)의 날짜 */
function dateOfBest(logs: WorkoutLog[], exId: string, best: SetDetail, stats?: UserStats): string {
  for (const l of logs) {
    const hit = l.exercises.find((x) => x.id === exId);
    if (hit?.best && hit.best.w === best.w && hit.best.r === best.r) return l.date;
  }
  const stored = stats?.pr?.[exId];
  if (stored && stored.w === best.w && stored.r === best.r) return stored.date;
  return logs.find((l) => l.exercises.some((x) => x.id === exId))?.date ?? '';
}

export default function RecordsScreen() {
  const mode = useThemeMode();
  const router = useRouter();
  const goBack = useSafeBack();
  const logs = useAppStore((s) => s.logs);
  const stats = useAuthStore((s) => s.user?.stats);
  const [part, setPart] = useState<Part | '전체'>('전체');

  const rows = useMemo<RecordRow[]>(() => {
    // 최근 로그 + 서버 요약(stats.pr) 양쪽에 있는 종목 — 오래된 PR 도 빠지지 않는다
    const done = new Set([
      ...logs.flatMap((l) => l.exercises.map((x) => x.id)),
      ...Object.keys(stats?.pr ?? {}),
    ]);
    return EX.filter((e) => done.has(e.id))
      .map((e) => {
        const best = personalBest(logs, e.id, stats);
        if (!best) return null;
        return {
          id: e.id,
          name: e.n,
          part: e.part,
          best,
          est1rm: Math.round(e1rm(best.w, best.r)),
          date: dateOfBest(logs, e.id, best, stats),
        };
      })
      .filter((r): r is RecordRow => r !== null)
      // 무게 종목은 추정 1RM, 맨몸·시간 종목은 반복/초 — 무게 종목이 위로
      .sort((a, b) => (b.best.w > 0 ? 1 : 0) - (a.best.w > 0 ? 1 : 0) || setScore(b.best) - setScore(a.best));
  }, [logs, stats]);

  const filtered = part === '전체' ? rows : rows.filter((r) => r.part === part);
  const parts = PART_ORDER.filter((p) => rows.some((r) => r.part === p));

  if (!rows.length) {
    return (
      <Screen>
        <TopBar title="개인 기록" onBack={goBack} />
        <EmptyState
          text={'아직 기록이 없습니다.\n무게와 횟수를 입력해 운동을 완료하면\n종목별 최고 기록이 쌓입니다.'}
          cta="오늘 운동 시작하기"
          onCta={() => router.replace('/tabs/home')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar title="개인 기록" meta={`${rows.length}종목`} onBack={goBack} />

      <View style={s.pillWrap}>
        {(['전체' as const, ...parts]).map((item) => (
          <TouchableOpacity activeOpacity={0.7}
            key={String(item)}
            style={[s.pill, part === item && s.pillOn]}
            onPress={() => setPart(item)}
          >
            <Text style={[s.pillTxt, part === item && s.pillTxtOn]}>
              {item === '전체' ? '전체' : PART_LABEL[item]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        // 모드가 바뀌면 줄도 다시 그린다 (renderItem 안에서 색을 읽는다)
        extraData={mode}
        keyExtractor={(r) => r.id}
        contentContainerStyle={s.listInner}
        showsVerticalScrollIndicator={false}
        initialNumToRender={14}
        ListHeaderComponent={
          <Text style={s.lead}>
            추정 1RM(Epley 공식) 순으로 정렬했습니다. 실제 1회 최대 중량과는 차이가 있을 수 있습니다.
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={s.row}
            activeOpacity={0.75}
            onPress={() => router.push(`/exercise/${item.id}`)}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{item.name}</Text>
              <Text style={s.meta}>
                {PART_LABEL[item.part]}
                {item.date ? ` · ${fmtDateKo(item.date)}` : ''}
              </Text>
            </View>
            <View style={s.right}>
              <Text style={s.best}>{item.best.w > 0 ? `${item.best.w}kg × ${item.best.r}` : fmtSetDetail(item.best)}</Text>
              <Text style={s.est}>{item.best.w > 0 ? `추정 1RM ${item.est1rm}kg` : '맨몸 · 최고 기록'}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </Screen>
  );
}

const s = themed(() => StyleSheet.create({
  // 칩은 가로 스크롤 대신 줄바꿈으로 전부 노출한다.
  // 스크롤바를 전역 CSS 로 숨겨 둔 웹에서는 더 넘어가는지 알 방법이 없고,
  // ScrollView 기본값(flexShrink:1) 탓에 아래 리스트에 눌려 잘리기도 했다
  pillWrap: {
    flexDirection: 'row', flexWrap: 'wrap', flexShrink: 0,
    paddingHorizontal: 16, paddingBottom: 12, gap: 8,
  },
  pill: {
    backgroundColor: colors.panel2, borderRadius: 20,
    paddingHorizontal: 15, paddingVertical: 8, minHeight: 40, justifyContent: 'center',
    borderWidth: 1, borderColor: colors.line,
  },
  pillOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  pillTxt: { fontSize: 12.5, fontWeight: '600', color: colors.muted },
  pillTxtOn: { color: colors.bg },

  listInner: { paddingHorizontal: 16, paddingBottom: 40 },
  lead: { fontSize: 11.5, color: colors.muted, lineHeight: 18, marginBottom: 14 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.panel, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.line, marginBottom: 8,
  },
  name: { fontSize: 14.5, fontWeight: '600', color: colors.ink },
  meta: { fontSize: 11, color: colors.muted, marginTop: 3 },
  right: { alignItems: 'flex-end' },
  best: { fontSize: 15, fontWeight: '800', color: colors.ink },
  est: { fontSize: 10.5, color: colors.mid, marginTop: 3 },
}));
