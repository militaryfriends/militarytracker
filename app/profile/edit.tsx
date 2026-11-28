import { useEffect, useRef, useState } from 'react';
import {
  View, TextInput, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Text } from '../../src/components/Text';
import { useRouter } from 'expo-router';
import { colors, themed, useThemeMode } from '../../src/theme';
import { showAlert } from '../../src/utils/alert';
import { Screen, TopBar, Body, SectionLabel, PrimaryBtn, EmptyState } from '../../src/components/ui';
import { useAppStore } from '../../src/stores/appStore';
import { useAuthStore } from '../../src/stores/authStore';
import { savePlan, saveProfile } from '../../src/services/authService';
import { buildLocalPlan } from '../../src/utils/planner';
import { kitSummary } from '../../src/data/equipment';
import { EquipPicker, defaultEquip, equipFits } from '../../src/components/onboard/EquipPicker';
import { calcBodyStats, effectiveWeight, validateProfile } from '../../src/utils/body';
import { UserProfile } from '../../src/types';
import { STRATEGIES, STRATEGY, legacyGoalOf, strategyOfGoal } from '../../src/utils/projection';
import { PressableScale } from '../../src/ui';
import { carryAddons } from '../../src/utils/planAddons';
import { addonSkip } from '../../src/utils/addonFilter';
import { addonSource } from '../../src/data/routines';
import { useOnboardDraft } from '../../src/stores/onboardDraft';

