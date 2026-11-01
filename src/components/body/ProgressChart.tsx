/**
 * 진행률 그래프 — 예상 체중(점선) vs 실제 체중(점 · 실선), 단계(감량 · 린매스업 · 유지) 띠, 오늘 선.
 * 대표 피드백 10/31 5절 "진행률 보기(체크인 기록과 단계 그래프)". 축은 하나(체중 kg) — 체지방은 아래 표가 맡는다.
 * 색만으로 구분하지 않는다: 예상 = 점선, 실제 = 실선 + 점, 체크인 = 큰 점. 범례를 늘 붙인다.
 */
import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { colors, themed, useThemeMode } from '../../theme';
import type { BodyProject, Checkin, WeightRecord } from '../../types';
import { PHASE_LABEL, kg } from './format';

const H = 180;
const PAD = { l: 34, r: 10, t: 22, b: 22 };
const DAY = 86_400_000;
const MONTH = 30.44 * DAY;

export function ProgressChart({ project, checkins, weights }: {
  project: BodyProject; checkins: readonly Checkin[]; weights: readonly WeightRecord[];
}) {
  useThemeMode();
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));

  const start = Date.parse(project.startedAt);
  const months = Math.max(1, project.months);
  const nowM = Math.min(months, Math.max(0, (Date.now() - start) / MONTH));

  // 예상: 시작부터 끝까지 달마다 (trackOffset 이후는 재계산된 트랙)
  const expected = Array.from({ length: months + 1 }, (_, m) => {
    const i = Math.max(0, Math.min(project.track.length - 1, m - project.trackOffset));
    return { m, kg: m === 0 ? project.input.weightKg : project.track[i].weightKg };
  });
  // 실제: 시작 체중 + 시작 뒤 체중 기록 + 체크인
  const actual = [
    { m: 0, kg: project.input.weightKg },
    ...weights
      .map((r) => ({ t: Date.parse(r.createdAt ?? `${r.date}T12:00:00`), kg: r.kg }))
      .filter((r) => r.t > start)
      .sort((a, b) => a.t - b.t)
      .map((r) => ({ m: Math.min(months, (r.t - start) / MONTH), kg: r.kg })),
  ];
  const marks = checkins.map((c) => ({ m: Math.min(months, c.monthIndex), kg: c.weightKg }));

  const all = [...expected, ...actual, ...marks].map((p) => p.kg);
  const lo = Math.floor(Math.min(...all) - 1);
  const hi = Math.ceil(Math.max(...all) + 1);
  const iw = Math.max(1, w - PAD.l - PAD.r);
  const ih = H - PAD.t - PAD.b;
  const x = (m: number) => PAD.l + (m / months) * iw;
  const y = (v: number) => PAD.t + (1 - (v - lo) / Math.max(1, hi - lo)) * ih;
  const path = (pts: { m: number; kg: number }[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.m).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ');
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  const lastActual = actual[actual.length - 1];

  return (
    <View>
      <View style={s.legend}>
        <View style={s.legItem}><View style={s.legDash} /><Text style={s.legTxt}>예상 체중</Text></View>
        <View style={s.legItem}><View style={s.legSolid} /><Text style={s.legTxt}>실제 체중</Text></View>
        {marks.length ? <View style={s.legItem}><View style={s.legDot} /><Text style={s.legTxt}>체크인</Text></View> : null}
      </View>
      <View onLayout={onLayout} style={{ height: H }}
        accessible accessibilityRole="image"
        accessibilityLabel={`체중 그래프. 시작 ${kg(project.input.weightKg)}kg, 지금 ${kg(lastActual.kg)}kg, ${months}개월 뒤 예상 ${kg(expected[months].kg)}kg`}>
        {w > 0 ? (
          <Svg width={w} height={H}>
            {/* 단계 띠 — 번갈아 옅게 */}
            {project.phases.map((ph, i) => {
              const x0 = x(Math.max(0, ph.from - 1));
              const x1 = x(Math.min(months, ph.to));
              return (
                <Rect key={`${ph.phase}-${ph.from}`} x={x0} y={PAD.t - 18} width={Math.max(0, x1 - x0)} height={ih + 18}
                  fill={i % 2 ? colors.panel2 : colors.panel3} opacity={0.6} />
              );
            })}
            {project.phases.map((ph) => {
              const x0 = x(Math.max(0, ph.from - 1));
              const x1 = x(Math.min(months, ph.to));
              return x1 - x0 > 44 ? (
                <SvgText key={`t-${ph.from}`} x={x0 + 4} y={PAD.t - 6} fontSize={10} fontWeight="700" fill={colors.muted}>
                  {PHASE_LABEL[ph.phase]}
                </SvgText>
              ) : null;
            })}
            {ticks.map((t) => (
              <SvgText key={t} x={PAD.l - 6} y={y(t) + 3.5} fontSize={10} fill={colors.muted} textAnchor="end">{t}</SvgText>
            ))}
            <Line x1={PAD.l} x2={PAD.l + iw} y1={PAD.t + ih} y2={PAD.t + ih} stroke={colors.line2} strokeWidth={1} />
            <SvgText x={PAD.l} y={H - 6} fontSize={10} fill={colors.muted}>시작</SvgText>
            <SvgText x={PAD.l + iw} y={H - 6} fontSize={10} fill={colors.muted} textAnchor="end">{months}개월</SvgText>
            {/* 오늘 */}
            <Line x1={x(nowM)} x2={x(nowM)} y1={PAD.t} y2={PAD.t + ih} stroke={colors.line2} strokeWidth={1} strokeDasharray="2 3" />
            <Path d={path(expected)} stroke={colors.mid} strokeWidth={2} fill="none" strokeDasharray="5 4" />
            {actual.length > 1 ? <Path d={path(actual)} stroke={colors.ink} strokeWidth={2} fill="none" /> : null}
            {actual.map((p, i) => (
              <Circle key={`a${i}`} cx={x(p.m)} cy={y(p.kg)} r={3} fill={colors.ink} stroke={colors.panel} strokeWidth={2} />
            ))}
            {marks.map((p, i) => (
              <Circle key={`c${i}`} cx={x(p.m)} cy={y(p.kg)} r={5.5} fill={colors.panel} stroke={colors.ink} strokeWidth={2} />
            ))}
            {/* 끝값만 글자로 */}
            <SvgText x={Math.min(PAD.l + iw, x(months)) - 2} y={y(expected[months].kg) - 7} fontSize={10.5} fontWeight="700"
              fill={colors.mid} textAnchor="end">{kg(expected[months].kg)}kg</SvgText>
            <SvgText x={Math.min(PAD.l + iw - 40, x(lastActual.m) + 6)} y={y(lastActual.kg) + 14} fontSize={10.5} fontWeight="800"
              fill={colors.ink}>{kg(lastActual.kg)}kg</SvgText>
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  legend: { flexDirection: 'row', gap: 14, marginBottom: 6, flexWrap: 'wrap' },
  legItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legDash: { width: 16, height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: colors.mid },
  legSolid: { width: 16, height: 2, backgroundColor: colors.ink },
  legDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: colors.ink },
  legTxt: { fontSize: 11, color: colors.mid, fontWeight: '600' },
}));
