/**
 * 부위별 운동 정리(옛 라이브러리) — 운동 탭 아래. '가이드'는 영상(오늘의 가이드)에만 쓴다(2026-11-28 오늘 탭에서 옮김. 오늘 탭에는 '오늘의 가이드' 한 편만 둔다).
 *  · 꼬리표는 모두 '{연관 종목 수}종목'으로 맞춘다(예전: 1편 · 5동작 · 부위별 · 비교가 섞여 있었다).
 *  · 표지는 카드끼리 같은 그림이 겹치지 않게 고른다(feed.ts uniqueCovers).
 */
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from './Text';
import { colors, themed, useThemeMode } from '../theme';
import { PressableScale, PRESS_SCALE } from '../ui';
import ExerciseMedia from './ExerciseMedia';
import { FEED, uniqueCovers } from '../data/feed';

const COVERS = uniqueCovers(FEED);

export function LibrarySection() {
  useThemeMode();
  const router = useRouter();
  return (
    <View style={s.wrap}>
      <View style={s.secRow}>
        <Text style={s.secTitle}>부위별 운동 정리</Text>
        <Text style={s.secMeta}>{FEED.length}개</Text>
      </View>
      <View style={s.grid}>
        {FEED.map((f) => (
          <PressableScale scaleTo={PRESS_SCALE.card} key={f.id} style={s.gridCard}
            onPress={() => router.push(`/library/${f.id}`)} accessibilityRole="button"
            accessibilityLabel={`${f.n}, ${f.part}, ${f.exIds.length}종목`}>
            <View style={s.gridThumb}>
              <ExerciseMedia exId={COVERS[f.id]} rounded={0} dim={0} style={s.gridThumbImg} />
              <View style={s.gridThumbOverlay} />
              <View style={s.gridBadge}>
                <Text style={s.gridBadgeTxt}>{f.exIds.length}종목</Text>
              </View>
            </View>
            <Text style={s.gridName} numberOfLines={2}>{f.n}</Text>
            <Text style={s.gridPart}>{f.part}</Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  wrap: { marginTop: 28 },
  secRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 },
  secTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  secMeta: { fontSize: 11, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridCard: { width: '47.5%' },
  gridThumb: {
    aspectRatio: 1, borderRadius: 16, backgroundColor: colors.panel2,
    marginBottom: 8, overflow: 'hidden', justifyContent: 'flex-end', padding: 10,
  },
  gridThumbImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  gridThumbOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.mediaDim },
  gridBadge: {
    alignSelf: 'flex-start', backgroundColor: colors.mediaBadge,
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 0.5, borderColor: colors.mediaBadgeLine,
  },
  gridBadgeTxt: { fontSize: 10, color: colors.onMediaSub, fontWeight: '600' },
  gridName: { fontSize: 12.5, fontWeight: '600', color: colors.ink, lineHeight: 17, marginBottom: 3 },
  gridPart: { fontSize: 11, color: colors.muted },
}));
