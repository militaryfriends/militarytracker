/**
 * AI 코치 답변 아래 카드 — 식단(끼니 · 음식별 양 · 합계)과 WARNING.
 * 숫자는 서버가 식품표로 계산한 값이다(functions/src/coachMeal.ts). 화면은 그리기만 한다.
 */
import { View, Text, StyleSheet } from 'react-native';
import { colors, themed, useThemeMode } from '../theme';
import { FONT } from '../ui';
import type { CoachMeal } from '../services/aiService';

const fmtQty = (q: number, u: string) => `${Number.isInteger(q) ? q : q.toFixed(1)}${u}`;

export function MealCard({ meal }: { meal: CoachMeal }) {
  useThemeMode();
  const approx = meal.items.some((i) => i.approx);
  return (
    <View style={s.card} accessible accessibilityLabel={`${meal.t} 식단 ${meal.kcal}킬로칼로리, 단백질 ${meal.p}그램`}>
      <View style={s.head}>
        <Text style={s.title}>{meal.t} 식단</Text>
        {meal.dayKcal ? <Text style={s.pct}>목표의 {meal.pct}%</Text> : null}
      </View>
      {meal.items.map((i, k) => (
        <View key={`${i.n}-${k}`} style={s.row}>
          <Text style={s.food} numberOfLines={1}>{i.n}</Text>
          <Text style={s.qty}>{fmtQty(i.q, i.u)}</Text>
        </View>
      ))}
      <View style={s.bar}>
        <View style={[s.barFill, { width: `${Math.min(100, Math.max(4, meal.pct))}%` }]} />
      </View>
      <View style={s.total}>
        <Text style={s.totalLabel}>합계</Text>
        <Text style={s.totalNum}>{meal.kcal.toLocaleString()}kcal · 단백질 {meal.p}g</Text>
      </View>
      <Text style={s.note}>
        {meal.dayKcal ? `하루 목표 ${meal.dayKcal.toLocaleString()}kcal 기준 · ` : ''}
        {approx ? '일부 음식은 근사치' : '식품성분표 기준 근사치'}
      </Text>
    </View>
  );
}

export function WarningCard({ text }: { text: string }) {
  useThemeMode();
  return (
    <View style={s.warn} accessible accessibilityRole="alert" accessibilityLabel={`경고. ${text}`}>
      <Text style={s.warnTag}>WARNING</Text>
      <Text style={s.warnTxt}>{text}</Text>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  card: {
    alignSelf: 'flex-start', width: '88%', marginTop: 6,
    backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line2,
    borderRadius: 14, padding: 14, gap: 8,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  title: { fontSize: 14, fontWeight: '700', color: colors.ink },
  pct: { fontSize: 12, color: colors.mid, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  food: { flex: 1, fontSize: 14, color: colors.ink },
  qty: { fontSize: 15, color: colors.ink, fontFamily: FONT.num },
  bar: { height: 4, borderRadius: 2, backgroundColor: colors.track, marginTop: 4, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2, backgroundColor: colors.accent },
  total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  totalLabel: { fontSize: 12, color: colors.mid },
  totalNum: { fontSize: 15, fontWeight: '700', color: colors.ink, fontFamily: FONT.num },
  note: { fontSize: 11, color: colors.muted },
  warn: {
    alignSelf: 'flex-start', width: '88%', marginTop: 6,
    backgroundColor: colors.wrongBg, borderWidth: 1, borderColor: colors.wrongLine,
    borderRadius: 14, padding: 14, gap: 4,
  },
  warnTag: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: colors.wrong },
  warnTxt: { fontSize: 14, lineHeight: 21, color: colors.ink, fontWeight: '600' },
}));
