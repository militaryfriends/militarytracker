/**
 * 온보딩 — 질문 하나에 화면 하나(12단계 "투자형" 온보딩, 대표 피드백 10/31 1절).
 * 숫자 칸은 화면에 들어오면 바로 키패드가 뜨고(autoFocus), 키패드의 '완료'가 '다음'을 누른다 — 키패드가 다음 버튼을 가려도 막히지 않게.
 */
import { useEffect, useRef } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, useThemeMode } from '../../theme';
import type { FocusPart, UserProfile } from '../../types';
import { Opt, StepHead, type Update } from './basicSteps';
import { o } from './styles';

export function StepSex({ p, update, num, total }: { p: UserProfile; update: Update; num: number; total: number }) {
  useThemeMode();
  return (
    <View>
      <StepHead num={num} total={total} q="성별을 알려주세요" desc="몸을 계산하는 공식과 3D 몸이 달라져요." />
      <Opt label="남성" on={p.sex === 'male'} onPress={() => update('sex', 'male')} />
      <Opt label="여성" on={p.sex === 'female'} onPress={() => update('sex', 'female')} />
    </View>
  );
}

/** 숫자 하나 — 나이 · 키 · 체중 */
export function StepNumber({
  num, total, q, desc, value, onChange, unit, placeholder, decimal = false, error, onSubmit,
}: {
  num: number; total: number; q: string; desc?: string; value: string; onChange: (v: string) => void;
  unit: string; placeholder: string; decimal?: boolean; error?: string | null; onSubmit: () => void;
}) {
  useThemeMode();
  const ref = useRef<TextInput>(null);
  // 단계가 바뀌어 다시 그려질 때도 키패드를 띄운다
  useEffect(() => {
    const t = setTimeout(() => ref.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <View>
      <StepHead num={num} total={total} q={q} desc={desc} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TextInput
          ref={ref}
          style={[o.input, { flex: 1, fontSize: 28, fontWeight: '700', paddingVertical: 16 }, error ? o.inputErr : null]}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          returnKeyType="next"
          value={value}
          onChangeText={onChange}
          onSubmitEditing={onSubmit}
          accessibilityLabel={q.replace(/\n/g, ' ')}
          maxLength={5}
        />
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.mid, minWidth: 36 }}>{unit}</Text>
      </View>
      {error ? <Text style={o.err}>{error}</Text> : null}
    </View>
  );
}

export function StepLevel({ p, update, num, total }: { p: UserProfile; update: Update; num: number; total: number }) {
  useThemeMode();
  return (
    <View>
      <StepHead num={num} total={total} q={'운동 경력이\n어느 정도인가요?'} desc="종목은 같고, 세트 · 강도가 경력에 맞춰져요." />
      <Opt label="입문" sub="3개월 미만 · 머신과 기본 동작부터" on={p.level === 1} onPress={() => update('level', 1)} />
      <Opt label="중급" sub="분할 운동 경험 있음" on={p.level === 2} onPress={() => update('level', 2)} />
      <Opt label="상급" sub="프리웨이트가 메인" on={p.level === 3} onPress={() => update('level', 3)} />
    </View>
  );
}

export function StepPlace({ p, update, num, total }: { p: UserProfile; update: Update; num: number; total: number }) {
  useThemeMode();
  return (
    <View>
      <StepHead num={num} total={total} q={'어디서 운동하나요?'} />
      <Opt label="헬스장" sub="바벨 · 머신 · 케이블이 다 있어요" on={p.env === 'gym'} onPress={() => update('env', 'gym')} />
      <Opt label="홈트레이닝" sub="맨몸 · 덤벨 · 밴드" on={p.env === 'home'} onPress={() => update('env', 'home')} />
    </View>
  );
}

export function StepDays({ p, update, num, total }: { p: UserProfile; update: Update; num: number; total: number }) {
  useThemeMode();
  return (
    <View>
      <StepHead num={num} total={total} q={'일주일에 며칠\n운동할 수 있나요?'} desc="무리 없이 지킬 수 있는 날짜로 골라 주세요." />
      <View style={o.chipRow}>
        {([2, 3, 4, 5, 6] as const).map((d) => (
          <TouchableOpacity activeOpacity={0.7} key={d} style={[o.chip, { minWidth: 72, alignItems: 'center' }, p.days === d && o.chipOn]} onPress={() => update('days', d)}
            accessibilityRole="radio" accessibilityState={{ selected: p.days === d }}>
            <Text style={[o.chipTxt, p.days === d && o.chipOnTxt]}>주 {d}일</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const FOCUS: { k: FocusPart; label: string }[] = [
  { k: 'chest', label: '가슴' }, { k: 'back', label: '등' }, { k: 'shoulders', label: '어깨' },
  { k: 'arms', label: '팔' }, { k: 'abs', label: '복근 · 뱃살' }, { k: 'legs', label: '하체 · 엉덩이' },
];

export function StepFocus({ p, update, num, total }: { p: UserProfile; update: Update; num: number; total: number }) {
  useThemeMode();
  const on = new Set(p.focus ?? []);
  const toggle = (k: FocusPart) => {
    const next = new Set(on);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    update('focus', [...next]);
  };
  return (
    <View>
      <StepHead num={num} total={total} q={'특히 신경 쓰이는\n부위가 있나요?'} desc="선택 사항이에요. 루틴에 그 부위 보조 종목을 하나씩 더해요." />
      <View style={o.chipRow}>
        {FOCUS.map((f) => (
          <TouchableOpacity activeOpacity={0.7} key={f.k} style={[o.chip, on.has(f.k) && o.chipOn]} onPress={() => toggle(f.k)}
            accessibilityRole="checkbox" accessibilityState={{ checked: on.has(f.k) }}>
            <Text style={[o.chipTxt, on.has(f.k) && o.chipOnTxt]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
