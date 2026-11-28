/**
 * 다음 몸 — 진행 중 프로젝트가 끝났을 때의 몸에서 다시 계산한 "그다음 목표 몸" (2026-11-27 대표 결정).
 * 프로젝트가 끝나는 날이 구독이 끝나는 날이 되지 않게, 끝나기 전부터 다음 변신을 3D 로 보여준다.
 *  · 감량 프로젝트 → 다음은 증량 카드 중 맞는 것(대개 린매스업)
 *  · 증량 프로젝트 → 끝난 몸 기준 추천 카드
 * 숫자는 엔진(buildCards)이 끝난 몸을 시작점으로 다시 낸 값 — 지어낸 값이 없다.
 * 마지막 한 달이 되면 "다음 몸 시작하기" 버튼이 나온다(지금 몸으로 다시 계산 → 카드 4장).
 */
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../Text';
import { useRouter } from 'expo-router';
import { colors, themed, useThemeMode } from '../../theme';
import { PressableScale } from '../../ui';
import { nffmiOf, toCell } from '../../utils/bodyComp';
import { buildCards, STRATEGY, type CardProject } from '../../utils/projection';
import type { BodyProject } from '../../types';
import { AvatarView } from './AvatarView';
import { coordOf } from './avatar3d/morph';
import { kg, pct0 } from './format';

export function nextCardOf(project: BodyProject): CardProject | null {
  const i = project.input;
  const w = project.end.weightKg;
  const bf = project.end.bfPct;
  if (!(w > 0) || !(bf > 0)) return null;
  const fm = (w * bf) / 100;
  const ffm = w - fm;
  const start = { bfPct: bf, fmKg: fm, ffmKg: ffm, nffmi: nffmiOf(ffm, i.heightCm), src: project.baseline.src, accuracy: project.baseline.accuracy };
  const cards = buildCards({ sex: i.sex, age: i.age, heightCm: i.heightCm, level: i.level, days: i.days, start, waistCm: undefined });
  const wasCut = project.strategy ? STRATEGY[project.strategy].phase === 'cut' : project.phases.some((p) => p.phase === 'cut');
  // 감량을 끝낸 몸은 근육을 채울 차례 — 증량 카드 중 지금 몸에 맞는 것, 둘 다 맞으면 추천을 따른다.
  // 단 '다음 몸'은 눈에 보이게 달라야 의미가 있다 — 끝 몸의 칸이 지금과 같으면(예: 상급 여성 린매스업 12개월 +0.8kg) 칸이 바뀌는 카드를 먼저(11/27 밤 점검)
  const startCell = toCell(i.sex, bf, start.nffmi);
  const visible = (c: CardProject) => c.end.cell !== startCell;
  const recFirst = (xs: CardProject[]) => xs.find((c) => c.recommended) ?? xs[0];
  const ok = cards.filter((c) => c.fit.ok);
  const gainOk = ok.filter((c) => STRATEGY[c.strategy].phase === 'gain');
  const order = wasCut
    ? [gainOk.filter(visible), ok.filter(visible), gainOk, ok]
    : [ok.filter(visible), ok];
  for (const xs of order) if (xs.length) return recFirst(xs);
  return cards.find((c) => c.recommended) ?? null;
}

export function NextBody({ project, monthIndex, width }: { project: BodyProject; monthIndex: number; width: number }) {
  useThemeMode();
  const router = useRouter();
  const next = useMemo(() => nextCardOf(project), [project]);
  if (!next) return null;
  const sex = project.input.sex;
  const last = monthIndex >= project.months - 1;
  const avW = Math.min(120, Math.round(width * 0.32));
  return (
    <View style={s.box} accessibilityLabel={`다음 몸. 지금 프로젝트가 끝나면 ${next.name} ${next.months}개월, 예상 ${kg(next.end.weightKg)}kg`}>
      <View style={{ width: avW }}>
        <AvatarView sex={sex} cell={next.end.cell} coord={coordOf(sex, next.end.bfPct, next.end.nffmi)} own bfPct={next.end.bfPct}
          width={avW} badge="다음" label={`다음 몸, ${kg(next.end.weightKg)}kg, 체지방 ${pct0(next.end.bfPct)}%`} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.kicker}>{last ? '이제 다음 몸으로' : '이 프로젝트가 끝나면'}</Text>
        <Text style={s.title} numberOfLines={2}>{next.name} · {next.months}개월</Text>
        <Text style={s.sub}>{kg(project.end.weightKg)}kg → {kg(next.end.weightKg)}kg · 체지방 {pct0(next.end.bfPct)}%</Text>
        {next.how ? <Text style={s.how} numberOfLines={2}>{next.how}</Text> : null}
        {last ? (
          <PressableScale style={s.cta} onPress={() => router.push('/project/new?restart=1')} accessibilityRole="button" accessibilityLabel="다음 몸 시작하기">
            <Text style={s.ctaTxt}>다음 몸 시작하기</Text>
          </PressableScale>
        ) : (
          <Text style={s.note}>마지막 달에 지금 몸으로 다시 계산해서 이어 갈 수 있어요.</Text>
        )}
      </View>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  box: {
    flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 14, padding: 12,
    borderRadius: 16, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line,
  },
  kicker: { fontSize: 11.5, color: colors.redText, fontWeight: '700' },
  title: { fontSize: 15, fontWeight: '800', color: colors.ink, marginTop: 3 },
  sub: { fontSize: 12.5, color: colors.mid, marginTop: 3, fontWeight: '600' },
  how: { fontSize: 11, color: colors.muted, marginTop: 2 },
  note: { fontSize: 11.5, color: colors.muted, marginTop: 8, lineHeight: 16 },
  cta: { marginTop: 10, alignSelf: 'flex-start', backgroundColor: colors.red, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  ctaTxt: { fontSize: 13, fontWeight: '800', color: colors.onRed },
}));
