import { avatar3DError } from '../../src/components/body/avatar3d/Avatar3D';
import { RemeasureNote } from '../../src/components/body/RemeasureNote';
import { useEffect, useRef, useState } from 'react';
import { TabFade } from '../../src/components/TabBar';
import { MyBodyCard } from '../../src/components/body/MyBodyCard';
import {
  View, ScrollView, StyleSheet,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Text } from '../../src/components/Text';
import type { ScrollViewInstance, TextInputInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, themed, useThemeMode } from '../../src/theme';
import { PressableScale, PRESS_SCALE } from '../../src/ui';
import { showAlert } from '../../src/utils/alert';
import { useAppStore } from '../../src/stores/appStore';
import { useAuthStore } from '../../src/stores/authStore';
import { PART_LABEL, PART_ORDER } from '../../src/data/exercises';
import { saveWeight } from '../../src/services/workoutService';
import { saveProfile } from '../../src/services/authService';
import { useEntitlement } from '../../src/hooks/useEntitlement';
import { calcBodyStats, effectiveWeight, validateField } from '../../src/utils/body';
import { weekDates, setsByPart, weakestPart, totalSets, totalVolume, currentStreakDays, fmtDuration, fmtVolume } from '../../src/utils/stats';

export default function MyScreen() {
  useThemeMode();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const patchUser = useAuthStore((s) => s.patchUser);
  const profile = useAppStore((s) => s.profile);
  const logs = useAppStore((s) => s.logs);
  const weights = useAppStore((s) => s.weights);
  // 진행 중인 내 변화 프로젝트가 있으면 칼로리 · 단백질은 지금 단계 값(엔진)
  const bodyProject = useAppStore((s) => s.project);
  const pendingCount = useAppStore((s) => s.pendingLogs.filter((l) => l.userId === user?.uid).length);
  const addWeight = useAppStore((s) => s.addWeight);
  const setProfile = useAppStore((s) => s.setProfile);
  const { pro } = useEntitlement();
  const [weightInput, setWeightInput] = useState('');
  // MY 맨 위 '체중 기록' 버튼 → 아래 체중 칸으로
  const scrollRef = useRef<ScrollViewInstance>(null);
  const weightY = useRef(0);
  const weightRef = useRef<TextInputInstance>(null);
  const goWeigh = () => {
    scrollRef.current?.scrollTo({ y: Math.max(0, weightY.current - 12), animated: true });
    setTimeout(() => weightRef.current?.focus(), 350);
  };
  // 홈 '오늘 할 일 › 체중 기록'(/tabs/my?weigh=1)으로 들어오면 바로 체중 칸으로
  const { weigh } = useLocalSearchParams<{ weigh?: string }>();
  useEffect(() => {
    if (!weigh) return;
    const t = setTimeout(() => { goWeigh(); router.setParams({ weigh: undefined }); }, 400);
    return () => clearTimeout(t);
  }, [weigh]);
  const [saving, setSaving] = useState(false);

  const st = calcBodyStats(profile, weights, bodyProject);
  const eff = effectiveWeight(profile, weights);
  const vol = setsByPart(logs, { weekOnly: true });
  const maxVol = Math.max(4, ...PART_ORDER.map((p) => vol[p]));
  const weakest = weakestPart(vol);
  const weekSets = totalSets(logs, { weekOnly: true });
  const weekVolume = totalVolume(logs, { weekOnly: true });
  // 주간 리포트 — 지난주 대비(10/31 피드백 6절 ⑧)
  const lastSets = totalSets(logs, { lastWeek: true });
  const lastVolume = totalVolume(logs, { lastWeek: true });
  const lastVol = setsByPart(logs, { lastWeek: true });
  const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '±0');
  const volPct = lastVolume > 0 ? Math.round(((weekVolume - lastVolume) / lastVolume) * 100) : null;
  // 체중 — 이번 주 평균 vs 지난주 평균(광고 UI ⑧)
  const thisWk = new Set(weekDates());
  const lastWk = new Set(weekDates(new Date(Date.now() - 7 * 86_400_000)));
  const avg = (set: Set<string>) => {
    const xs = weights.filter((w) => set.has(w.date)).map((w) => w.kg);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const wNow = avg(thisWk);
  const wLast = avg(lastWk);
  const wDelta = wNow != null && wLast != null ? Math.round((wNow - wLast) * 10) / 10 : null;
  const streakDays = currentStreakDays(logs);
  const avgDuration = logs.length
    ? Math.round(logs.reduce((a, l) => a + l.durationSec, 0) / logs.length)
    : 0;

  async function handleSaveWeight() {
    if (!user || saving) return;
    // 온보딩·내 정보와 같은 범위 규칙을 쓴다
    const err = validateField('weight', weightInput);
    if (err) {
      showAlert('입력 확인', `${err} (예: 72.5)`);
      return;
    }
    const kg = Math.round(parseFloat(weightInput.replace(',', '.')) * 10) / 10;
    setSaving(true);
    try {
      const { record, queued } = await saveWeight(user.uid, kg);
      addWeight(record);
      setWeightInput('');
      if (queued) {
        // 오프라인 — 기기에 기록해 두고 연결되면 올라간다(앱을 끄기 전까지)
        showAlert('오프라인', '체중을 기록해 두었습니다. 인터넷에 연결되면 자동으로 저장됩니다.');
      }
    } catch {
      showAlert('오류', '체중 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function applyTrendWeight() {
    if (!user || !profile || !eff?.trend) return;
    const next = { ...profile, weight: String(eff.trend) };
    try {
      await saveProfile(user.uid, next);
      setProfile(next);
      patchUser({ profile: next });
      showAlert('기준 체중 갱신', `${eff.trend}kg으로 갱신했습니다.`);
    } catch {
      showAlert('오류', '저장에 실패했습니다.');
    }
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.topbar}>
        <Text style={s.title} accessibilityRole="header">내 몸</Text>
        {/* 설정(구독 · 알림 · 화면 · 계정)은 별도 화면 — 이 탭에는 몸 · 기록만 남긴다(11/27 배치 점검) */}
        <PressableScale hitSlop={8} style={s.gear} onPress={() => router.push('/profile/settings')}
          accessibilityRole="button" accessibilityLabel="설정">
          {user?.role === 'admin' ? <Text style={s.meta}>ADMIN</Text> : null}
          <Ionicons name="settings-outline" size={22} color={colors.mid} />
        </PressableScale>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scrollRef} style={s.scroll} contentContainerStyle={s.scrollInner} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <RemeasureNote />
        <MyBodyCard onWeigh={goWeigh} />

        {/* Summary */}
        <View style={s.summaryRow}>
          <Summary value={`${weekSets}`} label="이번 주 세트" delta={lastSets || weekSets ? `지난주 ${signed(weekSets - lastSets)}` : undefined} />
          <Summary value={fmtVolume(weekVolume)} label="주간 볼륨" delta={volPct != null ? `지난주 ${signed(volPct)}%` : undefined} />
          <Summary value={`${streakDays}일`} label="연속 기록" />
        </View>

        {/* 빠른 진입 */}
        <View style={s.menuRow}>
          <PressableScale style={s.menuBtn} onPress={() => router.push('/history')} accessibilityRole="button">
            <Text style={s.menuTitle}>운동 기록</Text>
            <Text style={s.menuSub}>{Math.max(user?.stats?.totalLogs ?? 0, logs.length)}회 누적{pendingCount ? ` · 대기 ${pendingCount}` : ''}</Text>
          </PressableScale>
          <PressableScale style={s.menuBtn} onPress={() => router.push('/history/records')}>
            <Text style={s.menuTitle}>개인 기록</Text>
            <Text style={s.menuSub}>종목별 최고 중량</Text>
          </PressableScale>
          <PressableScale style={s.menuBtn} onPress={() => router.push('/profile/edit')}>
            <Text style={s.menuTitle}>내 정보</Text>
            <Text style={s.menuSub}>
              {profile ? `${profile.height}cm · ${profile.weight}kg` : '설정 필요'}
            </Text>
          </PressableScale>
        </View>

        {/* Volume chart */}
        <Text style={s.sectionLabel}>주간 부위별 세트 수</Text>
        <View style={s.card}>
          {weekSets > 0 ? (
            <>
              <View style={s.barsRow}>
                {PART_ORDER.map((p) => {
                  const val = vol[p];
                  const heightPct = Math.max(Math.round((val / maxVol) * 100), 3);
                  const isTop = val === maxVol && val > 0;
                  return (
                    <View key={p} style={s.barCol}>
                      {val > 0 && <Text style={s.barValTxt}>{val}</Text>}
                      {lastVol[p] !== val ? <Text style={s.barDelta}>{signed(val - lastVol[p])}</Text> : null}
                      <View style={s.barTrack}>
                        <View style={[s.barFill, { height: `${heightPct}%` }, isTop && s.barFillHi]} />
                      </View>
                      <Text style={s.barLabel}>{PART_LABEL[p]}</Text>
                    </View>
                  );
                })}
              </View>
              {wDelta != null ? (
                <Text style={s.subMeta}>체중 지난주 평균 대비 {wDelta > 0 ? `+${wDelta}` : wDelta < 0 ? `−${Math.abs(wDelta)}` : '±0'}kg (이번 주 {Math.round(wNow! * 10) / 10}kg)</Text>
              ) : null}
              {weakest && (
                <View style={s.weakRow}>
                  <Text style={s.weakTxt}>
                    <Text style={s.weakPart}>{PART_LABEL[weakest]}</Text> 볼륨이 가장 적습니다. 다음 주 1종목 추가를 권장합니다.
                  </Text>
                </View>
              )}
              {avgDuration > 0 && (
                <Text style={s.subMeta}>평균 운동 시간 {fmtDuration(avgDuration)}</Text>
              )}
            </>
          ) : (
            <Text style={s.emptyTxt}>이번 주 운동을 완료하면 부위별 볼륨이 집계됩니다.</Text>
          )}
        </View>

        {/* Weight */}
        <Text style={s.sectionLabel} onLayout={(e) => { weightY.current = e.nativeEvent.layout.y; }}>체중 기록</Text>
        <View style={s.card}>
          {weights.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.weightHistory}>
              {/* 최신이 왼쪽(첫 화면)에 오게 — reverse 하면 최신값이 화면 밖으로 밀린다 */}
              {weights.slice(0, 10).map((w, i) => (
                <View key={w.id ?? i} style={s.weightChip}>
                  <Text style={s.weightChipDate}>{w.date.slice(5)}</Text>
                  <Text style={s.weightChipVal}>{w.kg}<Text style={s.weightChipUnit}>kg</Text></Text>
                </View>
              ))}
            </ScrollView>
          ) : (
            <Text style={s.emptyTxt}>아직 기록이 없습니다.</Text>
          )}
          {eff?.trend != null && (
            <View style={s.trendRow}>
              <Text style={s.trendTxt}>
                최근 추세 <Text style={s.trendHi}>{eff.trend}kg</Text>
                {'  ·  '}기준 {eff.baseline}kg
                {eff.drift !== 0 ? `  (${eff.drift > 0 ? '+' : ''}${eff.drift})` : ''}
              </Text>
              {eff.shouldUpdate && (
                <PressableScale style={s.trendBtn} onPress={applyTrendWeight}>
                  <Text style={s.trendBtnTxt}>기준 갱신</Text>
                </PressableScale>
              )}
            </View>
          )}
          <View style={s.weightRow}>
            <TextInput
              ref={weightRef}
              style={s.weightInput}
              placeholder="오늘 체중 (kg)"
              placeholderTextColor={colors.placeholder}
              keyboardType="decimal-pad"
              value={weightInput}
              onChangeText={setWeightInput}
              onSubmitEditing={handleSaveWeight}
              returnKeyType="done"
              accessibilityLabel="오늘 체중"
            />
            <PressableScale dimDisabled={false}
              style={[s.weightBtn, (!weightInput.trim() || saving) && s.weightBtnOff]}
              onPress={handleSaveWeight}
              disabled={!weightInput.trim() || saving}
              accessibilityRole="button"
              accessibilityState={{ disabled: !weightInput.trim() || saving }}
            >
              <Text style={s.weightBtnTxt}>기록</Text>
            </PressableScale>
          </View>
        </View>

        {/* 무료일 때만 구독 안내 한 줄 — 구독 중이면 설정 › 구독에서 본다 */}
        {!pro ? (
          <PressableScale scaleTo={PRESS_SCALE.card} style={[s.subRow, s.gapTop]} onPress={() => router.push('/subscribe')} accessibilityRole="button">
            <View style={{ flex: 1 }}>
              <Text style={s.subTitle}>무료 플랜</Text>
              <Text style={s.subSub}>AI 개인화 · 식단 · 루틴 추천은 구독 기능입니다</Text>
            </View>
            <Text style={s.subChev}>›</Text>
          </PressableScale>
        ) : null}
        <PressableScale scaleTo={PRESS_SCALE.card} style={[s.subRow, pro && s.gapTop]} onPress={() => router.push('/profile/settings')}
          accessibilityRole="button" accessibilityLabel="설정 — 구독, 알림, 화면, 계정">
          <View style={{ flex: 1 }}>
            <Text style={s.subTitle}>설정</Text>
            <Text style={s.subSub}>{pro ? '구독 · ' : ''}알림 · 화면 · AI 데이터 · 계정</Text>
          </View>
          <Text style={s.subChev}>›</Text>
        </PressableScale>

        <Text style={s.notice}>통증·부상·질환 관련 판단은 의료 전문가와 상의하세요.</Text>
        {avatar3DError() ? <Text style={s.notice} selectable>3D 표시 꺼짐 · {avatar3DError()}</Text> : null}

      </ScrollView>
      </KeyboardAvoidingView>
      <TabFade />
    </SafeAreaView>
  );
}

