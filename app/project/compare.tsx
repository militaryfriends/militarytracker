/**
 * O7 결과 — "계산이 끝났어요" · 지금 내 몸(대표 피드백 10/31 1절 12단계).
 * 지금 몸 하나를 크게(손으로 돌리는 3D) 보여 주고, 숫자 4칸 + 추천 프로젝트 한 줄 → 목표 몸 4가지(/project).
 * 목표 몸 비교는 다음 화면 카드 4장이 맡는다(여기서 목표 몸을 하나로 못 박지 않는다).
 */
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, themed, useThemeMode } from '../../src/theme';
import { PressableScale } from '../../src/ui';
import { useAppStore } from '../../src/stores/appStore';
import { useOnboardDraft } from '../../src/stores/onboardDraft';
import { AvatarView } from '../../src/components/body/AvatarView';
import { has3D } from '../../src/components/body/avatar3d/Avatar3D';
import { AccuracyMeter } from '../../src/components/onboard/StepBody';
import { kg, muscleOf, pct0 } from '../../src/components/body/format';
import { EmptyState } from '../../src/components/ui';
import { analyzeBody } from '../../src/utils/bodyAnalysis';

export default function CompareScreen() {
  useThemeMode();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { redo } = useLocalSearchParams<{ redo?: string }>();
  const { width, height } = useWindowDimensions();
  const a = useAppStore((st) => st.analysis);
  // 카드 4장은 저장된 입력으로 다시 계산(엔진 결정론적) — 옛 분석 문서에도 같은 추천이 나온다
  const rec = useMemo(() => {
    if (!a) return null;
    const cards = analyzeBody(a.input).projects;
    return cards.find((c) => c.recommended) ?? cards[0];
  }, [a]);

  if (!a || !rec) {
    return (
      <SafeAreaView style={s.root}>
        <EmptyState text="계산 결과가 없어요." cta="내 몸 계산하기" onCta={() => router.replace('/project/new')} />
      </SafeAreaView>
    );
  }

  const sex = a.input.sex;
  // 화면 높이의 절반 정도 — 작은 폰에서도 숫자 칸과 버튼이 한 화면에 들어오게
  const avW = Math.round(Math.min(280, Math.min(width, 480) * 0.66, (height - 420) / 1.5));
  const fromInbody = a.comp.src === 'inbody';
  const leanKg = a.input.weightKg * (1 - a.comp.bfPct / 100);

  // 허리둘레를 넣으러 O3 로 — 입력 흐름이 스택에 있으면 그리로 돌아가고, 없으면 새로 연다
  const addWaist = () => {
    useOnboardDraft.getState().patch({ resume: 'body' });
    if (useOnboardDraft.getState().seeded && router.canGoBack()) router.back();
    else router.replace(!redo ? '/onboard' : useOnboardDraft.getState().restart ? '/project/new?restart=1' : '/project/new');
  };

  const stats: [string, string][] = [
    ['체중', `${kg(a.input.weightKg)}kg`],
    [fromInbody ? '체지방률 (인바디)' : '체지방률 (추정)', `${pct0(a.comp.bfPct)}%`],
    ['제지방량', `${kg(leanKg)}kg`],
    ['근육', muscleOf(a.cell)],
  ];

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={s.inner} showsVerticalScrollIndicator={false}>
        <Text style={s.title} accessibilityRole="header">계산이 끝났어요</Text>
        <Text style={s.sub}>지금 내 몸이에요</Text>

        <Animated.View entering={FadeInDown.duration(320)} style={s.hero}>
          <AvatarView sex={sex} cell={a.cell} coord={a.coord} width={Math.max(150, avW)} badge="지금" live intro
            label={`지금 내 몸, ${kg(a.input.weightKg)}kg, 체지방 ${pct0(a.comp.bfPct)}%`} />
          {has3D(sex) ? <Text style={s.spin}>좌우로 밀어 돌려 보세요</Text> : null}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(320)} style={s.grid}>
          {stats.map(([k, v]) => (
            <View key={k} style={s.cell}>
              <Text style={s.cellK}>{k}</Text>
              <Text style={s.cellV}>{v}</Text>
            </View>
          ))}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(220).duration(320)} style={s.rec}>
          <Text style={s.recLabel}>추천 프로젝트</Text>
          <Text style={s.recName}>{rec.name} · {rec.months}개월</Text>
          <Text style={s.recHow}>{rec.how}</Text>
          <Text style={s.recSub}>다음 화면에서 목표 몸 4가지를 비교하고 고를 수 있어요.</Text>
        </Animated.View>

        <View style={s.accRow}>
          <AccuracyMeter accuracy={a.comp.accuracy} compact />
          {a.comp.accuracy === 'basic' ? (
            <TouchableOpacity onPress={addWaist} hitSlop={8} accessibilityRole="button">
              <Text style={s.link}>허리둘레를 넣으면 더 정확해져요</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>

      <View style={[s.foot, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <PressableScale style={s.cta} onPress={() => router.push(redo ? '/project?redo=1' : '/project')} accessibilityLabel="목표 몸 4가지 보기">
          <Text style={s.ctaTxt}>목표 몸 4가지 보기</Text>
        </PressableScale>
      </View>
    </SafeAreaView>
  );
}

const s = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  inner: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24 },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  sub: { fontSize: 14, color: colors.muted, marginTop: 6 },
  hero: { alignItems: 'center', marginTop: 18 },
  spin: { fontSize: 11.5, color: colors.muted, textAlign: 'center', marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  cell: {
    flexBasis: '48%', flexGrow: 1, backgroundColor: colors.panel, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14,
    borderWidth: 1, borderColor: colors.line,
  },
  cellK: { fontSize: 11.5, color: colors.muted, fontWeight: '700' },
  cellV: { fontSize: 18, color: colors.ink, fontWeight: '800', marginTop: 4 },
  rec: { marginTop: 14, backgroundColor: colors.panel, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.line },
  recLabel: { fontSize: 11, fontWeight: '800', color: colors.muted, letterSpacing: 1 },
  recName: { fontSize: 17, fontWeight: '800', color: colors.ink, marginTop: 6 },
  recHow: { fontSize: 13, color: colors.mid, marginTop: 6, lineHeight: 19 },
  recSub: { fontSize: 12, color: colors.muted, marginTop: 8, lineHeight: 17 },
  accRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 16, flexWrap: 'wrap' },
  link: { fontSize: 12.5, color: colors.mid, fontWeight: '700', textDecorationLine: 'underline' },
  foot: { paddingHorizontal: 18, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg },
  cta: { backgroundColor: colors.ink, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  ctaTxt: { color: colors.bg, fontSize: 15.5, fontWeight: '800' },
}));
