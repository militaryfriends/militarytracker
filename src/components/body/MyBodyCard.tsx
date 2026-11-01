/**
 * MY 탭 맨 위 — 내 몸 3D(대표 피드백 10/31 6절).
 *  · 프로젝트 진행 중: [지금 | 지금 vs 예상 | 예상] 토글 + 프로젝트 이름 · 진행 막대 · 진행률 / 체크인 D-day / 체중 기록 버튼
 *  · 계산만 있음: 지금 내 몸 + "프로젝트 4가지 보기"
 *  · 계산 없음: 내 몸 계산하기
 * "지금" 몸은 마지막 체크인(또는 계산) 뒤의 체중 기록으로 바뀐다(홈 카드와 같은 규칙).
 */
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, themed, useThemeMode } from '../../theme';
import { PressableScale, Segmented } from '../../ui';
import { useAppStore } from '../../stores/appStore';
import { useEntitlement } from '../../hooks/useEntitlement';
import { cellWithHysteresis, updateComp } from '../../utils/bodyComp';
import { trendWeight } from '../../utils/body';
import { analyzeBody } from '../../utils/bodyAnalysis';
import { AvatarView } from './AvatarView';
import { has3D } from './avatar3d/Avatar3D';
import { coordOf } from './avatar3d/morph';
import { projectNow } from './progress';
import { kg, pct0 } from './format';

type View3 = 'now' | 'both' | 'goal';
const VIEWS = [
  { value: 'now', label: '지금' },
  { value: 'both', label: '지금 vs 예상' },
  { value: 'goal', label: '예상' },
] as const satisfies readonly { value: View3; label: string }[];

export function MyBodyCard({ onWeigh }: { onWeigh: () => void }) {
  useThemeMode();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const analysis = useAppStore((st) => st.analysis);
  const project = useAppStore((st) => st.project);
  const checkins = useAppStore((st) => st.checkins);
  const weights = useAppStore((st) => st.weights);
  const { pro } = useEntitlement();
  const [view, setView] = useState<View3>('both');

  const running = !!project && (project.status === 'active' || project.status === 'paused');
  const now = useMemo(() => (running && project ? projectNow(project, checkins, weights) : null), [running, project, checkins, weights]);

  // 계산만 있을 때: 계산 뒤 체중 기록으로 지금 몸을 따라 바꾼다
  const free = useMemo(() => {
    if (!analysis) return null;
    const after = weights.filter((w) => (w.createdAt ?? w.date) > analysis.createdAt);
    const tw = trendWeight(after);
    const c = tw ? updateComp(analysis.comp, analysis.input.heightCm, tw) : analysis.comp;
    const cards = analyzeBody(analysis.input).projects;
    return {
      cell: tw ? cellWithHysteresis(analysis.input.sex, c.bfPct, c.nffmi, analysis.cell) : analysis.cell,
      coord: tw ? coordOf(analysis.input.sex, c.bfPct, c.nffmi) : analysis.coord,
      kg: tw ?? analysis.input.weightKg,
      bf: c.bfPct,
      rec: cards.find((x) => x.recommended) ?? cards[0],
    };
  }, [analysis, weights]);

  const inner = Math.min(width, 480) - 40 - 32;

  if (project && now) {
    const sex = project.input.sex;
    const nowBody = { cell: now.nowCell, coord: coordOf(sex, now.nowComp.bfPct, now.nowComp.nffmi) };
    const goalBody = { cell: project.end.cell, coord: coordOf(sex, project.end.bfPct, project.end.nffmi) };
    const nowKg = now.nowComp.ffmKg + now.nowComp.fmKg;
    const totalDays = Math.max(1, Math.round(project.months * 30.44));
    const pctDone = Math.min(100, Math.round((now.days / totalDays) * 100));
    const stopped = project.status === 'paused' || !pro;
    const one = Math.round(Math.min(220, inner * 0.62));
    const two = Math.round(Math.min(150, (inner - 16) / 2));
    return (
      <View style={s.card}>
        <Text style={s.label}>내 몸</Text>
        <View style={s.stage}>
          {view === 'both' ? (
            <View style={s.pair}>
              <View style={s.col}>
                <AvatarView sex={sex} {...nowBody} width={two} badge="지금" live yawGroup="my" />
                <Text style={s.colTxt}>{kg(nowKg)}kg · {pct0(now.nowComp.bfPct)}%</Text>
              </View>
              <View style={s.col}>
                <AvatarView sex={sex} {...goalBody} width={two} badge="예상" live yawGroup="my" />
                <Text style={s.colTxt}>{kg(project.end.weightKg)}kg · {pct0(project.end.bfPct)}%</Text>
              </View>
            </View>
          ) : (
            <View style={s.col}>
              <AvatarView sex={sex} {...(view === 'now' ? nowBody : goalBody)} width={one} badge={view === 'now' ? '지금' : '예상'} live morphMs={420} />
              <Text style={s.colTxt}>
                {view === 'now'
                  ? `지금 ${kg(nowKg)}kg · 체지방 ${pct0(now.nowComp.bfPct)}%`
                  : `${project.months}개월 뒤 예상 ${kg(project.end.weightKg)}kg · 체지방 ${pct0(project.end.bfPct)}%`}
              </Text>
            </View>
          )}
        </View>
        {has3D(sex) ? <Text style={s.hint}>좌우로 밀어 돌려 보세요</Text> : null}
        <View style={{ marginTop: 12 }}>
          <Segmented<View3> options={VIEWS} value={view} onChange={setView} label="내 몸 보기" />
        </View>

        <View style={s.proj}>
          <Text style={s.projName} numberOfLines={1}>{project.name}</Text>
          <Text style={s.projSub}>{stopped ? '멈춤 · 다시 구독하면 이어서' : `${now.week}주차 · 기간의 ${pctDone}%`}</Text>
          <View style={s.bar}><View style={[s.barFill, { width: `${Math.max(3, pctDone)}%` }]} /></View>
        </View>
        <View style={s.btnRow}>
          <Btn title="진행률" sub={`${pctDone}%`} onPress={() => router.push('/project/checkin')} />
          <Btn title="체크인" sub={now.dueIn <= 0 ? '오늘' : `D-${now.dueIn}`} onPress={() => router.push('/project/checkin')} />
          <Btn title="체중 기록" sub="오늘 몸무게" onPress={onWeigh} />
        </View>
      </View>
    );
  }

  if (analysis && free) {
    const sex = analysis.input.sex;
    return (
      <View style={s.card}>
        <Text style={s.label}>지금 내 몸</Text>
        <View style={s.stage}>
          <View style={s.col}>
            <AvatarView sex={sex} cell={free.cell} coord={free.coord} width={Math.round(Math.min(220, inner * 0.62))} badge="지금" live />
            <Text style={s.colTxt}>{kg(free.kg)}kg · 체지방 약 {pct0(free.bf)}%</Text>
          </View>
        </View>
        {has3D(sex) ? <Text style={s.hint}>좌우로 밀어 돌려 보세요</Text> : null}
        <PressableScale style={s.cta} onPress={() => router.push('/project')} accessibilityLabel="프로젝트 4가지 보기">
          <Text style={s.ctaTxt}>프로젝트 4가지 보기</Text>
        </PressableScale>
        <Text style={s.ctaSub}>추천 · {free.rec.name} {free.rec.months}개월</Text>
      </View>
    );
  }

  return (
    <View style={s.card}>
      <Text style={s.label}>지금 내 몸</Text>
      <Text style={s.projName}>아직 계산하지 않았어요</Text>
      <Text style={s.projSub}>키 · 체중 · 허리로 지금 몸을 3D 로 만들고 목표 몸 4가지를 계산해요.</Text>
      <PressableScale style={s.cta} onPress={() => router.push('/project/new')} accessibilityLabel="내 몸 계산하기">
        <Text style={s.ctaTxt}>내 몸 계산하기</Text>
      </PressableScale>
    </View>
  );
}

