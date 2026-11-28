/**
 * 가이드 영상 전체 — 오늘 탭 '오늘의 가이드 › 전체 보기'. 게시한 VO 운동 꿀팁 릴스(src/data/guides.ts).
 */
import { Image, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '../../src/components/Text';
import { colors, themed, useThemeMode } from '../../src/theme';
import { Screen, TopBar, Body, EmptyState, useSafeBack } from '../../src/components/ui';
import { PressableScale, PRESS_SCALE } from '../../src/ui';
import { GUIDES, secLabel } from '../../src/data/guides';

export default function GuidesScreen() {
  useThemeMode();
  const router = useRouter();
  const goBack = useSafeBack();
  return (
    <Screen>
      <TopBar title="가이드 영상" meta={`${GUIDES.length}편`} onBack={goBack} />
      <Body>
        {GUIDES.length === 0 ? <EmptyState text="영상을 준비하고 있어요." /> : null}
        <View style={s.grid}>
          {GUIDES.map((g) => (
            <PressableScale key={g.id} scaleTo={PRESS_SCALE.card} style={s.cell}
              onPress={() => router.push(`/library/guide/${g.id}`)} accessibilityRole="button"
              accessibilityLabel={`${g.title}, ${secLabel(g.sec)} 영상`}>
              <View style={s.poster}>
                <Image source={g.poster} style={s.posterImg} resizeMode="cover" accessibilityIgnoresInvertColors />
              </View>
              <Text style={s.title} numberOfLines={2}>{g.title}</Text>
              <Text style={s.meta}>{secLabel(g.sec)}</Text>
            </PressableScale>
          ))}
        </View>
      </Body>
    </Screen>
  );
}

const s = themed(() => StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 24 },
  cell: { width: '48.5%' },
  // 그림을 칸 안에 가둔다(웹에서 Image 가 원본 크기로 그려지던 문제)
  poster: { aspectRatio: 9 / 16, borderRadius: 16, backgroundColor: colors.panel2, marginBottom: 8, overflow: 'hidden' },
  posterImg: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  title: { fontSize: 13.5, fontWeight: '700', color: colors.ink, lineHeight: 19 },
  meta: { fontSize: 11.5, color: colors.muted, marginTop: 2, marginBottom: 6 },
}));
