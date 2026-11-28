import { useEffect } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Text } from './Text';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, themed, useThemeMode } from '../theme';
import { CountUpText, DURATION, EASE, FONT, PressableScale, celebrate } from '../ui';
import { useAppStore } from '../stores/appStore';
import { exForLog, PART_LABEL } from '../data/exercises';
import { fmtVolume, fmtSetDetail } from '../utils/stats';
import { useScreenSize } from '../ui/screenSize';

/** 큰 숫자 칸용 — '35분 12초'는 칸 폭을 넘어 두 줄로 꺾인다. 1분 넘으면 분만 */
const fmtStatTime = (sec: number): string => (sec >= 60 ? `${Math.round(sec / 60)}분` : `${sec}초`);

/** 운동 완료 직후 오버레이 — 그날의 결과와 기록 갱신을 보여준다 */
export default function SessionSummary() {
  const summary = useAppStore((st) => st.summary);
  // 내용은 요약이 생길 때 새로 올라온다(등장 모션 · 숫자 올라오기 · 폭죽이 그때 한 번)
  return summary ? <SummaryBody /> : null;
}

function SummaryBody() {
  useThemeMode();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: winW } = useScreenSize();
  const { summary, setSummary } = useAppStore();
  // 등장: 바탕이 먼저 덮이고, 내용이 아래에서 살짝 올라온다. 저장됐으면 제목 근처에서 폭죽(+ success 진동)
  const bg = useSharedValue(0);
  const rise = useSharedValue(0);
  useEffect(() => {
    bg.value = withTiming(1, { duration: DURATION.fast });
    rise.value = withDelay(80, withTiming(1, { duration: DURATION.slow, easing: EASE.out }));
    const t = setTimeout(() => { if (summary?.saved) celebrate({ x: winW / 2, y: insets.top + 110 }); }, 260);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const bgAnim = useAnimatedStyle(() => ({ opacity: bg.value }));
  const riseAnim = useAnimatedStyle(() => ({ opacity: rise.value, transform: [{ translateY: (1 - rise.value) * 28 }] }));

  if (!summary) return null;

  const done = summary.exercises.filter((x) => x.sets > 0);
  const skipped = summary.exercises.length - done.length;

  return (
    <Animated.View style={[s.root, { paddingTop: insets.top + 24 }, bgAnim]}>
      <Animated.View style={[{ flex: 1 }, riseAnim]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.topRow}>
          <Text style={s.eyebrow}>{new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })} · 운동 완료</Text>
          <PressableScale hitSlop={12} onPress={() => setSummary(null)} accessibilityRole="button" accessibilityLabel="닫고 오늘 화면으로">
            <Text style={s.close}>닫기</Text>
          </PressableScale>
        </View>
        <Text style={s.title}>{summary.dayName} 끝.</Text>

        {!summary.saved && (
          <View style={s.warn}>
            <Text style={s.warnTxt}>
              서버 저장에 실패해 기기에만 기록했습니다. 연결되면 다시 시도해주세요.
            </Text>
          </View>
        )}

        <View style={s.statRow}>
          <Stat value={summary.totalSets} format={String} unit="세트" />
          <Stat value={summary.totalVolume} format={fmtVolume} unit="총 볼륨" />
          <Stat value={summary.durationSec} format={fmtStatTime} unit="소요 시간" />
        </View>

        {summary.prIds.length > 0 && (
          <View style={s.prBox}>
            <Text style={s.prTitle}>개인 최고 기록 {summary.prIds.length}건</Text>
            {summary.prIds.map((id) => {
              const ex = summary.exercises.find((x) => x.id === id);
              return (
                <Text key={id} style={s.prLine}>
                  {exForLog(id)?.n ?? id}
                  {ex?.best ? <Text style={s.prVal}>  {fmtSetDetail(ex.best)}</Text> : null}
                </Text>
              );
            })}
          </View>
        )}

        <Text style={s.section}>종목별 기록</Text>
        {done.map((x, i) => {
          const e = exForLog(x.id);
          const isPr = summary.prIds.includes(x.id);
          return (
            <View key={`${x.id}-${i}`} style={s.exRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.exName}>
                  {e?.n ?? x.id}
                  {isPr ? <Text style={s.prTag}>  최고</Text> : null}
                </Text>
                <Text style={s.exMeta}>
                  {e ? PART_LABEL[e.part] : ''} · {x.sets}세트
                  {x.volume > 0 ? ` · 볼륨 ${fmtVolume(x.volume)}` : ''}
                </Text>
              </View>
              <Text style={s.exSets} numberOfLines={2}>
                {(x.detail ?? []).map(fmtSetDetail).join('  ')}
              </Text>
            </View>
          );
        })}

        {skipped > 0 && (
          <Text style={s.skipped}>건너뛴 종목 {skipped}개</Text>
        )}
      </ScrollView>

      <View style={[s.foot, { paddingBottom: insets.bottom + 20 }]}>
        <PressableScale
          style={s.ghost}
          onPress={() => {
            setSummary(null);
            router.push(summary.prIds.length ? '/history/records' : '/history');
          }}
        >
          <Text style={s.ghostTxt}>{summary.prIds.length ? '개인 기록 보기' : '기록 전체 보기'}</Text>
        </PressableScale>
        <PressableScale style={s.primary} accessibilityRole="button"
          onPress={() => {
            setSummary(null);
            router.push('/tabs/diet');
          }}
        >
          <Text style={s.primaryTxt}>운동 후 식단 보기</Text>
        </PressableScale>
      </View>
      </Animated.View>
    </Animated.View>
  );
}

