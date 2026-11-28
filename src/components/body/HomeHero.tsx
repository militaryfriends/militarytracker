/**
 * 홈 맨 위 — 내 몸이 주인공(B3).
 *  · 프로젝트 진행 중: 지금 몸 + 목표 몸까지 % · 막대(눈금 = 이 날짜의 예상) · 체중 · 체지방(시작 대비)
 *  · 계산만 있음: 지금 몸 + 체중 · 체지방 + 목표 몸 4가지 보기
 *  · 계산 없음: 내 몸 계산하기
 * 숫자는 MY(내 몸) 카드 · 체크인과 같은 계산(useNowBody · progressPct)이다.
 */
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../Text';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, themed, useThemeMode } from '../../theme';
import { FONT, PressableScale } from '../../ui';
import { useAppStore } from '../../stores/appStore';
import { useEntitlement } from '../../hooks/useEntitlement';
import { analyzeBody } from '../../utils/bodyAnalysis';
import { expectedPoint, progressPct } from '../../utils/projection';
import type { Accuracy } from '../../utils/bodyComp';
import { AvatarView } from './AvatarView';
import { useNowBody } from './nowBody';
import { projectNow } from './progress';
import { kg, pct1 } from './format';

const ACC: Record<Accuracy, string> = { high: '높음', good: '좋음', basic: '기본' };
const signed = (v: number, d = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}`;

/** 시작 대비 변화 — 숫자만 있으면 무엇과 견준 값인지 알 수 없어 말을 붙인다(11/27 배치 점검) */
const fromStart = (v: number, unit: string) => (Math.abs(v) < 0.05 ? '시작과 같음' : `시작 대비 ${signed(v)}${unit}`);

function Row({ label, value, unit, note }: { label: string; value: string; unit: string; note?: string }) {
  useThemeMode();
  return (
    <View style={s.row}>
      <View style={s.rowL}>
        <Text style={s.rowK}>{label}</Text>
        {note ? <Text style={s.rowNote} numberOfLines={1}>{note}</Text> : null}
      </View>
      <View style={s.rowV}>
        <Text style={s.rowNum}>{value}</Text>
        <Text style={s.rowUnit}>{unit}</Text>
      </View>
    </View>
  );
}

export function HomeHero({ avatarW }: { avatarW: number }) {
  useThemeMode();
  const router = useRouter();
  const now = useNowBody();
  const analysis = useAppStore((st) => st.analysis);
  const project = useAppStore((st) => st.project);
  const checkins = useAppStore((st) => st.checkins);
  const weights = useAppStore((st) => st.weights);
  const chosen = useAppStore((st) => st.profile?.strategy);
  const { pro } = useEntitlement();

  const running = !!project && (project.status === 'active' || project.status === 'paused');
  const prog = useMemo(() => {
    if (!running || !project) return null;
    const n = projectNow(project, checkins, weights);
    const sex = project.input.sex;
    const body = Math.round(progressPct(sex, project.baseline, n.nowComp, project.goal));
    const exp = Math.round(progressPct(sex, project.baseline,
      expectedPoint(project.track, project.trackOffset, Math.floor(n.days / 30.44)), project.goal));
    const totalWeeks = Math.max(1, Math.round((project.months * 30.44) / 7));
    return { body, exp, week: Math.min(n.week, totalWeeks), totalWeeks, dueIn: n.dueIn };
  }, [running, project, checkins, weights]);

  const rec = useMemo(() => {
    if (!analysis || running) return null;
    const cards = analyzeBody(analysis.input).projects;
    return cards.find((c) => c.strategy === chosen) ?? cards.find((c) => c.recommended) ?? cards[0];
  }, [analysis, running, chosen]);

  if (!now) {
    return (
      <View style={s.blank}>
        <Text style={s.blankTitle}>내 몸을 3D 로 만들어 보세요</Text>
        <Text style={s.blankSub}>키 · 체중 · 허리로 지금 몸을 만들고, 목표 몸 4가지와 걸리는 기간을 계산해요.</Text>
        <PressableScale style={s.cta} onPress={() => router.push('/project/new')} accessibilityLabel="내 몸 계산하기">
          <Text style={s.ctaTxt}>내 몸 계산하기</Text>
        </PressableScale>
      </View>
    );
  }

  const avatar = (
    <PressableScale onPress={() => router.push('/tabs/my')} accessibilityLabel="내 몸 자세히 보기" style={s.avatar}>
      <AvatarView sex={now.sex} cell={now.cell} coord={now.coord} own bfPct={now.bfPct} width={avatarW}
        label={`지금 내 몸, ${kg(now.weightKg)}kg, 체지방 ${pct1(now.bfPct)}%`} />
      <View style={s.chip}>
        <Text style={s.chipOn}>지금</Text>
        <Text style={s.chipTxt}>추정 · 정확도 {ACC[now.accuracy]}</Text>
      </View>
    </PressableScale>
  );

  if (project && prog) {
    const stopped = project.status === 'paused' || !pro;
    const diff = prog.body - prog.exp;
    const startBf = project.baseline.bfPct;
    return (
      <View style={s.wrap}>
        {avatar}
        <View style={s.info}>
          <Text style={s.kicker}>목표 몸까지</Text>
          <View style={s.pctRow}>
            <Text style={s.pct}>{Math.max(0, prog.body)}</Text>
            <Text style={s.pctUnit}>%</Text>
          </View>
          <View style={s.bar} accessibilityLabel={`목표 몸까지 ${prog.body}%, 지금 날짜의 예상 ${prog.exp}%`}>
            <View style={[s.barFill, { width: `${Math.min(100, Math.max(3, prog.body))}%` }]} />
            <View style={[s.barTick, { left: `${Math.min(99, Math.max(0, prog.exp))}%` }]} />
          </View>
          <Text style={s.note}>
            {stopped ? '멈춤 · 다시 구독하면 이어서'
              : `${prog.week}주차 / ${prog.totalWeeks}주${diff === 0 ? '' : ` · 예상보다 ${Math.abs(diff)}%p ${diff > 0 ? '앞' : '뒤'}`}`}
          </Text>
          <View style={s.rows}>
            <Row label="체중" value={kg(now.weightKg)} unit="kg" note={fromStart(now.weightKg - project.input.weightKg, 'kg')} />
            <Row label="체지방" value={pct1(now.bfPct)} unit="%" note={fromStart(now.bfPct - startBf, '%p')} />
          </View>
          <PressableScale style={s.link} onPress={() => router.push('/project/checkin')}
            accessibilityLabel={prog.dueIn <= 0 ? '체크인하기' : `진행률 보기, 다음 체크인 ${prog.dueIn}일 뒤`}>
            <Text style={s.linkTxt}>{prog.dueIn <= 0 ? '체크인할 때예요' : `진행률 · 체크인 D-${prog.dueIn}`}</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.muted} />
          </PressableScale>
        </View>
      </View>
    );
  }

  return (
    <View style={s.wrap}>
      {avatar}
      <View style={s.info}>
        <Text style={s.kicker}>지금 내 몸</Text>
        <View style={[s.rows, { marginTop: 8 }]}>
          <Row label="체중" value={kg(now.weightKg)} unit="kg" />
          <Row label="체지방" value={pct1(now.bfPct)} unit="%" />
        </View>
        {rec ? (
          <>
            <Text style={[s.note, { marginTop: 12 }]}>{rec.recommended ? '추천' : '내가 고른 카드'} · {rec.name} {rec.months}개월{'\n'}예상 {kg(rec.end.weightKg)}kg · 체지방 {pct1(rec.end.bfPct)}%</Text>
            <PressableScale style={s.ghost} onPress={() => router.push('/project')} accessibilityLabel="목표 몸 4가지 보기">
              <Text style={s.ghostTxt}>목표 몸 4가지 보기</Text>
            </PressableScale>
          </>
        ) : null}
      </View>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingHorizontal: 4, marginBottom: 14 },
  avatar: { paddingTop: 34 },
  chip: {
    position: 'absolute', left: 0, top: 0, flexDirection: 'row', alignItems: 'center', gap: 6, height: 26, paddingHorizontal: 10,
    borderRadius: 13, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line2,
  },
  chipOn: { fontSize: 12, fontWeight: '700', color: colors.ink },
  chipTxt: { fontSize: 12, fontWeight: '600', color: colors.mid },
  info: { flex: 1, minWidth: 0, paddingTop: 38 },
  kicker: { fontSize: 13, fontWeight: '600', color: colors.mid },
  pctRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  pct: { fontFamily: FONT.num, fontSize: 80, lineHeight: 82, color: colors.ink, letterSpacing: -1 },
  pctUnit: { fontFamily: FONT.num, fontSize: 30, lineHeight: 50, color: colors.mid },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.track, marginTop: 6 },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.ink },
  barTick: { position: 'absolute', top: -3, width: 2, height: 12, borderRadius: 1, marginLeft: -1, backgroundColor: colors.ink },
  note: { fontSize: 12, lineHeight: 18, color: colors.mid, marginTop: 9 },
  rows: { marginTop: 10 },
  row: {
    minHeight: 48, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  rowK: { fontSize: 12, fontWeight: '600', color: colors.muted },
  rowV: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  rowNum: { fontFamily: FONT.num, fontSize: 24, color: colors.ink },
  rowUnit: { fontSize: 12, color: colors.mid },
  rowL: { flexShrink: 1, minWidth: 0, paddingRight: 6 },
  rowNote: { fontSize: 11, color: colors.muted, marginTop: 2, fontVariant: ['tabular-nums'] },
  link: {
    minHeight: 44, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  linkTxt: { fontSize: 13, fontWeight: '600', color: colors.ink },
  ghost: {
    marginTop: 12, minHeight: 46, borderRadius: 23, borderWidth: 1, borderColor: colors.line2, alignItems: 'center', justifyContent: 'center',
  },
  ghostTxt: { fontSize: 13.5, fontWeight: '700', color: colors.ink },
  blank: {
    backgroundColor: colors.panel, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.line, marginBottom: 14,
  },
  blankTitle: { fontSize: 19, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  blankSub: { fontSize: 13, color: colors.mid, lineHeight: 20, marginTop: 6 },
  cta: { marginTop: 16, minHeight: 52, borderRadius: 26, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' },
  ctaTxt: { fontSize: 15.5, fontWeight: '700', color: colors.onRed },
}));
