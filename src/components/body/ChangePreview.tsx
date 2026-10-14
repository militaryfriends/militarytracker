/**
 * 변화 미리보기 — 고른 프로젝트의 달마다 예상 몸(엔진 트랙)을 3D 로. O8 에서 쓴다.
 * 처음 보이면 지금 → 마지막 달까지 한 번 재생하고, 아래 막대를 밀면 그 달의 몸 · 체중 · 체지방률을 본다.
 * 블러 없음 · 숫자는 엔진 값 그대로. 3D 가 없으면(네이티브 · 여성) 같은 자리에서 칸 이미지가 바뀐다.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { colors, themed, useThemeMode } from '../../theme';
import { haptic } from '../../ui';
import type { Coord, Sex } from '../../utils/bodyComp';
import type { MonthPoint, ProjectEnd } from '../../utils/projection';
import { AvatarView } from './AvatarView';
import { has3D } from './avatar3d/Avatar3D';
import { coordOf, lerpCoord } from './avatar3d/morph';
import { kg, pct1 } from './format';

const PLAY_MS = 2200;

interface Point { cell: string; coord: Coord; weightKg: number; bfPct: number }

export function ChangePreview({
  sex, title, months, start, end, track, width,
}: {
  sex: Sex;
  /** 프로젝트 이름 */
  title: string;
  months: number;
  start: Point;
  end: ProjectEnd;
  /** 이 프로젝트의 트랙(0~24개월) — 없으면(엔진 버전이 달라 다시 못 만든 경우) 시작 · 끝을 이어서 */
  track: MonthPoint[] | null;
  width: number;
}) {
  useThemeMode();
  const [month, setMonth] = useState(0);
  const monthRef = useRef(0);
  monthRef.current = month;
  const playing = useRef(true);
  const barW = useRef(1);

  // 처음 한 번 재생: 지금 → 마지막 달
  useEffect(() => {
    playing.current = true;
    const t0 = Date.now() + 500;
    const id = setInterval(() => {
      if (!playing.current) return clearInterval(id);
      const k = Math.min(1, Math.max(0, (Date.now() - t0) / PLAY_MS));
      setMonth(Math.round((k * k * (3 - 2 * k)) * months));
      if (k >= 1) {
        playing.current = false;
        clearInterval(id);
      }
    }, 90);
    return () => clearInterval(id);
  }, [months]);

  const at = (mo: number): Point => {
    if (mo <= 0) return start;
    const p = track?.[Math.min(mo, track.length - 1)];
    if (p) return { cell: p.cell, coord: coordOf(sex, p.bfPct, p.nffmi), weightKg: p.weightKg, bfPct: p.bfPct };
    const k = mo / months;
    const endCoord = coordOf(sex, end.bfPct, end.nffmi);
    return {
      cell: k < 0.5 ? start.cell : end.cell,
      coord: lerpCoord(start.coord, endCoord, k),
      weightKg: start.weightKg + (end.weightKg - start.weightKg) * k,
      bfPct: start.bfPct + (end.bfPct - start.bfPct) * k,
    };
  };
  const pt = month >= months ? { cell: end.cell, coord: coordOf(sex, end.bfPct, end.nffmi), weightKg: end.weightKg, bfPct: end.bfPct } : at(month);

  const seek = (e: GestureResponderEvent) => {
    playing.current = false;
    const x = Math.min(barW.current, Math.max(0, e.nativeEvent.locationX));
    const mo = Math.round((x / barW.current) * months);
    if (mo !== monthRef.current) {
      haptic.select();
      setMonth(mo);
    }
  };

  const avW = Math.round(Math.min(150, width * 0.4));
  const pct = months ? month / months : 0;
  return (
    <View style={s.card}>
      <View style={s.row}>
        <AvatarView sex={sex} cell={pt.cell} coord={pt.coord} width={avW} live morphMs={220}
          badge={month === 0 ? '지금' : '예상'}
          label={`${month === 0 ? '지금' : `${month}개월 뒤 예상`} 몸, ${kg(pt.weightKg)}kg, 체지방 ${pct1(pt.bfPct)}%`} />
        <View style={s.info}>
          <Text style={s.title} numberOfLines={2}>{title}</Text>
          <Text style={s.when}>{month === 0 ? '지금' : `${month}개월 뒤`}</Text>
          <Text style={s.num}>{kg(pt.weightKg)}kg</Text>
          <Text style={s.bf}>체지방 {pct1(pt.bfPct)}%</Text>
          <Text style={s.hint}>{has3D(sex) ? '몸을 좌우로 밀면 돌아가요\n아래 막대로 달을 바꿔 보세요' : '아래 막대로 달을 바꿔 보세요'}</Text>
        </View>
      </View>
      <View
        style={s.bar}
        onLayout={(e: LayoutChangeEvent) => { barW.current = Math.max(1, e.nativeEvent.layout.width); }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={seek}
        onResponderMove={seek}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="개월 선택"
        accessibilityValue={{ min: 0, max: months, now: month, text: month === 0 ? '지금' : `${month}개월 뒤` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          playing.current = false;
          setMonth((m) => Math.min(months, Math.max(0, m + (e.nativeEvent.actionName === 'increment' ? 1 : -1))));
        }}
      >
        <View style={s.track} pointerEvents="none">
          <View style={[s.fill, { width: `${pct * 100}%` }]} />
        </View>
        <View style={[s.thumb, { left: `${pct * 100}%` }]} pointerEvents="none" />
      </View>
      <View style={s.ends} pointerEvents="none">
        <Text style={s.endTxt}>지금</Text>
        <Text style={s.endTxt}>{months}개월</Text>
      </View>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  card: {
    backgroundColor: colors.panel, borderRadius: 18, padding: 14, paddingBottom: 10,
    borderWidth: 1, borderColor: colors.line, marginBottom: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  info: { flex: 1 },
  title: { fontSize: 12, fontWeight: '700', color: colors.mid, marginBottom: 8 },
  when: { fontSize: 13, fontWeight: '800', color: colors.muted, letterSpacing: 0.5 },
  num: { fontSize: 28, fontWeight: '800', color: colors.ink, marginTop: 4, fontVariant: ['tabular-nums'] },
  bf: { fontSize: 15, fontWeight: '700', color: colors.mid, marginTop: 2, fontVariant: ['tabular-nums'] },
  hint: { fontSize: 11.5, color: colors.muted, marginTop: 12, lineHeight: 17 },
  bar: { height: 36, justifyContent: 'center', marginTop: 8, marginHorizontal: 8 },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.panel3, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: colors.ink },
  thumb: {
    position: 'absolute', width: 20, height: 20, borderRadius: 10, marginLeft: -10, top: 8,
    backgroundColor: colors.ink, borderWidth: 3, borderColor: colors.bg,
  },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 2 },
  endTxt: { fontSize: 10.5, color: colors.muted, fontWeight: '700' },
}));