function Stat({ value, format, unit }: { value: number; format: (v: number) => string; unit: string }) {
  useThemeMode();
  return (
    <View style={s.stat}>
      <CountUpText value={value} format={format} style={s.statVal} />
      <Text style={s.statUnit}>{unit}</Text>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  root: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.bg, zIndex: 50,
  },
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },
  eyebrow: { fontSize: 12, fontWeight: '600', color: colors.muted },
  title: { fontSize: 42, fontWeight: '800', color: colors.ink, letterSpacing: -1.6, lineHeight: 48, marginTop: 4 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  close: { fontSize: 14, fontWeight: '600', color: colors.mid },

  warn: {
    backgroundColor: colors.wrongBg, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: colors.wrongLine, marginTop: 16,
  },
  warnTxt: { fontSize: 12.5, color: colors.ink, lineHeight: 19 },

  statRow: { flexDirection: 'row', gap: 8, marginTop: 22 },
  stat: {
    flex: 1, backgroundColor: colors.panel2, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.line2,
  },
  statVal: { fontFamily: FONT.num, fontSize: 34, lineHeight: 36, color: colors.ink },
  statUnit: { fontSize: 10, color: colors.muted, marginTop: 5 },

  prBox: {
    backgroundColor: colors.panel2, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.ink, marginTop: 12,
  },
  prTitle: { fontSize: 12.5, fontWeight: '800', color: colors.ink, marginBottom: 8, letterSpacing: 0.3 },
  prLine: { fontSize: 14, color: colors.ink, lineHeight: 23 },
  prVal: { color: colors.ink, fontWeight: '800' },

  section: {
    fontSize: 10, fontWeight: '800', color: colors.muted,
    letterSpacing: 2, marginTop: 26, marginBottom: 12,
  },
  exRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.panel, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.line, marginBottom: 8,
  },
  exName: { fontSize: 14.5, fontWeight: '600', color: colors.ink },
  prTag: { fontSize: 10, fontWeight: '800', color: colors.mid },
  exMeta: { fontSize: 11, color: colors.muted, marginTop: 3 },
  exSets: { fontSize: 11.5, color: colors.mid, textAlign: 'right', maxWidth: 130 },
  skipped: { fontSize: 12, color: colors.muted, marginTop: 6, textAlign: 'center' },

  foot: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: colors.line,
  },
  ghost: {
    flex: 1, borderWidth: 1, borderColor: colors.line2, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
  },
  ghostTxt: { color: colors.mid, fontSize: 14, fontWeight: '600' },
  primary: {
    flex: 1, backgroundColor: colors.red, borderRadius: 26,
    paddingVertical: 15, alignItems: 'center',
  },
  primaryTxt: { color: colors.onRed, fontSize: 15, fontWeight: '700' },
}));
