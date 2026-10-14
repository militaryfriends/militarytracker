/**
 * O7 지금 몸 vs 목표 몸 — "분석이 완료되었습니다".
 * 같은 크기 · 같은 발 위치로 두 아바타를 나란히 놓아 한눈에 비교한다. 블러 없음.
 * 가운데 격차 줄("목표까지") + 엔진이 정한 순서 한 줄. 정확도가 '기본'이면 허리 입력으로 돌아가는 링크.
 */
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
import { coordOf } from '../../src/components/body/avatar3d/morph';
import { AccuracyMeter } from '../../src/components/onboard/StepBody';
import { kg, muscleOf, pct0 } from '../../src/components/body/format';
import { EmptyState } from '../../src/components/ui';

export default function CompareScreen() {
  useThemeMode();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { redo } = useLocalSearchParams<{ redo?: string }>();
  const { width } = useWindowDimensions();
  const a = useAppStore((st) => st.analysis);

  if (!a) {
    return (
      <SafeAreaView style={s.root}>
        <EmptyState text="분석 결과가 없어요." cta="내 몸 분석하기" onCta={() => router.replace('/project/new')} />
      </SafeAreaView>
    );
  }

  const sex = a.input.sex;
  const colW = Math.min(170, (Math.min(width, 480) - 40 - 16) / 2);
  const g = a.gap;
  const fatTxt = Math.abs(g.fatKg) < 0.05 ? '체지방 유지' : `체지방 ${kg(Math.abs(g.fatKg))}kg ${g.fatKg < 0 ? '감량' : '증가'}`;
  const leanTxt = g.leanKg >= 0.05 ? ` + 제지방 ${kg(g.leanKg)}kg 증가` : '';
  const fromInbody = a.comp.src === 'inbody';

  // 허리둘레를 넣으러 O3 로 — 입력 흐름이 스택에 있으면 그리로 돌아가고, 없으면 새로 연다
  const addWaist = () => {
    useOnboardDraft.getState().patch({ resume: 'body' });
    if (useOnboardDraft.getState().seeded && router.canGoBack()) router.back();
    else router.replace(!redo ? '/onboard' : useOnboardDraft.getState().restart ? '/project/new?restart=1' : '/project/new');
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={s.inner} showsVerticalScrollIndicator={false}>
        <Text style={s.title} accessibilityRole="header">분석이 완료되었습니다</Text>
        <Text style={s.sub}>지금 몸과 목표 몸입니다</Text>

        <View style={s.pair}>
          <Animated.View entering={FadeInDown.duration(320)} style={s.col}>
            <AvatarView sex={sex} cell={a.cell} coord={a.coord} width={colW} badge="지금" live intro yawGroup="compare"
              label={`지금 몸, ${kg(a.input.weightKg)}kg, 체지방 ${pct0(a.comp.bfPct)}%`} />
            <Text style={s.colHead}>지금 {fromInbody ? '(인바디)' : '(추정)'}</Text>
            <Text style={s.colNum}>{kg(a.input.weightKg)}kg · 체지방 {pct0(a.comp.bfPct)}%</Text>
            <Text style={s.colSub}>근육: {muscleOf(a.cell)}</Text>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(140).duration(320)} style={s.col}>
            <AvatarView sex={sex} cell={a.goal.cell} coord={coordOf(sex, a.goal.bfPct, a.goal.nffmi)} width={colW} badge="목표"
              live intro yawGroup="compare"
              label={`목표 ${a.goal.name}, ${kg(a.goal.weightKg)}kg, 체지방 ${pct0(a.goal.bfPct)}%`} />
            <Text style={s.colHead}>목표 · {a.goal.name}</Text>
            <Text style={s.colNum}>{kg(a.goal.weightKg)}kg · 체지방 {pct0(a.goal.bfPct)}%</Text>
            <Text style={s.colSub}>근육: {muscleOf(a.goal.cell)}</Text>
          </Animated.View>
        </View>

        {has3D(sex) ? <Text style={s.spin}>좌우로 밀면 두 몸이 같이 돌아가요</Text> : null}

        <Animated.View entering={FadeInDown.delay(260).duration(320)} style={s.gap}>
          <Text style={s.gapLabel}>목표까지</Text>
          <Text style={s.gapTxt}>{fatTxt}{leanTxt}</Text>
          <Text style={s.order}>{a.order}</Text>
          {g.muscleAhead ? (
            <Text style={s.note}>지금 근육량을 유지하면서 체지방만 줄이면 목표보다 더 탄탄하게 보일 거예요.</Text>
          ) : null}
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
        <PressableScale style={s.cta} onPress={() => router.push(redo ? '/project?redo=1' : '/project')} accessibilityLabel="내 변화 프로젝트 보기">
          <Text style={s.ctaTxt}>내 변화 프로젝트 보기</Text>
        </PressableScale>
      </View>
    </SafeAreaView>
  );
}

const s = themed(() => StyleSheet.create({
  spin: { fontSize: 11.5, color: colors.muted, textAlign: 'center', marginTop: 8 },
  root: { flex: 1, backgroundColor: colors.bg },
  inner: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24 },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  sub: { fontSize: 14, color: colors.muted, marginTop: 6 },
  pair: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, marginTop: 26 },
  col: { flex: 1, alignItems: 'center' },
  colHead: { fontSize: 14, fontWeight: '800', color: colors.ink, marginTop: 10, textAlign: 'center' },
  colNum: { fontSize: 13, color: colors.mid, marginTop: 4, textAlign: 'center' },
  colSub: { fontSize: 12, color: colors.muted, marginTop: 2, textAlign: 'center' },
  gap: {
    marginTop: 24, backgroundColor: colors.panel, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.line,
  },
  gapLabel: { fontSize: 11, fontWeight: '800', color: colors.muted, letterSpacing: 1 },
  gapTxt: { fontSize: 17, fontWeight: '800', color: colors.ink, marginTop: 6, lineHeight: 24 },
  order: { fontSize: 13, color: colors.mid, marginTop: 10, lineHeight: 19 },
  note: { fontSize: 12.5, color: colors.muted, marginTop: 8, lineHeight: 18 },
  accRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 16, flexWrap: 'wrap' },
  link: { fontSize: 12.5, color: colors.mid, fontWeight: '700', textDecorationLine: 'underline' },
  foot: { paddingHorizontal: 18, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg },
  cta: { backgroundColor: colors.ink, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  ctaTxt: { color: colors.bg, fontSize: 15.5, fontWeight: '800' },
}));
