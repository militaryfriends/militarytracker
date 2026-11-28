import { View, StyleSheet } from 'react-native';
import { Text } from '../../src/components/Text';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, themed, useThemeMode } from '../../src/theme';
import { Screen, TopBar, Body, SectionLabel, EmptyState, GhostBtn, useSafeBack } from '../../src/components/ui';
import ExerciseMedia from '../../src/components/ExerciseMedia';
import { FEED, feedById, uniqueCovers } from '../../src/data/feed';
import { GUIDES } from '../../src/data/guides';
import { GuideCard } from '../../src/components/GuideCard';

const COVERS = uniqueCovers(FEED);
import { exByIds, PART_LABEL } from '../../src/data/exercises';
import { PressableScale, PRESS_SCALE } from '../../src/ui';

export default function LibraryDetailScreen() {
  useThemeMode();
  const { feedId } = useLocalSearchParams<{ feedId: string }>();
  const router = useRouter();
  const goBack = useSafeBack();
  const item = feedById(String(feedId));

  if (!item) {
    return (
      <Screen>
        <TopBar title="라이브러리" onBack={goBack} />
        <EmptyState text="콘텐츠를 찾을 수 없습니다." />
      </Screen>
    );
  }

  const list = exByIds(item.exIds);
  // 같은 부위 가이드 영상(최대 2편) — 읽고 끝나는 화면이 되지 않게(11/28)
  const parts = item.part.split(/[·\s]+/).filter(Boolean);
  const videos = GUIDES.filter((g) => g.tags.some((t) => parts.includes(t))).slice(0, 2);

  return (
    <Screen>
      <TopBar title={item.n} meta={`${item.exIds.length}종목`} onBack={goBack} />
      <Body style={{ paddingHorizontal: 0 }}>
        <View style={s.hero}>
          <ExerciseMedia exId={COVERS[item.id] ?? item.exIds[0]} rounded={0} dim={0} style={s.heroImg} />
          <View style={s.heroDim} />
          <View style={s.heroMeta}>
            <Text style={s.heroPart}>{item.part}</Text>
            <Text style={s.heroTitle}>{item.n}</Text>
          </View>
        </View>

        <View style={s.pad}>
          <Text style={s.summary}>{item.summary}</Text>

          {item.sections.map((sec, i) => (
            <View key={i} style={s.section}>
              <Text style={s.sectionH}>{sec.h}</Text>
              <Text style={s.sectionBody}>{sec.body}</Text>
            </View>
          ))}

          {list.length > 0 && (
            <>
              <SectionLabel>연관 종목 {list.length}개</SectionLabel>
              {list.map((e) => (
                <PressableScale scaleTo={PRESS_SCALE.card}
                  key={e.id}
                  style={s.exRow}
                  onPress={() => router.push(`/exercise/${e.id}`)}
                >
                  <ExerciseMedia exId={e.id} rounded={10} style={s.exThumb} dim={0.3} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.exName}>{e.n}</Text>
                    <Text style={s.exMeta}>{PART_LABEL[e.part]} · {e.g}</Text>
                  </View>
                  <Text style={s.chev}>›</Text>
                </PressableScale>
              ))}
            </>
          )}

          {videos.length > 0 && (
            <>
              <SectionLabel>영상으로 보기</SectionLabel>
              {videos.map((g) => (
                <GuideCard key={g.id} guide={g} onPress={() => router.push(`/library/guide/${g.id}`)} />
              ))}
            </>
          )}
          <GhostBtn label="운동 탭에서 오늘 운동 보기" onPress={() => router.navigate('/tabs/plan')} style={{ marginTop: 8, marginBottom: 24 }} />
        </View>
      </Body>
    </Screen>
  );
}

const s = themed(() => StyleSheet.create({
  hero: { width: '100%', aspectRatio: 1.4, position: 'relative', backgroundColor: colors.panel2 },
  heroImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  heroDim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.42)' },
  heroMeta: { position: 'absolute', left: 16, right: 16, bottom: 16 },
  heroPart: { fontSize: 10.5, color: colors.onMediaSub, fontWeight: '700', letterSpacing: 1 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: colors.onMedia, marginTop: 4 },
  pad: { paddingHorizontal: 16, paddingTop: 18 },
  summary: { fontSize: 14, color: colors.mid, lineHeight: 22 },
  section: {
    backgroundColor: colors.panel, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.line, marginTop: 12,
  },
  sectionH: { fontSize: 14, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  sectionBody: { fontSize: 13, color: colors.muted, lineHeight: 21 },
  exRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.panel, borderRadius: 14, padding: 10,
    borderWidth: 1, borderColor: colors.line, marginBottom: 8,
  },
  exThumb: { width: 48, height: 48 },
  exName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  exMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  chev: { fontSize: 20, color: colors.muted },
}));