export default function ProfileEditScreen() {
  useThemeMode();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const patchUser = useAuthStore((s) => s.patchUser);
  const profile = useAppStore((s) => s.profile);
  const weights = useAppStore((s) => s.weights);
  // 진행 중인 내 변화 프로젝트가 있으면 칼로리 · 단백질은 지금 단계 값(엔진)
  const bodyProject = useAppStore((s) => s.project);
  const setProfile = useAppStore((s) => s.setProfile);
  const plan = useAppStore((s) => s.plan);
  const setPlan = useAppStore((s) => s.setPlan);
  const [p, setP] = useState<UserProfile | null>(profile);
  const [saving, setSaving] = useState(false);
  // 사용자가 손댄 뒤에만 '바뀜'으로 본다 — 화면을 연 뒤 서버 프로필이 늦게 도착하면 아무것도 안 건드렸는데
  // '변경사항 저장'이 켜지고 오류 문구가 뜨던 문제(11/27 화면 점검)
  const touched = useRef(false);
  // 이미 고른 칸을 다시 누른 것(값이 그대로)은 손댄 것으로 치지 않는다
  const editP = (fn: (prev: UserProfile | null) => UserProfile | null) => setP((prev) => {
    const next = fn(prev);
    if (next !== prev) touched.current = true;
    return next;
  });

  // 하이드레이션이 늦게 끝나면 마운트 시점에는 profile 이 없다. 손대기 전이면 늦게 온 프로필을 그대로 따라간다
  useEffect(() => {
    if (profile && (!p || !touched.current)) setP(profile);
  }, [profile]);

  if (!p) {
    return (
      <Screen>
        <TopBar title="내 정보" onBack={() => router.back()} />
        <EmptyState text={'신체 정보를 불러오지 못했습니다.\n잠시 후 다시 시도해주세요.'} />
      </Screen>
    );
  }

  // Firestore 는 undefined 값을 못 받는다 — 키 자체를 뺀다
  const withoutShape = ({ bodyShape: _drop, ...rest }: UserProfile): UserProfile => rest;
  const update = <K extends keyof UserProfile>(k: K, v: UserProfile[K]) =>
    editP((prev) => (prev && prev[k] !== v ? { ...prev, [k]: v } : prev));

  // 장소를 바꾸면 기구 목록도 새 장소 기본값으로
  const pickEnv = (env: 'gym' | 'home') => editP((prev) => {
    if (!prev || prev.env === env) return prev;
    return { ...prev, env, equip: defaultEquip(env) };
  });

  const st = calcBodyStats(p, weights, bodyProject);
  const eff = effectiveWeight(p, weights);
  const changed = JSON.stringify(p) !== JSON.stringify(profile);
  // 홈트로 바꿨는데 기구를 아직 안 골랐으면 저장하지 않는다(맨몸만도 하나의 선택)
  // 오류는 그 칸 바로 아래에 보인다 — 예전엔 기구 오류가 나이 · 키 칸 밑에 떠서 무엇을 고치라는지 알 수 없었다
  const fieldError = validateProfile(p);
  const equipError = p.env === 'home' && !equipFits('home', p.equip) ? '집에 있는 기구를 하나 이상 골라 주세요. 없으면 맨몸만을 고르면 돼요.' : null;
  const valid = !fieldError && !equipError;

  function handleBack() {
    if (!changed) { router.back(); return; }
    showAlert('변경사항이 있습니다', '저장하지 않고 나갈까요?', [
      { text: '계속 수정', style: 'cancel' },
      { text: '저장 없이 나가기', style: 'destructive', onPress: () => router.back() },
    ]);
  }

  function remeasure() {
    const go = () => {
      useOnboardDraft.getState().patch({ resume: 'body' });
      router.push('/project/new');
    };
    if (!changed) { go(); return; }
    showAlert('변경사항이 있습니다', '저장하지 않고 허리 · 인바디를 다시 넣을까요?', [
      { text: '계속 수정', style: 'cancel' },
      { text: '저장 없이 이동', onPress: () => { touched.current = false; go(); } },
    ]);
  }

  async function handleSave() {
    if (!user || !p) return;
    const problem = fieldError ?? equipError;
    if (problem) { showAlert('입력 확인', problem); return; }
    setSaving(true);
    try {
      await saveProfile(user.uid, p);
      setProfile(p);
      patchUser({ profile: p });
      touched.current = false;
      // 장소 · 기구가 바뀌었으면 지금 루틴을 새 기구에 맞출지 묻는다(없는 기구 종목이 루틴에 남지 않게)
      const kitChanged = profile && (profile.env !== p.env || kitSummary(profile) !== kitSummary(p));
      if (kitChanged && plan) {
        showAlert('루틴도 바꿀까요?', `${kitSummary(p)} 기준으로 운동 루틴을 다시 짭니다. 지금 루틴은 되돌릴 수 없어요.${plan.days.some((d) => (d.addons ?? []).length) ? ' 붙여 둔 부위 집중 묶음은 새 기구로 할 수 있는 것만 옮겨요.' : ''}`, [
          { text: '나중에', style: 'cancel', onPress: () => router.back() },
          {
            text: '다시 짜기',
            onPress: async () => {
              try {
                // 붙여 둔 부위 집중 묶음은 새 기구로 할 수 있는 것만 새 루틴으로 옮긴다
                const next = carryAddons(plan, buildLocalPlan(p, Date.now()), addonSource, addonSkip(p)).plan;
                await savePlan(user.uid, next);
                setPlan(next);
              } catch {
                showAlert('오류', '루틴을 바꾸지 못했어요. 운동 탭에서 다시 구성해 주세요.');
              }
              router.back();
            },
          },
        ]);
        return;
      }
      // 저장했으면 바로 돌아간다 — 확인 버튼을 한 번 더 누르게 하지 않는다
      router.back();
    } catch {
      showAlert('오류', '저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <TopBar title="내 정보" onBack={handleBack} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Body>
          <SectionLabel>신체 정보</SectionLabel>
          <View style={s.grid2}>
            {/* 성별을 바꾸면 맞춘 체형(어깨 · 골반 …)은 버린다 — 다른 성별 몸에 얹으면 어색해진다 */}
            <Opt label="남성" on={p.sex === 'male'} onPress={() => editP((prev) => (prev && prev.sex !== 'male' ? { ...withoutShape(prev), sex: 'male' } : prev))} />
            <Opt label="여성" on={p.sex === 'female'} onPress={() => editP((prev) => (prev && prev.sex !== 'female' ? { ...withoutShape(prev), sex: 'female' } : prev))} />
          </View>

          <View style={s.grid3}>
            <Field label="나이" value={p.age} onChange={(v) => update('age', v)} kb="numeric" placeholder="25" />
            <Field label="키 (cm)" value={p.height} onChange={(v) => update('height', v)} kb="decimal-pad" placeholder="175" />
            <Field label="몸무게 (kg)" value={p.weight} onChange={(v) => update('weight', v)} kb="decimal-pad" placeholder="70" />
          </View>
          {fieldError && changed ? <Text style={s.errTxt}>{fieldError}</Text> : null}

          {st && (
            <View style={s.calcBox}>
              <Text style={s.calcTxt}>
                BMI {st.bmi} · {st.bodyType} · 목표 {Number(st.kcal).toLocaleString('ko-KR')}kcal · 단백질 {st.protein}g
              </Text>
              <Text style={s.calcSub}>
                {eff?.src === 'trend'
                  ? `최근 체중 기록의 추세값 ${eff.trend}kg 으로 계산했습니다. 위 몸무게는 기준값입니다.`
                  : '저장하면 식단 목표치가 이 값으로 갱신됩니다.'}
              </Text>
            </View>
          )}

          <SectionLabel>목표 방식</SectionLabel>
          {/* 프로젝트 카드 4장과 같은 이름 · 같은 계산기(10/31 피드백 2절) — 진행 중인 프로젝트가 있으면 칼로리는 프로젝트 단계가 정한다 */}
          {STRATEGIES.map((sid) => {
            const cur = p.strategy ?? strategyOfGoal(p.goal);
            return (
              <Opt key={sid} label={STRATEGY[sid].name} sub={STRATEGY[sid].how} on={p.goal !== 'habit' && cur === sid}
                onPress={() => editP((prev) => (prev ? { ...prev, strategy: sid, goal: legacyGoalOf(sid) } : prev))} />
            );
          })}
          <Opt label="운동 습관 만들기" sub="유지 칼로리 · 짧은 루틴 · 꾸준함 우선" on={p.goal === 'habit'}
            onPress={() => editP((prev) => {
              if (!prev) return prev;
              const { strategy: _s, ...rest } = prev;
              return { ...rest, goal: 'habit' };
            })} />
          {bodyProject?.status === 'active' ? (
            <Text style={s.projNote}>진행 중인 프로젝트({bodyProject.name})가 있어 하루 칼로리는 프로젝트 단계 값을 씁니다.</Text>
          ) : null}

          {/* 검수 1-2 — 허리 · 인바디는 몸 숫자 전체(지금 몸 · 목표 · 칼로리)를 바꾸므로 여기서 칸만 고치지 않고 '내 몸 다시 계산'의 그 단계로 */}
          <SectionLabel>허리둘레 · 인바디</SectionLabel>
          <PressableScale haptic="select" style={s.opt} onPress={remeasure} accessibilityRole="button">
            <View style={{ flex: 1 }}>
              <Text style={s.optTxt}>{p.waistCm ? `허리 ${p.waistCm}cm` : '허리둘레 없음'}</Text>
              <Text style={s.optSub}>다시 넣으면 지금 몸 · 목표 · 칼로리를 다시 계산해요</Text>
            </View>
            <Text style={s.optDot}>›</Text>
          </PressableScale>

          <SectionLabel>운동 환경</SectionLabel>
          <View style={s.grid2}>
            <Opt label="헬스장" on={p.env === 'gym'} onPress={() => pickEnv('gym')} />
            <Opt label="홈트레이닝" on={p.env === 'home'} onPress={() => pickEnv('home')} />
          </View>
          <Text style={s.label}>{p.env === 'gym' ? '헬스장 기구' : '집에 있는 기구'}</Text>
          <EquipPicker key={p.env} env={p.env} equip={p.equip} onChange={(v) => update('equip', v)} />
          {equipError && changed ? <Text style={s.errTxt}>{equipError}</Text> : null}

          <Text style={s.label}>주당 운동 일수</Text>
          <View style={[s.chipRow, { flexWrap: 'nowrap' }]}>
            {([2, 3, 4, 5, 6] as const).map((d) => (
              <PressableScale haptic="select" key={d} style={[s.chip, { flex: 1, paddingHorizontal: 0, alignItems: 'center' }, p.days === d && s.chipOn]} onPress={() => update('days', d)}>
                <Text style={[s.chipTxt, p.days === d && s.chipOnTxt]} numberOfLines={1} maxFontSizeMultiplier={1.2}>주 {d}일</Text>
              </PressableScale>
            ))}
          </View>

          <Text style={s.label}>운동 경력</Text>
          <View style={s.chipRow}>
            {([1, 2, 3] as const).map((lv) => (
              <PressableScale haptic="select" key={lv} style={[s.chip, p.level === lv && s.chipOn]} onPress={() => update('level', lv)}>
                <Text style={[s.chipTxt, p.level === lv && s.chipOnTxt]}>
                  {{ 1: '입문', 2: '중급', 3: '상급' }[lv]}
                </Text>
              </PressableScale>
            ))}
          </View>

          <SectionLabel>식사 환경</SectionLabel>
          <View style={s.chipRow}>
            {([
              ['convenience', '편의점'], ['self', '자취 요리'],
              ['family', '집밥'], ['out', '외식'],
            ] as const).map(([k, label]) => (
              <PressableScale haptic="select" key={k} style={[s.chip, p.food === k && s.chipOn]} onPress={() => update('food', k)}>
                <Text style={[s.chipTxt, p.food === k && s.chipOnTxt]}>{label}</Text>
              </PressableScale>
            ))}
          </View>

          <Text style={s.label}>알레르기 · 제외할 음식</Text>
          <TextInput
            style={s.input}
            placeholder="예: 유제품, 갑각류"
            placeholderTextColor={colors.muted}
            value={p.allergy}
            onChangeText={(v) => update('allergy', v)}
          />

          <PrimaryBtn
            label={changed ? '변경사항 저장' : '변경사항 없음'}
            onPress={handleSave}
            loading={saving}
            disabled={!changed || !valid}
            style={{ marginTop: 22 }}
          />
          <Text style={s.hint}>
            운동 플랜은 자동으로 바뀌지 않습니다. 새 조건에 맞추려면 운동 탭에서 다시 구성하세요.
          </Text>
        </Body>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Field({
  label, value, onChange, kb, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; kb: 'numeric' | 'decimal-pad'; placeholder?: string }) {
  useThemeMode();
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChange}
        keyboardType={kb}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        selectTextOnFocus
        accessibilityLabel={label}
      />
    </View>
  );
}

function Opt({ label, sub, on, onPress }: { label: string; sub?: string; on: boolean; onPress: () => void }) {
  useThemeMode();
  return (
    <PressableScale haptic="select" style={[s.opt, on && s.optOn]} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={[s.optTxt, on && s.optTxtOn]}>{label}</Text>
        {sub ? <Text style={s.optSub}>{sub}</Text> : null}
      </View>
      <Text style={[s.optDot, on && s.optDotOn]}>{on ? '●' : '○'}</Text>
    </PressableScale>
  );
}

const s = themed(() => StyleSheet.create({
  errTxt: { color: colors.wrong, fontSize: 12, marginTop: 8 },
  projNote: { fontSize: 12, color: colors.muted, marginTop: 6, lineHeight: 18 },

  label: { fontSize: 12, color: colors.muted, marginTop: 14, marginBottom: 6 },
  input: {
    backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line2,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.ink,
  },
  grid2: { flexDirection: 'row', gap: 9 },
  grid3: { flexDirection: 'row', gap: 9 },
  opt: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.line2,
    borderRadius: 10, padding: 14, marginBottom: 9, flex: 1,
  },
  optOn: { borderColor: colors.ink, backgroundColor: colors.panel2 },
  optTxt: { fontSize: 14.5, color: colors.mid },
  optTxtOn: { color: colors.ink, fontWeight: '600' },
  optSub: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
  optDot: { fontSize: 14, color: colors.muted },
  optDotOn: { color: colors.ink },
  chipRow: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  chip: {
    borderWidth: 1, borderColor: colors.line2, borderRadius: 20,
    paddingVertical: 8, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipTxt: { fontSize: 13, color: colors.mid },
  chipOnTxt: { color: colors.bg, fontWeight: '600' },
  calcBox: {
    backgroundColor: colors.panel2, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: colors.line2, marginTop: 14,
  },
  calcTxt: { fontSize: 13, color: colors.ink, fontWeight: '600' },
  calcSub: { fontSize: 11, color: colors.muted, marginTop: 5 },
  hint: { fontSize: 11.5, color: colors.muted, lineHeight: 18, textAlign: 'center', marginTop: 12 },
}));
