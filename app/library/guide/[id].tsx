/**
 * 가이드 영상 보기 — 세로 영상 한 편을 화면 가득. 소리 켜고 재생, 기본 재생 막대.
 * 끝나면 '다음 가이드'로 넘어갈 수 있다. 영상은 R2(src/data/guides.ts guideVideoUrl).
 */
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Text } from '../../../src/components/Text';
import { useSafeBack } from '../../../src/components/ui';
import { PressableScale } from '../../../src/ui';
import { GUIDES, guideById, guideVideoUrl } from '../../../src/data/guides';

export default function GuidePlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const goBack = useSafeBack('/tabs/home');
  const guide = guideById(String(id));
  const url = guide ? guideVideoUrl(guide.id) : null;
  const idx = guide ? GUIDES.indexOf(guide) : -1;
  const next = idx >= 0 ? GUIDES[(idx + 1) % GUIDES.length] : null;

  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.play();
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  // 웹 브라우저는 소리 있는 자동 재생을 막는다 — 처음 한 번은 크게 누를 곳을 준다
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (!isPlaying) return;
    setStarted(true);
    setEnded(false); // 되감아 다시 보면 '다음 가이드' 카드를 걷는다
  }, [isPlaying]);
  const needTap = Platform.OS === 'web' && !!url && !started && status === 'readyToPlay';
  const [ended, setEnded] = useState(false);
  useEffect(() => {
    const sub = player.addListener('playToEnd', () => setEnded(true));
    return () => sub.remove();
  }, [player]);

  return (
    <View style={s.root}>
      {url ? (
        <VideoView player={player} style={s.fill} contentFit="contain" nativeControls allowsPictureInPicture={false} />
      ) : null}
      <SafeAreaView style={s.overlay} pointerEvents="box-none">
        <View style={s.top} pointerEvents="box-none">
          <PressableScale style={s.back} onPress={goBack} accessibilityRole="button" accessibilityLabel="뒤로">
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </PressableScale>
          <Text style={s.title} numberOfLines={1}>{guide?.title ?? '가이드'}</Text>
        </View>
        {!url || status === 'error' ? (
          <View style={s.center} pointerEvents="none">
            <Text style={s.msg}>{!guide ? '영상을 찾을 수 없어요.' : status === 'error' ? '영상을 불러오지 못했어요. 연결을 확인해 주세요.' : '영상을 준비하고 있어요.'}</Text>
          </View>
        ) : null}
        {needTap ? (
          <View style={s.center} pointerEvents="box-none">
            <PressableScale style={s.bigPlay} onPress={() => player.play()} accessibilityRole="button" accessibilityLabel="재생">
              <Ionicons name="play" size={34} color="#000000" style={{ marginLeft: 4 }} />
            </PressableScale>
          </View>
        ) : null}
        {ended && next && next.id !== guide?.id ? (
          <View style={s.bottom} pointerEvents="box-none">
            <PressableScale style={s.next} onPress={() => router.replace(`/library/guide/${next.id}`)}
              accessibilityRole="button" accessibilityLabel={`다음 가이드, ${next.title}`}>
              <Text style={s.nextK}>다음 가이드</Text>
              <Text style={s.nextT} numberOfLines={1}>{next.title} ›</Text>
            </PressableScale>
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

// 영상 화면은 테마와 상관없이 검정 바탕 · 흰 글자(영상 위에 얹는다)
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;
const s = StyleSheet.create({
  // 웹의 <video> 는 위치만으로는 늘어나지 않는다 — 크기를 직접 준다
  fill: { ...FILL, width: '100%', height: '100%' },
  root: { flex: 1, backgroundColor: '#000000' },
  overlay: FILL,
  top: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingTop: 4 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.35)' },
  title: { flex: 1, fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  center: { ...FILL, alignItems: 'center', justifyContent: 'center', padding: 32 },
  bigPlay: { width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  msg: { fontSize: 14, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 21 },
  bottom: { position: 'absolute', left: 16, right: 16, bottom: 96 },
  next: { backgroundColor: 'rgba(30,30,32,0.92)', borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16 },
  nextK: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  nextT: { fontSize: 16, color: '#FFFFFF', fontWeight: '800', marginTop: 2 },
});
