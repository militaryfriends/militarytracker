/**
 * 내 목표로 정하기 — 카드 4장 밖의 5번째 선택지(2026-11-27 대표 결정).
 * "10kg 빼고 싶어요"(무게) · "결혼식까지 3개월"(기간) — 도착점을 사용자가 정하면 엔진(planTarget)이 현실적인 길을 낸다.
 * 무리한 목표는 깎아서 그대로 말한다(체지방 하한 · 24개월 한도) — 숨기거나 부풀리지 않는다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, themed, useThemeMode } from '../../theme';
import { PressableScale } from '../../ui';
import { planTarget, type TargetAsk, type TargetPlan } from '../../utils/projection';
import type { BodyAnalysis } from '../../types';
import { ProjectGridCard } from './ProjectCard';
import { kg } from './format';

type Mode = 'kg' | 'months';
/** 날짜 칩은 3개월부터 — 감량 + 고정 3개월이 붙어 어떤 목표도 6개월 아래 프로젝트가 되지 않는다(대표 결정 "전부 최소 6개월") */
const MONTH_CHIPS = [3, 6, 9, 12] as const;

export function targetPlanOf(a: BodyAnalysis, ask: TargetAsk): TargetPlan | null {
  const i = a.input;
  try {
    return planTarget({ sex: i.sex, age: i.age, heightCm: i.heightCm, level: i.level, days: i.days, start: a.comp, waistCm: i.waistCm }, ask);
  } catch {
    return null;
  }
}

