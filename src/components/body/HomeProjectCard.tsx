/**
 * 홈의 "내 변화 프로젝트" 카드.
 *  · 진행 중 → n주차 · 다음 체크인 D-day (체크인 화면으로)
 *  · 계산만 있음(결제 전 · 거절) → 지금 몸 → 추천 카드의 예상 몸 (O8 로 다시, 블러 없음)
 *  · 계산 없음(예전 가입자) → 내 몸 계산하기
 * "지금" 아바타는 체중 기록으로도 바뀐다(무료 사용자 포함) — 바뀌는 게 보여야 돌아온다.
 */
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, themed, useThemeMode } from '../../theme';
import { PressableScale, PRESS_SCALE } from '../../ui';
import { useAppStore } from '../../stores/appStore';
import { useEntitlement } from '../../hooks/useEntitlement';
import { cellWithHysteresis, updateComp } from '../../utils/bodyComp';
import { trendWeight } from '../../utils/body';
import { AvatarView } from './AvatarView';
import { projectNow } from './progress';
import { kg, pct1 } from './format';
import { coordOf } from './avatar3d/morph';
import { analyzeBody } from '../../utils/bodyAnalysis';

export function HomeProjectCard() {
  useThemeMode();
  const router = useRouter();
  const analysis = useAppStore((st) => st.analysis);
  const project = useAppStore((st) => st.project);
  const checkins = useAppStore((st) => st.checkins);
  const weights = useAppStore((st) => st.weights);
  // 구독이 끝나면 프로젝트는 멈춘다(문서 상태와 별개로 화면에서 먼저 알린다)
  const { pro } = useEntitlement();

  const now = useMemo(
    () => (project && (project.status === 'active' || project.status === 'paused') ? projectNow(project, checkins, weights) : null),
    [project, checkins, weights],
  );

  // 결제 전: 분석 뒤 체중 기록이 있으면 "지금" 칸을 따라 바꾼다
  const freeNow = useMemo(() => {
    if (!analysis) return null;
    const after = weights.filter((w) => (w.createdAt ?? w.date) > analysis.createdAt);
    const tw = trendWeight(after);
    if (!tw) return { cell: analysis.cell, coord: analysis.coord, kg: analysis.input.weightKg };
    const c = updateComp(analysis.comp, analysis.input.heightCm, tw);
    return {
      cell: cellWithHysteresis(analysis.input.sex, c.bfPct, c.nffmi, analysis.cell),
      coord: coordOf(analysis.input.sex, c.bfPct, c.nffmi),
      kg: tw,
    };
  }, [analysis, weights]);

  // 카드 4장은 저장된 입력으로 다시 계산 — 옛 분석 문서(2장)에도 프로젝트 화면과 같은 추천
  const rec = useMemo(() => {
    if (!analysis) return null;
    const cards = analyzeBody(analysis.input).projects;
    return cards.find((c) => c.recommended) ?? cards[0];
  }, [analysis]);

  if (project && now) {
    const sex = project.input.sex;
    const fresh = now.days === 0;
    const stopped = project.status === 'paused' || !pro;
    const totalDays = Math.max(1, Math.round(project.months * 30.44));
    const pctDone = Math.min(100, Math.round((now.days / totalDays) * 100));
    return (
      <PressableScale style={s.card} scaleTo={PRESS_SCALE.card} onPress={() => router.push('/project/checkin')}
        accessibilityLabel={`내 변화 프로젝트, ${project.name}, ${now.week}주차, 기간의 ${pctDone}%`}>
        <Text style={s.label}>내 변화 프로젝트</Text>
        {fresh ? <Text style={s.fresh}>프로젝트가 시작되었습니다</Text> : null}
        <Text style={s.name} numberOfLines={1}>{project.name}</Text>
        <Text style={s.sub}>
          {stopped ? '멈춤 · 다시 구독하면 이어서' : `${now.week}주차 · ${now.dueIn <= 0 ? '체크인할 때예요' : `다음 체크인 D-${now.dueIn}`}`}
        </Text>
        <View style={s.pair}>
          <AvatarView sex={sex} cell={now.nowCell} coord={coordOf(sex, now.nowComp.bfPct, now.nowComp.nffmi)} width={AV} badge="지금" />
          <Ionicons name="arrow-forward" size={16} color={colors.muted} />
          <AvatarView sex={sex} cell={project.end.cell} coord={coordOf(sex, project.end.bfPct, project.end.nffmi)} width={AV} badge="예상" />
        </View>
        <View style={s.bar} accessibilityElementsHidden>
          <View style={[s.barFill, { width: `${Math.max(3, pctDone)}%` }]} />
        </View>
        <View style={s.barRow}>
          <Text style={s.small}>{pctDone}% · {project.months}개월 중 {Math.min(project.months, Math.floor(now.days / 30.44))}개월</Text>
          <Text style={s.small}>예상 {kg(project.end.weightKg)}kg · 체지방 {pct1(project.end.bfPct)}%</Text>
        </View>
      </PressableScale>
    );
  }

  if (analysis && freeNow && rec) {
    return (
      <PressableScale style={s.card} scaleTo={PRESS_SCALE.card} onPress={() => router.push('/project')}
        accessibilityLabel={`내 변화 프로젝트, 추천 ${rec.name} ${rec.months}개월, 프로젝트 4가지 보기`}>
        <Text style={s.label}>내 변화 프로젝트</Text>
        <Text style={s.name} numberOfLines={1}>추천 · {rec.name}</Text>
        <Text style={s.sub}>{rec.months}개월 · {kg(rec.end.weightKg)}kg · 체지방 {pct1(rec.end.bfPct)}%</Text>
        <View style={s.pair}>
          <AvatarView sex={analysis.input.sex} cell={freeNow.cell} coord={freeNow.coord} width={AV} badge="지금" />
          <Ionicons name="arrow-forward" size={16} color={colors.muted} />
          <AvatarView sex={analysis.input.sex} cell={rec.end.cell} coord={coordOf(analysis.input.sex, rec.end.bfPct, rec.end.nffmi)} width={AV} badge="예상" />
        </View>
        <Text style={s.link}>프로젝트 4가지 보기 ›</Text>
      </PressableScale>
    );
  }

  return (
    <PressableScale style={s.card} scaleTo={PRESS_SCALE.card} onPress={() => router.push('/project/new')}
      accessibilityLabel="내 몸 계산하기, 지금 몸과 목표 몸 4가지를 계산해요">
      <Text style={s.label}>내 변화 프로젝트</Text>
      <Text style={s.name}>내 몸 계산하기</Text>
      <Text style={s.sub}>키 · 체중 · 허리로 지금 몸을 3D 로 만들고, 목표 몸 4가지와 걸리는 기간을 계산해요</Text>
    </PressableScale>
  );
}

/** 홈 카드 아바타 폭 — 52 는 너무 작다는 피드백(10/31 6절) */
const AV = 92;

const s = themed(() => StyleSheet.create({
  card: {
    backgroundColor: colors.panel, borderRadius: 18, padding: 18,
    marginBottom: 12, borderWidth: 1, borderColor: colors.line,
  },
  label: { fontSize: 10, fontWeight: '800', color: colors.muted, letterSpacing: 2, marginBottom: 12 },
  pair: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, marginTop: 14 },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.panel3, marginTop: 14, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.ink },
  barRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, gap: 8, flexWrap: 'wrap' },
  fresh: { fontSize: 11.5, fontWeight: '800', color: colors.good, marginBottom: 3 },
  name: { fontSize: 16, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 12.5, color: colors.mid, marginTop: 4, lineHeight: 18 },
  small: { fontSize: 11.5, color: colors.muted, marginTop: 3 },
  link: { fontSize: 12.5, color: colors.ink, fontWeight: '700', marginTop: 12, textAlign: 'center' },
}));
