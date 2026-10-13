/**
 * 온보딩에서 예전 그대로 쓰는 단계 — O1 기본 정보 · O4 환경·경력 · O5 식사 환경 · (습관 경로) 루틴 선택.
 * 화면 문구 · 검증은 예전 app/onboard.tsx 와 같다. 단계 번호만 바깥에서 받는다.
 */
import {
  ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { colors, themed, useThemeMode } from '../../theme';
import type { UserProfile } from '../../types';
import { ProBadge } from '../ProLock';
import { ROUTINES, routineExCount } from '../../data/routines';
import { o } from './styles';

export type Update = <K extends keyof UserProfile>(k: K, v: UserProfile[K]) => void;

export function StepHead({ num, total, q, desc }: { num: number; total: number; q: string; desc?: string }) {
  useThemeMode();
  return (
    <>
      <Text style={o.stepNum}>STEP {num} / {total}</Text>
      <Text style={o.q} accessibilityRole="header">{q}</Text>
      {desc ? <Text style={o.desc}>{desc}</Text> : null}
    </>
  );
}

export function Opt({ label, sub, on, onPress }: { label: string; sub?: string; on: boolean; onPress: () => void }) {
  useThemeMode();
  return (
    <TouchableOpacity activeOpacity={0.7} style={[o.opt, on && o.optOn]} onPress={onPress}
      accessibilityRole="radio" accessibilityState={{ selected: on }}>
      <View style={{ flex: 1 }}>
        <Text style={[o.optTxt, on && o.optTxtOn]}>{label}</Text>
        {sub ? <Text style={o.optSub}>{sub}</Text> : null}
      </View>
      <Text style={[o.optDot, on && o.optDotOn]}>{on ? '●' : '○'}</Text>
    </TouchableOpacity>
  );
}

// ─── O1 기본 정보 ──────────────────────────────────────────────────────────
export function StepBasic({ p, update, num, total }: { p: UserProfile; update: Update; num: number; total: number }) {
  useThemeMode();
  return (
    <View>
      <StepHead num={num} total={total} q={'기본 신체 정보를\n알려주세요'} desc="지금 몸을 계산하는 기준이 됩니다." />
      <View style={o.grid2}>
        <Opt label="남성" on={p.sex === 'male'} onPress={() => update('sex', 'male')} />
        <Opt label="여성" on={p.sex === 'female'} onPress={() => update('sex', 'female')} />
      </View>

      <Text style={o.label}>나이</Text>
      <TextInput style={o.input} placeholder="25" placeholderTextColor={colors.muted} keyboardType="numeric" value={p.age}
        onChangeText={(v) => update('age', v)} accessibilityLabel="나이" />

      <View style={o.grid2}>
        <View style={{ flex: 1 }}>
          <Text style={o.label}>키 (cm)</Text>
          <TextInput style={o.input} placeholder="175" placeholderTextColor={colors.muted} keyboardType="decimal-pad" value={p.height}
            onChangeText={(v) => update('height', v)} accessibilityLabel="키 (cm)" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={o.label}>몸무게 (kg)</Text>
          <TextInput style={o.input} placeholder="72" placeholderTextColor={colors.muted} keyboardType="decimal-pad" value={p.weight}
            onChangeText={(v) => update('weight', v)} accessibilityLabel="몸무게 (kg)" />
        </View>
      </View>
    </View>
  );
}

// ─── O4 환경 · 경력 ────────────────────────────────────────────────────────
export function StepEnv({ p, update, num, total }: { p: UserProfile; update: Update; num: number; total: number }) {
  useThemeMode();
  return (
    <View>
      <StepHead num={num} total={total} q={'어디서, 얼마나\n운동하나요?'} />
      <View style={o.grid2}>
        <Opt label="헬스장" on={p.env === 'gym'} onPress={() => update('env', 'gym')} />
        <Opt label="홈트레이닝" on={p.env === 'home'} onPress={() => update('env', 'home')} />
      </View>

      <Text style={o.label}>주당 운동 일수</Text>
      <View style={o.chipRow}>
        {([2, 3, 4, 5, 6] as const).map((d) => (
          <TouchableOpacity activeOpacity={0.7} key={d} style={[o.chip, p.days === d && o.chipOn]} onPress={() => update('days', d)}
            accessibilityRole="radio" accessibilityState={{ selected: p.days === d }}>
            <Text style={[o.chipTxt, p.days === d && o.chipOnTxt]}>주 {d}일</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={o.label}>운동 경력</Text>
      <Opt label="입문" sub="3개월 미만 · 머신과 기본 동작 위주" on={p.level === 1} onPress={() => update('level', 1)} />
      <Opt label="중급" sub="분할 운동 경험 있음" on={p.level === 2} onPress={() => update('level', 2)} />
      <Opt label="상급" sub="프리웨이트 메인" on={p.level === 3} onPress={() => update('level', 3)} />
    </View>
  );
}

// ─── O5 식사 환경 ──────────────────────────────────────────────────────────
export function StepFood({ p, update, num, total }: { p: UserProfile; update: Update; num: number; total: number }) {
  useThemeMode();
  return (
    <View>
      <StepHead num={num} total={total} q={'식사 환경을\n알려주세요'} desc="목표 몸까지 현실적인 식단을 구성합니다." />
      <Opt label="편의점 위주" on={p.food === 'convenience'} onPress={() => update('food', 'convenience')} />
      <Opt label="자취 · 직접 요리" on={p.food === 'self'} onPress={() => update('food', 'self')} />
      <Opt label="집밥" on={p.food === 'family'} onPress={() => update('food', 'family')} />
      <Opt label="외식이 잦음" on={p.food === 'out'} onPress={() => update('food', 'out')} />
      <Text style={o.label}>알레르기 · 제외할 음식 (선택)</Text>
      <TextInput style={o.input} placeholder="예: 유제품, 갑각류" placeholderTextColor={colors.muted} value={p.allergy}
        onChangeText={(v) => update('allergy', v)} accessibilityLabel="알레르기 · 제외할 음식" />
    </View>
  );
}

// ─── (습관 경로) 루틴 선택 — 예전 Step 5 ────────────────────────────────────
export function StepRoutine({
  num, total, recommendedId, canAI, place, loading, onPreset, onAI, onReco,
}: {
  num: number;
  total: number;
  /** null 이면 추천이 잠겨 있다 — 배지도 정렬도 걸지 않는다 */
  recommendedId: string | null;
  canAI: boolean;
  place: UserProfile['env'];
  loading: string | null;
  onPreset: (id: string) => void;
  onAI: () => void;
  onReco: () => void;
}) {
  useThemeMode();
  const list = [...ROUTINES].sort((a, b) => {
    if (recommendedId) {
      if (a.id === recommendedId) return -1;
      if (b.id === recommendedId) return 1;
    }
    return (a.place.includes(place) ? 0 : 1) - (b.place.includes(place) ? 0 : 1);
  });

  return (
    <View>
      <StepHead num={num} total={total} q="루틴을 선택하세요" desc="선택한 루틴이 내 플랜이 됩니다. 나중에 언제든 바꿀 수 있어요." />

      {/* 구독 전엔 잠긴 카드가 화면에서 가장 눈에 띄는 요소가 되지 않도록 고스트 스타일로 낮춘다 */}
      <TouchableOpacity activeOpacity={0.7}
        style={[canAI ? r.aiCard : r.aiCardLocked, loading === 'ai' && o.btnOff]}
        onPress={onAI}
        disabled={!!loading}
        accessibilityRole="button"
        accessibilityLabel={canAI ? 'AI 맞춤 구성' : 'AI 맞춤 구성, 구독 기능'}
      >
        {loading === 'ai' ? (
          <ActivityIndicator color={canAI ? colors.bg : colors.ink} />
        ) : (
          <>
            <View style={r.aiHead}>
              <Text style={canAI ? r.aiTitle : r.aiTitleLocked}>AI 맞춤 구성</Text>
              {!canAI && <ProBadge />}
            </View>
            <Text style={canAI ? r.aiSub : r.aiSubLocked}>
              {canAI ? '입력한 정보로 종목까지 직접 골라 드립니다' : '구독 기능입니다. 아래 루틴은 지금 바로 무료로 쓸 수 있어요'}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {!recommendedId && (
        <TouchableOpacity activeOpacity={0.7} style={r.recoLock} onPress={onReco} disabled={!!loading}>
          <Text style={r.recoLockTxt}>내 조건에 맞는 루틴 추천받기</Text>
          <ProBadge />
        </TouchableOpacity>
      )}

      <Text style={o.label}>루틴 라이브러리</Text>
      {list.map((x) => (
        <TouchableOpacity activeOpacity={0.7}
          key={x.id}
          style={[r.rCard, !!recommendedId && x.id === recommendedId && r.rCardRec, loading === x.id && o.btnOff]}
          onPress={() => onPreset(x.id)}
          disabled={!!loading}
        >
          <View style={r.rHead}>
            <Text style={r.rName}>{x.name}</Text>
            {!!recommendedId && x.id === recommendedId && (
              <View style={r.recBadge}><Text style={r.recBadgeTxt}>추천</Text></View>
            )}
          </View>
          <Text style={r.rSub}>{x.subtitle}</Text>
          <View style={r.rMetaRow}>
            <Text style={r.rMeta}>{x.days.length}개 데이</Text>
            <Text style={r.rDot}>·</Text>
            <Text style={r.rMeta}>{routineExCount(x)}종목</Text>
            <Text style={r.rDot}>·</Text>
            <Text style={r.rMeta}>{x.place.includes('home') ? '홈트 가능' : '헬스장'}</Text>
          </View>
          {loading === x.id && <ActivityIndicator color={colors.mid} style={{ marginTop: 8 }} />}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const r = themed(() => StyleSheet.create({
  aiCard: {
    backgroundColor: colors.ink, borderRadius: 16, padding: 18,
    alignItems: 'center', marginTop: 4, minHeight: 78, justifyContent: 'center',
  },
  aiCardLocked: {
    backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line2, borderRadius: 16,
    padding: 18, alignItems: 'center', marginTop: 4, minHeight: 78, justifyContent: 'center',
  },
  aiTitleLocked: { fontSize: 15, fontWeight: '700', color: colors.mid },
  aiSubLocked: { fontSize: 12, color: colors.muted, marginTop: 4, lineHeight: 18 },
  aiHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  aiTitle: { fontSize: 16, fontWeight: '800', color: colors.bg },
  aiSub: { fontSize: 12, color: colors.onAccentSub, marginTop: 4, lineHeight: 18 },
  recoLock: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    backgroundColor: colors.panel2, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: colors.line2, marginTop: 10,
  },
  recoLockTxt: { fontSize: 13, fontWeight: '600', color: colors.mid, flexShrink: 1 },
  rCard: {
    backgroundColor: colors.panel, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.line, marginBottom: 10,
  },
  rCardRec: { borderColor: colors.line2, backgroundColor: colors.panel2 },
  rHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  recBadge: { backgroundColor: colors.panel3, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  recBadgeTxt: { fontSize: 10, fontWeight: '800', color: colors.ink, letterSpacing: 0.5 },
  rSub: { fontSize: 12, color: colors.muted, marginTop: 4 },
  rMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  rMeta: { fontSize: 11, color: colors.mid },
  rDot: { fontSize: 11, color: colors.muted },
}));