function Btn({ title, sub, onPress }: { title: string; sub: string; onPress: () => void }) {
  useThemeMode();
  return (
    <TouchableOpacity activeOpacity={0.7} style={s.btn} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}, ${sub}`}>
      <Text style={s.btnTitle}>{title}</Text>
      <Text style={s.btnSub}>{sub}</Text>
    </TouchableOpacity>
  );
}

const s = themed(() => StyleSheet.create({
  card: {
    backgroundColor: colors.panel, borderRadius: 18, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: colors.line,
  },
  label: { fontSize: 10, fontWeight: '800', color: colors.muted, letterSpacing: 2 },
  stage: { alignItems: 'center', marginTop: 10 },
  pair: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  col: { alignItems: 'center' },
  colTxt: { fontSize: 12.5, color: colors.mid, marginTop: 6, fontWeight: '700', textAlign: 'center' },
  hint: { fontSize: 11, color: colors.muted, textAlign: 'center', marginTop: 4 },
  proj: { marginTop: 16 },
  projName: { fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: 6 },
  projSub: { fontSize: 12.5, color: colors.mid, marginTop: 4, lineHeight: 18 },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.panel3, marginTop: 10, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.ink },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  btn: {
    flex: 1, backgroundColor: colors.panel2, borderRadius: 12, paddingVertical: 11, alignItems: 'center',
    borderWidth: 1, borderColor: colors.line,
  },
  btnTitle: { fontSize: 12.5, fontWeight: '800', color: colors.ink },
  btnSub: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
  cta: { backgroundColor: colors.ink, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  ctaTxt: { color: colors.bg, fontSize: 14.5, fontWeight: '800' },
  ctaSub: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 8 },
}));
