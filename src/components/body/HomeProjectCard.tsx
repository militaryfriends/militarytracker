/**
 * 홈의 "내 변화 프로젝트" 카드.
 *  · 진행 중 → n주차 · 다음 체크인 D-day (체크인 화면으로)
 *  · 분석만 있음(결제 전 · 거절) → 지금 몸 → 예상 몸 + 추천 프로젝트 (O8 로 다시, 블러 없음)
 *  · 분석 없음(습관 경로 · 예전 가입자) → 내 몸 분석하기
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

  if (project && now) {
    const sex = project.input.sex;
    const fresh = now.days === 0;
    return (
      <PressableScale style={s.card} scaleTo={PRESS_SCALE.card} onPress={() => router.push('/project/checkin')}
        accessibilityLabel={`내 변화 프로젝트, ${project.name}, ${now.week}주차`}>
        <Text style={s.label}>내 변화 프로젝트</Text>
        <View style={s.row}>
          <AvatarView sex={sex} cell={now.nowCell} coord={coordOf(sex, now.nowComp.bfPct, now.nowComp.nffmi)} width={52} badge="지금" />
          <Ionicons name="arrow-forward" size={14} color={colors.muted} />
          <AvatarView sex={sex} cell={project.end.cell} coord={coordOf(sex, project.end.bfPct, project.end.nffmi)} width={52} badge="예상" />
          <View style={s.info}>
            {fresh ? <Text style={s.fresh}>프로젝트가 시작되었습니다</Text> : null}
            <Text style={s.name} numberOfLines={1}>{project.name}</Text>
            <Text style={s.sub}>
              {project.status === 'paused' || !pro ? '멈춤 · 다시 구독하면 이어서' : `${now.week}주차 · ${now.dueIn <= 0 ? '체크인할 때예요' : `다음 체크인 D-${now.dueIn}`}`}
            </Text>
            <Text style={s.small}>예상 {kg(project.end.weightKg)}kg · 체지방 {pct1(project.end.bfPct)}%</Text>
          </View>
        </View>
      </PressableScale>
    );
  }

  if (analysis && freeNow) {
    const rec = analysis.projects.find((p) => p.recommended) ?? analysis.projects[0];
    return (
      <PressableScale style={s.card} scaleTo={PRESS_SCALE.card} onPress={() => router.push('/project')}
        accessibilityLabel={`내 변화 프로젝트, ${rec.name} ${rec.months}개월, 프로젝트 보기`}>
        <Text style={s.label}>내 변화 프로젝트</Text>
        <View style={s.row}>
          <AvatarView sex={analysis.input.sex} cell={freeNow.cell} coord={freeNow.coord} width={52} badge="지금" />
          <Ionicons name="arrow-forward" size={14} color={colors.muted} />
          <AvatarView sex={analysis.input.sex} cell={rec.end.cell} coord={coordOf(analysis.input.sex, rec.end.bfPct, rec.end.nffmi)} width={52} badge="예상" />
          <View style={s.info}>
            <Text style={s.name} numberOfLines={1}>{rec.name}</Text>
            <Text style={s.sub}>{rec.months}개월 · {kg(rec.end.weightKg)}kg · 체지방 {pct1(rec.end.bfPct)}%</Text>
            <Text style={s.link}>프로젝트 보기 ›</Text>
          </View>
        </View>
      </PressableScale>
    );
  }

  return (
    <PressableScale style={s.card} scaleTo={PRESS_SCALE.card} onPress={() => router.push('/project/new')}
      accessibilityLabel="내 몸 분석하기, 목표 몸까지 걸리는 기간을 계산해요">
      <Text style={s.label}>내 변화 프로젝트</Text>
      <Text style={s.name}>내 몸 분석하기</Text>
      <Text style={s.sub}>원하는 체형을 고르면 지금 몸에서 걸리는 기간과 예상 몸을 계산해요</Text>
    </PressableScale>
  );
}

const s = themed(() => StyleSheet.create({
  card: {
    backgroundColor: colors.panel, borderRadius: 18, padding: 18,
    marginBottom: 12, borderWidth: 1, borderColor: colors.line,
  },
  label: { fontSize: 10, fontWeight: '800', color: colors.muted, letterSpacing: 2, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  info: { flex: 1, marginLeft: 6 },
  fresh: { fontSize: 11.5, fontWeight: '800', color: colors.good, marginBottom: 3 },
  name: { fontSize: 16, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 12.5, color: colors.mid, marginTop: 4, lineHeight: 18 },
  small: { fontSize: 11.5, color: colors.muted, marginTop: 3 },
  link: { fontSize: 12, color: colors.ink, fontWeight: '700', marginTop: 6 },
}));
