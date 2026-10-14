/**
 * 프로젝트 카드 — O8 제안 · 홈 · 구독 화면 요약에서 같이 쓴다.
 * 예상 아바타(배지 '예상', 블러 없음) + 이름 · 기간 + 예상 체중 · 체지방률 · 허리(참고) + 목표 도달 표시 + 실천 조건.
 * 선택되면 지금 칸 → 예상 칸으로 0.6초 크로스페이드.
 */
import { StyleSheet, Text, View } from 'react-native';
import { colors, themed, useThemeMode } from '../../theme';
import { PressableScale } from '../../ui';
import type { Sex } from '../../utils/bodyComp';
import type { StoredProject } from '../../types';
import { AvatarView } from './AvatarView';
import { coordOf } from './avatar3d/morph';
import { kg, pct1, practiceLine, reachLine } from './format';

export function ProjectCard({
  sex, project, fromCell, selected, onPress, days, compact = false,
}: {
  sex: Sex;
  project: StoredProject;
  /** 지금 칸 — 선택될 때 여기서 예상 칸으로 바뀐다 */
  fromCell: string;
  selected: boolean;
  onPress?: () => void;
  days: number;
  compact?: boolean;
}) {
  useThemeMode();
  const p = project;
  const body = (
    <>
      <AvatarView
        sex={sex}
        cell={p.end.cell}
        coord={coordOf(sex, p.end.bfPct, p.end.nffmi)}
        width={compact ? 64 : 92}
        badge="예상"
        fadeFrom={selected && !compact ? fromCell : null}
        label={`예상 몸, ${kg(p.end.weightKg)}kg, 체지방 ${pct1(p.end.bfPct)}%`}
      />
      <View style={s.info}>
        <View style={s.head}>
          <Text style={s.name} numberOfLines={2}>{p.name}</Text>
        </View>
        <View style={s.monthPill}><Text style={s.monthTxt}>{p.months}개월</Text></View>
        <Text style={s.num}>{kg(p.end.weightKg)}kg · 체지방 {pct1(p.end.bfPct)}%</Text>
        {p.end.waistCm ? <Text style={s.waist}>허리 약 {Math.round(p.end.waistCm)}cm (참고)</Text> : null}
        <Text style={[s.reach, p.reachesGoal && s.reachOn]}>{reachLine(p)}</Text>
        {!compact ? <Text style={s.practice}>{practiceLine(p.nutrition, days)}</Text> : null}
        {!compact && days <= 2 ? <Text style={s.faster}>주 3회 이상이면 더 빨라져요</Text> : null}
      </View>
      {p.recommended ? (
        <View style={s.rec}><Text style={s.recTxt}>추천</Text></View>
      ) : null}
    </>
  );
  if (!onPress) return <View style={[s.card, compact && s.cardCompact]}>{body}</View>;
  return (
    <PressableScale
      haptic="select"
      scaleTo={0.98}
      onPress={onPress}
      style={[s.card, selected && s.cardOn, compact && s.cardCompact]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${p.name}, ${p.months}개월, 예상 ${kg(p.end.weightKg)}kg 체지방 ${pct1(p.end.bfPct)}%, ${reachLine(p)}${p.recommended ? ', 추천' : ''}`}
    >
      {body}
    </PressableScale>
  );
}

const s = themed(() => StyleSheet.create({
  card: {
    flexDirection: 'row', gap: 14, backgroundColor: colors.panel, borderRadius: 18, padding: 14,
    borderWidth: 1.5, borderColor: colors.line, marginBottom: 12,
  },
  cardOn: { borderColor: colors.ink, backgroundColor: colors.panel2 },
  cardCompact: { padding: 12, gap: 12, marginBottom: 0 },
  info: { flex: 1, paddingTop: 2 },
  head: { flexDirection: 'row', alignItems: 'center', paddingRight: 40 },
  name: { fontSize: 16.5, fontWeight: '800', color: colors.ink, flexShrink: 1 },
  monthPill: {
    alignSelf: 'flex-start', marginTop: 6, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3,
    borderWidth: 1, borderColor: colors.line2,
  },
  monthTxt: { fontSize: 11.5, fontWeight: '700', color: colors.mid },
  num: { fontSize: 13.5, fontWeight: '700', color: colors.ink, marginTop: 9 },
  waist: { fontSize: 12, color: colors.muted, marginTop: 2 },
  reach: { fontSize: 12.5, fontWeight: '800', color: colors.mid, marginTop: 6 },
  reachOn: { color: colors.good },
  practice: { fontSize: 11.5, color: colors.muted, marginTop: 6, lineHeight: 16 },
  faster: { fontSize: 11.5, color: colors.mid, marginTop: 3 },
  rec: {
    position: 'absolute', top: 12, right: 12, backgroundColor: colors.ink, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  recTxt: { fontSize: 10.5, fontWeight: '800', color: colors.bg, letterSpacing: 0.5 },
}));
