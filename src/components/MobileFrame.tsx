import { ReactNode } from 'react';
import { Platform, View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { colors, themed, useThemeMode } from '../theme';

/**
 * 프레임 안에서 쓸 가짜 세이프에리어. 웹은 env(safe-area-inset-*) 가 0 이라
 * 노치가 헤더를 덮었다 — 실제 기기와 같은 값을 넣어 준다.
 */
const FRAME_INSETS = { top: 44, bottom: 24, left: 0, right: 0 };

const FRAME_W = 412;
const FRAME_H = 892;
/** 이 폭 미만이면 프레임 없이 꽉 채운다 (실제 모바일 브라우저) */
const BREAKPOINT = 700;

/**
 * 웹에서 데스크톱 폭으로 열었을 때 화면이 옆으로 늘어나지 않도록
 * 실제 기기 비율의 프레임 안에 앱을 넣는다. 네이티브에서는 그대로 통과.
 */
export default function MobileFrame({ children }: { children: ReactNode }) {
  useThemeMode();
  const { width, height } = useWindowDimensions();

  if (Platform.OS !== 'web' || width < BREAKPOINT) {
    return <>{children}</>;
  }

  const frameH = Math.min(FRAME_H, height - 48);

  return (
    <View style={s.page}>
      <View style={s.side}>
        <Text style={s.brand}>MILITARYTRACKER</Text>
        <Text style={s.tagline}>
          검증된 자세 가이드 위에서{'\n'}기록하는 트레이닝 앱
        </Text>
        <Text style={s.note}>
          앱 출시 전 미리보기입니다.{'\n'}
          실제 기기에서는 화면 전체로 표시됩니다.
        </Text>
      </View>

      <View style={[s.frame, { width: FRAME_W, height: frameH }]}>
        <View style={s.notch} />
        <SafeAreaInsetsContext.Provider value={FRAME_INSETS}>
          <View style={s.screen}>{children}</View>
        </SafeAreaInsetsContext.Provider>
        <View style={s.homeBar} />
      </View>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  page: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 56,
    backgroundColor: colors.bgDeep,
    padding: 24,
  },
  side: { maxWidth: 320 },
  brand: { fontSize: 15, fontWeight: '800', color: colors.ink, letterSpacing: 3 },
  tagline: { fontSize: 22, color: colors.ink, lineHeight: 33, marginTop: 18, fontWeight: '700' },
  note: { fontSize: 12.5, color: colors.muted, lineHeight: 20, marginTop: 20 },
  frame: {
    backgroundColor: colors.bg,
    borderRadius: 44,
    borderWidth: 6,
    borderColor: colors.frame,
    overflow: 'hidden',
    position: 'relative',
    // 웹 전용 그림자
    boxShadow: `0 30px 80px ${colors.shadow}`,
  } as never,
  notch: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    width: 108,
    height: 24,
    borderRadius: 14,
    // 기기 노치 — 모드와 상관없이 검정
    backgroundColor: '#050506',
    zIndex: 100,
  },
  homeBar: {
    position: 'absolute', bottom: 8, alignSelf: 'center',
    width: 120, height: 4, borderRadius: 2, backgroundColor: colors.line2, zIndex: 100,
  },
  screen: { flex: 1, overflow: 'hidden' },
}));