export function TargetPanel({
  analysis, selected, onPick, onClear, width, disabled,
}: {
  analysis: BodyAnalysis;
  selected: boolean;
  onPick: (plan: TargetPlan, ask: TargetAsk) => void;
  /** 고른 상태에서 입력을 지우거나 바꿔 계산이 없어지면 — 위 카드(추천)로 돌아간다 */
  onClear?: () => void;
  width: number;
  disabled?: boolean;
}) {
  useThemeMode();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('kg');
  const [kgText, setKgText] = useState('');
  const [months, setMonths] = useState<number | null>(null);
  const w0 = analysis.input.weightKg;

  const ask = useMemo<TargetAsk | null>(() => {
    if (mode === 'kg') {
      const v = Number(kgText.replace(',', '.'));
      if (!Number.isFinite(v) || v < 30 || v > 250) return null;
      return { kg: v };
    }
    return months ? { months } : null;
  }, [mode, kgText, months]);
  const plan = useMemo(() => (ask ? targetPlanOf(analysis, ask) : null), [analysis, ask]);
  const same = mode === 'kg' && ask && !plan;

  // 고른 뒤 무게 · 기간을 바꾸면 고른 것도 따라간다 — 화면엔 새 목표가 '선택됨'인데 시작 버튼은 옛 목표로 가던 문제(11/27 밤 점검)
  const cb = useRef({ onPick, onClear });
  cb.current = { onPick, onClear };
  const selRef = useRef(selected);
  selRef.current = selected;
  useEffect(() => {
    if (!selRef.current) return;
    if (plan && ask) cb.current.onPick(plan, ask);
    else cb.current.onClear?.();
  }, [plan, ask]);

  if (!open) {
    return (
      <PressableScale style={s.openBtn} onPress={() => setOpen(true)} disabled={disabled} accessibilityRole="button" accessibilityLabel="내 목표로 정하기">
        <Text style={s.openTitle}>내 목표로 정하기</Text>
        <Text style={s.openSub}>"10kg 빼고 싶어요" · "3개월 뒤 결혼식" — 원하는 만큼 정하면 현실적인 기간을 계산해요</Text>
      </PressableScale>
    );
  }

  return (
    <View style={[s.box, selected && s.boxOn]}>
      <Text style={s.head}>내 목표로 정하기</Text>
      <View style={s.seg} accessibilityRole="tablist">
        {([['kg', '몸무게로'], ['months', '기간으로']] as const).map(([m, label]) => (
          <PressableScale key={m} style={[s.segBtn, mode === m && s.segOn]} onPress={() => setMode(m)}
            accessibilityRole="tab" accessibilityState={{ selected: mode === m }}>
            <Text style={[s.segTxt, mode === m && s.segTxtOn]}>{label}</Text>
          </PressableScale>
        ))}
      </View>

      {mode === 'kg' ? (
        <View style={s.row}>
          <TextInput
            style={s.input}
            value={kgText}
            onChangeText={setKgText}
            placeholder={`${Math.round(w0 - 5)}`}
            placeholderTextColor={colors.placeholder}
            keyboardType="decimal-pad"
            maxLength={5}
            accessibilityLabel="목표 몸무게 (kg)"
          />
          <Text style={s.unit}>kg</Text>
          <Text style={s.now}>지금 {kg(w0)}kg</Text>
        </View>
      ) : (
        <>
          <Text style={s.q}>그날까지 남은 기간</Text>
          <View style={s.chips}>
            {MONTH_CHIPS.map((m) => (
              <PressableScale key={m} style={[s.chip, months === m && s.chipOn]} onPress={() => setMonths(m)}
                accessibilityRole="button" accessibilityState={{ selected: months === m }}>
                <Text style={[s.chipTxt, months === m && s.chipTxtOn]}>{m}개월</Text>
              </PressableScale>
            ))}
          </View>
        </>
      )}

      {same ? <Text style={s.cap}>지금 몸무게와 같아요. 몸무게 대신 아래 카드의 몸 모양을 골라 보세요.</Text> : null}
      {plan ? (
        <>
          {plan.capReason ? <Text style={s.cap}>{plan.capReason}. 그 몸으로 계산했어요.</Text> : null}
          <View style={{ marginTop: 10, alignItems: 'center' }}>
            <ProjectGridCard sex={analysis.input.sex} project={plan.card} selected={selected} width={Math.min(width, 260)}
              onPress={disabled ? undefined : () => onPick(plan, ask!)} />
          </View>
          {!selected && !disabled ? (
            <PressableScale style={s.pick} onPress={() => onPick(plan, ask!)} accessibilityRole="button">
              <Text style={s.pickTxt}>이 목표로 고르기</Text>
            </PressableScale>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  openBtn: {
    marginTop: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line2,
    backgroundColor: colors.panel,
  },
  openTitle: { fontSize: 14.5, fontWeight: '800', color: colors.ink },
  openSub: { fontSize: 12, color: colors.muted, marginTop: 4, lineHeight: 17 },
  box: { marginTop: 12, padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.panel },
  boxOn: { borderColor: colors.ink },
  head: { fontSize: 14.5, fontWeight: '800', color: colors.ink },
  seg: { flexDirection: 'row', gap: 6, marginTop: 10 },
  segBtn: { flex: 1, minHeight: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line },
  segOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  segTxt: { fontSize: 13, fontWeight: '700', color: colors.mid },
  segTxtOn: { color: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  input: {
    flex: 1, minWidth: 0, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line2, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 22, fontWeight: '700', color: colors.ink,
  },
  unit: { fontSize: 16, fontWeight: '700', color: colors.mid },
  now: { fontSize: 12, color: colors.muted, marginLeft: 4 },
  q: { fontSize: 12.5, color: colors.mid, marginTop: 12, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { paddingHorizontal: 12, minHeight: 36, borderRadius: 999, justifyContent: 'center', backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipTxt: { fontSize: 13, fontWeight: '700', color: colors.mid },
  chipTxtOn: { color: colors.bg },
  cap: { fontSize: 12.5, color: colors.ink, marginTop: 10, lineHeight: 18, fontWeight: '600' },
  pick: { marginTop: 10, alignSelf: 'center', paddingHorizontal: 16, minHeight: 40, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: colors.ink },
  pickTxt: { fontSize: 13, fontWeight: '800', color: colors.ink },
}));
