/**
 * 아바타 한 장.
 *  · 3D 모델이 있으면(웹 · 남성, avatar3d/) 엔진 좌표 그대로의 3D 몸 — coord 를 주면 칸 중심이 아니라 그 좌표.
 *    live 면 손으로 돌리는 뷰어(좌표가 바뀌면 몸이 서서히 변한다), 아니면 정지 이미지.
 *  · 3D 가 없으면 칸(F?M?)의 프리셋 이미지(src/data/avatarGrid.ts), 없으면 회색 실루엣.
 *
 * 배지: 지금(입력·측정 기반) · 예상(엔진 계산 — 항상 붙인다) · 목표(O2 에서 고른 칸).
 * 칸이 바뀌면 이전 칸 → 새 칸 0.6초 크로스페이드(같은 카메라라 자연스럽다, 명세 4-4).
 * 블러 · 가림 처리는 하지 않는다 — 결제 전에도 전부 선명하게.
 */
import { memo, useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { AVATARS } from '../../data/avatarGrid';
import { parseCell, type Coord, type Sex } from '../../utils/bodyComp';
import { colors, themed, useThemeMode } from '../../theme';
import { Silhouette } from './Silhouette';
import { Avatar3DLive, Avatar3DStill, has3D } from './avatar3d/Avatar3D';
import { cellCoord } from './avatar3d/morph';

export type AvatarBadge = '지금' | '예상' | '목표' | '시작';

const FADE_MS = 600;

/** 칸 한 장 — 2D (프리셋 이미지 또는 실루엣) */
const Flat = memo(function Flat({ sex, cell, width, height }: { sex: Sex; cell: string; width: number; height: number }) {
  const src = AVATARS[sex][cell];
  if (src) return <Image source={src} style={{ width, height }} resizeMode="contain" accessibilityIgnoresInvertColors />;
  const { f, m } = parseCell(cell);
  return <Silhouette sex={sex} f={f} m={m} width={width} height={height} />;
});

/** 한 장 (배지 없음) — 3D 가 되면 3D, 아니면 2D */
const Still = memo(function Still({ sex, cell, coord, width, height }: { sex: Sex; cell: string; coord?: Coord; width: number; height: number }) {
  const flat = <Flat sex={sex} cell={cell} width={width} height={height} />;
  if (!has3D(sex)) return flat;
  return <Avatar3DStill sex={sex} coord={coord ?? cellCoord(cell)} width={width} height={height} fallback={flat} />;
});

export function AvatarView({
  sex, cell, coord, width, badge, style, fadeFrom, label, live = false, yawGroup, morphMs, intro,
}: {
  sex: Sex;
  cell: string;
  /** 엔진 연속 좌표 — 3D 일 때 칸 중심 대신 이 몸을 그린다 */
  coord?: Coord;
  /** 3D 뷰어(손으로 돌리기 · 좌표가 바뀌면 몸이 변함). 3D 가 없으면 보통 아바타 */
  live?: boolean;
  yawGroup?: string;
  morphMs?: number;
  intro?: boolean;
  /** 높이는 2:3 으로 따라간다 */
  width: number;
  badge?: AvatarBadge;
  style?: StyleProp<ViewStyle>;
  /** 주면 이 칸에서 cell 로 크로스페이드하며 나타난다 (O8 카드 선택) */
  fadeFrom?: string | null;
  /** 읽어 주기용 — 예: "예상 몸, 74.1kg 체지방 13%" */
  label?: string;
}) {
  useThemeMode();
  const height = Math.round(width * 1.5);
  // 작은 아바타는 배지가 머리를 가린다 — 아래에 글자로
  const small = width < 70;
  // 칸이 바뀌면 직전 칸을 아래에 깔고 새 칸을 서서히 올린다
  const [under, setUnder] = useState<string | null>(fadeFrom ?? null);
  const shown = useRef(cell);
  const p = useSharedValue(fadeFrom && fadeFrom !== cell ? 0 : 1);

  useEffect(() => {
    const from = fadeFrom ?? (shown.current !== cell ? shown.current : null);
    shown.current = cell;
    if (!from || from === cell) {
      setUnder(null);
      p.value = 1;
      return;
    }
    setUnder(from);
    p.value = 0;
    p.value = withTiming(1, { duration: FADE_MS, easing: Easing.inOut(Easing.quad) });
    const t = setTimeout(() => setUnder(null), FADE_MS + 50);
    return () => clearTimeout(t);
  }, [cell, fadeFrom, p]);

  const top = useAnimatedStyle(() => ({ opacity: p.value }));
  const is3dLive = live && has3D(sex);
  // 앱(GL)은 한 장에서 몸이 변한다 — 크로스페이드로 GL 뷰를 두 개 띄우지 않는다
  const native3d = !is3dLive && Platform.OS !== 'web' && has3D(sex);

  return (
    <View
      style={[{ width, height: small && badge ? height + 16 : height }, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label ?? `${badge ?? ''} 아바타`.trim()}
    >
      {is3dLive ? (
        <View style={[s.layer, { width, height }]}>
          <Avatar3DLive sex={sex} coord={coord ?? cellCoord(cell)} width={width} height={height}
            morphMs={morphMs} yawGroup={yawGroup} intro={intro}
            fallback={<Flat sex={sex} cell={cell} width={width} height={height} />} />
        </View>
      ) : native3d ? (
        <View style={[s.layer, { width, height }]}>
          <Avatar3DStill sex={sex} coord={coord ?? cellCoord(cell)} from={fadeFrom && fadeFrom !== cell ? cellCoord(fadeFrom) : undefined}
            width={width} height={height} fallback={<Flat sex={sex} cell={cell} width={width} height={height} />} />
        </View>
      ) : (
        <>
          {under ? (
            <View style={[s.layer, { width, height }]}>
              <Still sex={sex} cell={under} width={width} height={height} />
            </View>
          ) : null}
          <Animated.View style={[s.layer, { width, height }, top]}>
            <Still sex={sex} cell={cell} coord={coord} width={width} height={height} />
          </Animated.View>
        </>
      )}
      {badge && small ? (
        <Text style={[s.caption, { top: height + 2 }, badge === '예상' && s.badgeEstTxt]} maxFontSizeMultiplier={1.2}>{badge}</Text>
      ) : badge ? (
        <View style={[s.badge, badge === '예상' && s.badgeEst]}>
          <Text style={[s.badgeTxt, badge === '예상' && s.badgeEstTxt]} maxFontSizeMultiplier={1.3}>{badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  layer: { position: 'absolute', left: 0, top: 0 },
  caption: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 10, fontWeight: '800', color: colors.muted },
  badge: {
    position: 'absolute', top: 0, left: 0,
    backgroundColor: colors.panel3, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 1, borderColor: colors.line2,
  },
  badgeTxt: { fontSize: 10.5, fontWeight: '800', color: colors.mid, letterSpacing: 0.3 },
  badgeEst: { backgroundColor: colors.inkSoft, borderColor: colors.inkLine },
  badgeEstTxt: { color: colors.ink },
}));
