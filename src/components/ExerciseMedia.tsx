import { useEffect, useState } from 'react';
import {
  View, Text, Image, StyleSheet, StyleProp, ViewStyle, ImageSourcePropType,
} from 'react-native';
import { useVideoPlayer, VideoView, VideoSource } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, partTint, themed, useThemeMode } from '../theme';
import { exById, PART_LABEL } from '../data/exercises';
import { videoSource, posterSource } from '../data/media';
import { useMediaEntry } from '../stores/mediaStore';

interface Props {
  exId: string;
  /** 루프 영상 자동 재생 — 상세·세션 화면에서만 사용한다 */
  autoPlay?: boolean;
  rounded?: number;
  style?: StyleProp<ViewStyle>;
  badge?: string;
  badgeColor?: string;
  showLabel?: boolean;
  dim?: number;
}

/**
 * 영상 → 썸네일 → 플레이스홀더 순으로 폴백.
 *
 * 중요: 비디오 플레이어를 만드는 것은 별도 컴포넌트로 분리했다.
 * hooks 는 조건부 호출이 불가능하므로, 목록/그리드(autoPlay=false)에서
 * 같은 컴포넌트를 쓰면 종목 수만큼 네이티브 플레이어가 생성된다.
 */
export default function ExerciseMedia(props: Props) {
  useThemeMode();
  const entry = useMediaEntry(props.exId);
  const poster = posterSource(props.exId, entry);
  const src = props.autoPlay && entry?.video ? videoSource(props.exId, entry.video) : null;

  // key: 종목이 바뀌면 플레이어를 새로 만든다. iOS 의 player.replace() 는
  // 메인 스레드에서 동기로 로드해 화면이 멈출 수 있다.
  return src ? (
    <VideoMedia key={`${props.exId}@${entry?.video}`} {...props} src={src} poster={poster} />
  ) : (
    <StaticMedia {...props} poster={poster} />
  );
}

function VideoMedia({
  src, poster, rounded = 16, style, badge, badgeColor, showLabel, dim = 0.35, exId,
}: Props & { src: VideoSource; poster: ImageSourcePropType | null }) {
  useThemeMode();
  const ex = exById(exId);
  // 첫 프레임이 그려질 때까지 썸네일로 덮어 둔다 — 영상을 받는 동안 검은 화면 방지.
  // 오프라인이라 영상을 못 받으면 썸네일이 그대로 남는다.
  const [ready, setReady] = useState(false);

  const player = useVideoPlayer(src, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  useEffect(() => {
    try {
      player.play();
    } catch {
      // 아직 준비되지 않았으면 다음 렌더에서 재시도
    }
  }, [player]);

  return (
    <View style={[s.wrap, { borderRadius: rounded }, style]}>
      <VideoView
        player={player}
        style={s.fill}
        contentFit="cover"
        nativeControls={false}
        onFirstFrameRender={() => setReady(true)}
      />
      {!ready && poster && <Image source={poster} style={s.fill} resizeMode="cover" />}
      {dim > 0 && <View style={[s.fill, { backgroundColor: `rgba(0,0,0,${dim})` }]} pointerEvents="none" />}
      <Overlay ex={ex} badge={badge} badgeColor={badgeColor} showLabel={showLabel} />
    </View>
  );
}

function StaticMedia({
  exId, poster, rounded = 16, style, badge, badgeColor, showLabel, dim = 0.35,
}: Props & { poster: ImageSourcePropType | null }) {
  useThemeMode();
  const ex = exById(exId);
  const imageSrc = poster;
  const tint = ex ? partTint[ex.part] ?? colors.panel3 : colors.panel3;

  return (
    <View style={[s.wrap, { borderRadius: rounded }, style]}>
      {imageSrc ? (
        <>
          <Image source={imageSrc} style={s.fill} resizeMode="cover" />
          {dim > 0 && <View style={[s.fill, { backgroundColor: `rgba(0,0,0,${dim})` }]} pointerEvents="none" />}
        </>
      ) : (
        <LinearGradient colors={[tint, colors.mediaPh]} style={s.fill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View style={s.phCenter}>
            <Text style={s.phTxt}>{ex ? PART_LABEL[ex.part] : '?'}</Text>
            <Text style={s.phSub}>미디어 준비중</Text>
          </View>
        </LinearGradient>
      )}
      <Overlay ex={ex} badge={badge} badgeColor={badgeColor} showLabel={showLabel} />
    </View>
  );
}

function Overlay({
  ex, badge, badgeColor, showLabel,
}: {
  ex: ReturnType<typeof exById>;
  badge?: string;
  badgeColor?: string;
  showLabel?: boolean;
}) {
  useThemeMode();
  return (
    <>
      {badge ? (
        <View style={s.badge}>
          <Text style={[s.badgeTxt, badgeColor ? { color: badgeColor } : null]}>{badge}</Text>
        </View>
      ) : null}
      {showLabel && ex ? (
        <View style={s.label} pointerEvents="none">
          <Text style={s.labelName} numberOfLines={1}>{ex.n}</Text>
          <Text style={s.labelPart}>{PART_LABEL[ex.part]} · {ex.g}</Text>
        </View>
      ) : null}
    </>
  );
}

const s = themed(() => StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: colors.panel2, position: 'relative' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  phCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  phTxt: { fontSize: 15, fontWeight: '800', color: colors.onMediaSub, letterSpacing: 1 },
  phSub: { fontSize: 11, color: colors.onMediaSub, marginTop: 4, letterSpacing: 0.5 },
  badge: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: colors.mediaBadge, borderRadius: 7,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 0.5, borderColor: colors.mediaBadgeLine,
  },
  badgeTxt: { fontSize: 10, fontWeight: '800', color: colors.onMedia, letterSpacing: 0.5 },
  label: { position: 'absolute', left: 12, right: 12, bottom: 12 },
  labelName: { fontSize: 15, fontWeight: '800', color: colors.onMedia },
  labelPart: { fontSize: 11, color: colors.onMediaSub, marginTop: 2 },
}));
