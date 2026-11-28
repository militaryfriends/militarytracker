/**
 * 가이드 카드 — 오늘 탭 '오늘의 가이드' · 부위별 운동 정리 상세. 게시한 VO 운동 꿀팁 릴스 한 편(src/data/guides.ts).
 * 표지(9:16)를 왼쪽에 작게, 오른쪽에 제목 · 한 줄 · 길이. 누르면 영상 화면.
 */
import { Image, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { colors, themed, useThemeMode } from '../theme';
import { PressableScale, PRESS_SCALE } from '../ui';
import { secLabel, type Guide } from '../data/guides';

/** kicker: 머리글 — 없으면 '영상 · 길이'. 오늘 운동에 맞춰 골랐으면 '하체 날 추천 · 길이' */
export function GuideCard({ guide, onPress, kicker }: { guide: Guide; onPress: () => void; kicker?: string }) {
  useThemeMode();
  return (
    <PressableScale scaleTo={PRESS_SCALE.card} style={s.card} onPress={onPress} accessibilityRole="button"
      accessibilityLabel={`${guide.title}, ${secLabel(guide.sec)} 영상`}>
      <View style={s.poster}>
        <Image source={guide.poster} style={s.posterImg} resizeMode="cover" accessibilityIgnoresInvertColors />
      </View>
      <View style={s.info}>
        <Text style={s.kicker}>{kicker ?? `영상 · ${secLabel(guide.sec)}`}</Text>
        <Text style={s.title} numberOfLines={2}>{guide.title}</Text>
        {guide.hook ? <Text style={s.hook} numberOfLines={2}>{guide.hook}</Text> : null}
        <View style={{ flex: 1 }} />
        <View style={s.playRow}>
          <View style={s.play}>
            <Ionicons name="play" size={14} color={colors.bg} style={{ marginLeft: 2 }} />
          </View>
          <Text style={s.playTxt}>영상 보기</Text>
        </View>
      </View>
    </PressableScale>
  );
}

const s = themed(() => StyleSheet.create({
  card: {
    flexDirection: 'row', gap: 14, backgroundColor: colors.panel, borderRadius: 22, padding: 12,
    borderWidth: 1, borderColor: colors.line, marginBottom: 12,
  },
  poster: { width: 104, height: 185, borderRadius: 14, backgroundColor: colors.panel2, overflow: 'hidden' },
  posterImg: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  info: { flex: 1, paddingVertical: 4 },
  kicker: { fontSize: 12, fontWeight: '600', color: colors.muted },
  title: { fontSize: 18, fontWeight: '800', color: colors.ink, lineHeight: 24, marginTop: 6 },
  hook: { fontSize: 13, color: colors.mid, lineHeight: 19, marginTop: 6 },
  playRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  play: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  playTxt: { fontSize: 13, fontWeight: '700', color: colors.ink },
}));