function Summary({ value, label, delta }: { value: string; label: string; delta?: string }) {
  useThemeMode();
  return (
    <View style={s.summary}>
      <Text style={s.summaryVal}>{value}</Text>
      <Text style={s.summaryLabel}>{label}</Text>
      {delta ? <Text style={s.summaryDelta}>{delta}</Text> : null}
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topbar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8,
  },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  meta: { fontSize: 10, color: colors.muted, letterSpacing: 1 },
  gear: { minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  scroll: { flex: 1 },
  scrollInner: { paddingHorizontal: 16, paddingBottom: 132 },

  summaryRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  menuRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  menuBtn: {
    flex: 1, backgroundColor: colors.panel, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.line,
  },
  menuTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  menuSub: { fontSize: 10.5, color: colors.muted, marginTop: 4 },
  summary: {
    flex: 1, backgroundColor: colors.panel2, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.line2,
  },
  summaryVal: { fontSize: 18, fontWeight: '800', color: colors.ink },
  summaryLabel: { fontSize: 10, color: colors.muted, marginTop: 4 },
  summaryDelta: { fontSize: 10, color: colors.mid, marginTop: 3, fontWeight: '700' },

  sectionLabel: {
    fontSize: 10, fontWeight: '800', color: colors.muted,
    letterSpacing: 2, marginBottom: 10, marginTop: 18,
  },
  card: {
    backgroundColor: colors.panel, borderRadius: 22, padding: 18,
    borderWidth: 1, borderColor: colors.line, marginBottom: 4,
  },
  emptyTxt: { color: colors.muted, fontSize: 13, lineHeight: 20 },

  barsRow: { flexDirection: 'row', gap: 6, height: 104, alignItems: 'flex-end', marginBottom: 14 },
  barCol: { flex: 1, alignItems: 'center' },
  barValTxt: { fontSize: 10, color: colors.muted, marginBottom: 3 },
  barDelta: { fontSize: 9, color: colors.muted, marginBottom: 2, fontVariant: ['tabular-nums'] },
  barTrack: { width: '100%', height: 80, justifyContent: 'flex-end' },
  barFill: { width: '100%', backgroundColor: colors.panel3, borderRadius: 4 },
  barFillHi: { backgroundColor: colors.mid },
  barLabel: { fontSize: 10, color: colors.muted, marginTop: 5, textAlign: 'center' },
  weakRow: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 },
  weakTxt: { fontSize: 12.5, color: colors.mid, lineHeight: 18 },
  weakPart: { color: colors.ink, fontWeight: '700' },
  subMeta: { fontSize: 11, color: colors.muted, marginTop: 10 },

  weightHistory: { flexGrow: 0, flexShrink: 0, marginBottom: 14 },
  weightChip: {
    backgroundColor: colors.panel2, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    marginRight: 8, alignItems: 'center',
    borderWidth: 1, borderColor: colors.line,
  },
  weightChipDate: { fontSize: 10, color: colors.muted, marginBottom: 3 },
  weightChipVal: { fontSize: 16, fontWeight: '700', color: colors.ink },
  weightChipUnit: { fontSize: 11, fontWeight: '400', color: colors.mid },
  weightRow: { flexDirection: 'row', gap: 8 },
  trendRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 10, marginBottom: 12,
  },
  trendTxt: { fontSize: 11.5, color: colors.muted, flex: 1 },
  trendHi: { color: colors.ink, fontWeight: '700' },
  trendBtn: {
    backgroundColor: colors.panel3, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.line2,
  },
  trendBtnTxt: { fontSize: 11, color: colors.ink, fontWeight: '700' },
  weightInput: {
    flex: 1, backgroundColor: colors.panel2,
    borderWidth: 1, borderColor: colors.line2,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: colors.ink,
  },
  weightBtn: {
    backgroundColor: colors.red, borderRadius: 26,
    paddingHorizontal: 18, paddingVertical: 11, alignItems: 'center',
  },
  weightBtnOff: { opacity: 0.4 },
  weightBtnTxt: { color: colors.onRed, fontSize: 13, fontWeight: '700' },

  subRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.panel, borderRadius: 20, padding: 16,
    borderWidth: 1, borderColor: colors.line, marginBottom: 12,
  },
  subTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  subSub: { fontSize: 11.5, color: colors.muted, marginTop: 4, lineHeight: 18 },
  subChev: { fontSize: 20, color: colors.muted },
  gapTop: { marginTop: 18 },


  notice: { fontSize: 10.5, color: colors.muted, lineHeight: 16, textAlign: 'center', marginTop: 18, marginBottom: 16 },
}));
