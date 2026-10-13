/**
 * O3 현재 체형 상세 — 키·체중만 = 정확도 기본, + 허리 = 좋음, + 인바디 = 높음.
 * 입력이 늘 때마다 정확도 미터가 한 칸씩 차오른다(입력할수록 정확해진다는 걸 눈으로 보이게).
 * 허리는 권장(건너뛸 수 있다), 인바디는 토글(기본 꺼짐).
 */
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { colors, themed, useThemeMode } from '../../theme';
import { SPRING, haptic } from '../../ui';
import { ACCURACY_LABEL, type Accuracy } from '../../utils/bodyComp';
import { parseNum } from '../../utils/body';
import type { InbodyDraft } from '../../stores/onboardDraft';
import { StepHead } from './basicSteps';
import { o } from './styles';

export interface BodyErrors {
  waist?: string | null;
  bf?: string | null;
  smm?: string | null;
  date?: string | null;
  /** 경고 — 진행은 된다 */
  stale?: boolean;
}

const LEVEL: Record<Accuracy, number> = { basic: 1, good: 2, high: 3 };

export function AccuracyMeter({ accuracy, compact = false }: { accuracy: Accuracy; compact?: boolean }) {
  useThemeMode();
  const n = LEVEL[accuracy];
  if (compact) {
    // 결과 화면용 한 줄 — "정확도 ●●○ 좋음"
    return (
      <View style={m.compact} accessibilityRole="text" accessibilityLabel={`정확도 ${ACCURACY_LABEL[accuracy]}`}>
        <Text style={m.compactLabel}>정확도</Text>
        {[1, 2, 3].map((i) => <View key={i} style={[m.dot, i <= n && m.dotOn]} />)}
        <Text style={m.compactValue}>{ACCURACY_LABEL[accuracy]}</Text>
      </View>
    );
  }
  return (
    <View style={m.row} accessibilityRole="text" accessibilityLabel={`정확도 ${ACCURACY_LABEL[accuracy]}`}>
      <Text style={m.label}>정확도</Text>
      <View style={m.bars}>
        {[1, 2, 3].map((i) => <Bar key={i} on={i <= n} />)}
      </View>
      <Text style={m.value}>{ACCURACY_LABEL[accuracy]}</Text>
    </View>
  );
}

function Bar({ on }: { on: boolean }) {
  useThemeMode();
  const v = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    v.value = withSpring(on ? 1 : 0, SPRING.fill);
  }, [on, v]);
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: v.value }] }));
  return (
    <View style={m.bar}>
      <Animated.View style={[m.fill, fill]} />
    </View>
  );
}

