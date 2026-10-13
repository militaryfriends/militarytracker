import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, themed, useThemeMode } from '../theme';
import { useAppStore } from '../stores/appStore';
import { exById, PART_LABEL } from '../data/exercises';
import { fmtDuration, fmtVolume, fmtSetDetail } from '../utils/stats';

/** 운동 완료 직후 오버레이 — 그날의 결과와 기록 갱신을 보여준다 */
export default function SessionSummary() {
  useThemeMode();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { summary, setSummary } = useAppStore();

  if (!summary) return null;

  const done = summary.exercises.filter((x) => x.sets > 0);
  const skipped = summary.exercises.length - done.length;

  return (
    <View style={[s.root, { paddingTop: insets.top + 24 }]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.eyebrow}>운동 완료</Text>
        <Text style={s.title}>{summary.dayName}</Text>

        {!summary.saved && (
          <View style={s.warn}>
            <Text style={s.warnTxt}>
              서버 저장에 실패해 기기에만 기록했습니다. 연결되면 다시 시도해주세요.
            </Text>
          </View>
        )}

        <View style={s.statRow}>
          <Stat value={`${summary.totalSets}`} unit="세트" />
          <Stat value={fmtVolume(summary.totalVolume)} unit="총 볼륨" />
          <Stat value={fmtDuration(summary.durationSec)} unit="소요 시간" />
        </View>

        {summary.prIds.length > 0 && (
          <View style={s.prBox}>
            <Text style={s.prTitle}>개인 기록 갱신 {summary.prIds.length}건</Text>
            {summary.prIds.map((id) => {
              const ex = summary.exercises.find((x) => x.id === id);
              return (
                <Text key={id} style={s.prLine}>
                  {exById(id)?.n ?? id}
                  {ex?.best ? <Text style={s.prVal}>  {fmtSetDetail(ex.best)}</Text> : null}
                </Text>
              );
            })}
          </View>
        )}

        <Text style={s.section}>종목별 기록</Text>
        {done.map((x, i) => {
          const e = exById(x.id);
          const isPr = summary.prIds.includes(x.id);
          return (
            <View key={`${x.id}-${i}`} style={s.exRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.exName}>
                  {e?.n ?? x.id}
                  {isPr ? <Text style={s.prTag}>  PR</Text> : null}
                </Text>
                <Text style={s.exMeta}>
                  {e ? PART_LABEL[e.part] : ''} · {x.sets}세트
                  {x.volume > 0 ? ` · ${fmtVolume(x.volume)}` : ''}
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
        <TouchableOpacity activeOpacity={0.7}
          style={s.ghost}
          onPress={() => {
            setSummary(null);
            router.push(summary.prIds.length ? '/history/records' : '/history');
          }}
        >
          <Text style={s.ghostTxt}>{summary.prIds.length ? '개인 기록 보기' : '기록 전체 보기'}</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.7} style={s.primary} onPress={() => setSummary(null)}>
          <Text style={s.primaryTxt}>확인</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Stat({ value, unit }: { value: string; unit: string }) {
  useThemeMode();
  return (
    <View style={s.stat}>
      <Text style={s.statVal}>{value}</Text>
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
  eyebrow: { fontSize: 10.5, fontWeight: '800', color: colors.muted, letterSpacing: 2 },
  title: { fontSize: 30, fontWeight: '800', color: colors.ink, marginTop: 8, letterSpacing: -0.6 },

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
  statVal: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  statUnit: { fontSize: 10, color: colors.muted, marginTop: 5 },

  prBox: {
    backgroundColor: colors.goodBg, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.goodLine, marginTop: 12,
  },
  prTitle: { fontSize: 12.5, fontWeight: '800', color: colors.good, marginBottom: 8, letterSpacing: 0.3 },
  prLine: { fontSize: 14, color: colors.ink, lineHeight: 23 },
  prVal: { color: colors.good, fontWeight: '700' },

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
  prTag: { fontSize: 10, fontWeight: '800', color: colors.good },
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
    flex: 1, backgroundColor: colors.ink, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
  },
  primaryTxt: { color: colors.bg, fontSize: 15, fontWeight: '700' },
}));