export function StepBody({
  num, total, waist, inbody, accuracy, errors, onWaist, onInbody,
}: {
  num: number;
  total: number;
  waist: string;
  inbody: InbodyDraft;
  accuracy: Accuracy;
  errors: BodyErrors;
  onWaist: (v: string) => void;
  onInbody: (v: InbodyDraft) => void;
}) {
  useThemeMode();
  const [guide, setGuide] = useState(false);
  const [inch, setInch] = useState('');
  const inchCm = parseNum(inch) * 2.54;

  return (
    <View>
      <StepHead num={num} total={total} q="지금 몸을 조금 더 정확하게 알려주세요" />
      <AccuracyMeter accuracy={accuracy} />

      <View style={s.labelRow}>
        <Text style={o.label}>허리둘레 (cm) · 권장</Text>
        <TouchableOpacity onPress={() => setGuide(true)} hitSlop={10} accessibilityRole="button">
          <Text style={s.link}>재는 법</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={[o.input, errors.waist && o.inputErr]}
        placeholder="예: 84" placeholderTextColor={colors.muted} keyboardType="decimal-pad"
        value={waist} onChangeText={onWaist} accessibilityLabel="허리둘레 (cm)"
      />
      {errors.waist ? <Text style={o.err}>{errors.waist}</Text> : <Text style={s.hint}>비워 두고 넘어가도 돼요. 넣으면 정확도가 '좋음'이 됩니다.</Text>}

      <View style={s.toggle}>
        <View style={{ flex: 1 }}>
          <Text style={s.toggleTitle}>인바디 결과가 있어요</Text>
          <Text style={s.toggleSub}>있으면 예측이 훨씬 정확해져요</Text>
        </View>
        <Switch
          value={inbody.on}
          onValueChange={(v) => { haptic.select(); onInbody({ ...inbody, on: v }); }}
          trackColor={{ false: colors.line2, true: colors.ink }}
          thumbColor={inbody.on ? colors.bg : colors.mid}
          accessibilityLabel="인바디 결과가 있어요"
        />
      </View>

      {inbody.on ? (
        <View>
          <View style={o.grid2}>
            <View style={{ flex: 1 }}>
              <Text style={o.label}>체지방률 (%)</Text>
              <TextInput style={[o.input, errors.bf && o.inputErr]} placeholder="22.5" placeholderTextColor={colors.muted}
                keyboardType="decimal-pad" value={inbody.bf} onChangeText={(v) => onInbody({ ...inbody, bf: v })}
                accessibilityLabel="체지방률 (%)" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={o.label}>골격근량 (kg)</Text>
              <TextInput style={[o.input, errors.smm && o.inputErr]} placeholder="32.1" placeholderTextColor={colors.muted}
                keyboardType="decimal-pad" value={inbody.smm} onChangeText={(v) => onInbody({ ...inbody, smm: v })}
                accessibilityLabel="골격근량 (kg)" />
            </View>
          </View>
          {errors.bf ? <Text style={o.err}>{errors.bf}</Text> : null}
          {errors.smm ? <Text style={o.err}>{errors.smm}</Text> : null}
          <Text style={o.label}>측정일</Text>
          <TextInput style={[o.input, errors.date && o.inputErr]} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted}
            keyboardType="numbers-and-punctuation" value={inbody.date} onChangeText={(v) => onInbody({ ...inbody, date: v })}
            maxLength={10} accessibilityLabel="측정일 (YYYY-MM-DD)" />
          {errors.date ? <Text style={o.err}>{errors.date}</Text> : errors.stale ? <Text style={o.warn}>오래된 결과는 정확도가 떨어져요</Text> : null}
        </View>
      ) : null}

      <Modal visible={guide} transparent animationType="slide" onRequestClose={() => setGuide(false)}>
        <Pressable style={s.scrim} onPress={() => setGuide(false)} accessibilityRole="button" accessibilityLabel="닫기" />
        <View style={s.sheet}>
          <Text style={s.sheetTitle}>허리둘레 재는 법</Text>
          <Text style={s.sheetTxt}>배꼽 높이에서, 숨을 편하게 내쉬고, 줄자가 파고들지 않게 잽니다.</Text>
          <Text style={[o.label, { marginTop: 18 }]}>줄자가 없으면 — 바지 허리 사이즈(인치) × 2.54</Text>
          <View style={s.inchRow}>
            <TextInput style={[o.input, { flex: 1 }]} placeholder="예: 32" placeholderTextColor={colors.muted}
              keyboardType="decimal-pad" value={inch} onChangeText={setInch} accessibilityLabel="바지 허리 사이즈 (인치)" />
            <TouchableOpacity
              style={[s.inchBtn, !(inchCm > 0) && o.btnOff]}
              disabled={!(inchCm > 0)}
              onPress={() => { onWaist(String(Math.round(inchCm * 10) / 10)); setGuide(false); setInch(''); }}
              accessibilityRole="button"
            >
              <Text style={s.inchBtnTxt}>{inchCm > 0 ? `${Math.round(inchCm * 10) / 10}cm 넣기` : 'cm 로 바꾸기'}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={o.textBtn} onPress={() => setGuide(false)} accessibilityRole="button">
            <Text style={[o.textBtnTxt, { textDecorationLine: 'none' }]}>닫기</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const m = themed(() => StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.panel2,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.line,
  },
  compact: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  compactLabel: { fontSize: 11.5, color: colors.muted, fontWeight: '600', marginRight: 2 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.panel3, borderWidth: 1, borderColor: colors.line2 },
  dotOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  compactValue: { fontSize: 11.5, color: colors.mid, fontWeight: '800', marginLeft: 2 },
  label: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  bars: { flexDirection: 'row', gap: 4, flex: 1 },
  bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.panel3, overflow: 'hidden' },
  fill: { flex: 1, backgroundColor: colors.ink, transformOrigin: 'left' },
  value: { fontSize: 13, color: colors.ink, fontWeight: '800', minWidth: 30, textAlign: 'right' },
}));

const s = themed(() => StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  link: { fontSize: 12, color: colors.mid, fontWeight: '700', textDecorationLine: 'underline', marginBottom: 6 },
  hint: { fontSize: 11.5, color: colors.muted, marginTop: 6, lineHeight: 17 },
  toggle: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 22,
    backgroundColor: colors.panel, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.line,
  },
  toggleTitle: { fontSize: 14.5, fontWeight: '700', color: colors.ink },
  toggleSub: { fontSize: 11.5, color: colors.muted, marginTop: 3 },
  scrim: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.panel, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: 22, paddingBottom: 34, borderTopWidth: 1, borderColor: colors.line2,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  sheetTxt: { fontSize: 14, color: colors.mid, lineHeight: 22, marginTop: 8 },
  inchRow: { flexDirection: 'row', gap: 8 },
  inchBtn: { backgroundColor: colors.ink, borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center' },
  inchBtnTxt: { color: colors.bg, fontWeight: '700', fontSize: 13 },
}));
