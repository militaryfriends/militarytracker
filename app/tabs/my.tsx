import { avatar3DError } from '../../src/components/body/avatar3d/Avatar3D';
import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, KeyboardAvoidingView, Platform, Switch,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { chooseTheme, colors, themed, useThemePref, useThemeMode, type ThemePref } from '../../src/theme';
import { Segmented, haptic, setHapticsEnabled, useHapticsEnabled } from '../../src/ui';
import { showAlert } from '../../src/utils/alert';
import { useAppStore } from '../../src/stores/appStore';
import { useAuthStore } from '../../src/stores/authStore';
import { PART_LABEL, PART_ORDER } from '../../src/data/exercises';
import { saveWeight } from '../../src/services/workoutService';
import { saveProfile } from '../../src/services/authService';
import { logoutUser, deleteUserAccount } from '../../src/services/session';
import { useEntitlement } from '../../src/hooks/useEntitlement';
import { ProBadge } from '../../src/components/ProLock';
import { SUB_STATUS_LABEL } from '../../src/utils/subscription';
import { PRO_NAME } from '../../src/config/entitlements';
import { manageSubscriptionUrl } from '../../src/services/billingService';
import { calcBodyStats, effectiveWeight, validateField } from '../../src/utils/body';
import { setsByPart, weakestPart, totalSets, totalVolume, currentStreakDays, fmtDuration, fmtVolume } from '../../src/utils/stats';

const THEME_OPTIONS = [
  { value: 'system', label: '시스템' },
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
] as const satisfies readonly { value: ThemePref; label: string }[];

export default function MyScreen() {
  useThemeMode();
  const themePref = useThemePref();
  const hapticsOn = useHapticsEnabled();
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
  const resetAll = useAppStore((s) => s.resetAll);
  const setProfile = useAppStore((s) => s.setProfile);
  const { can, pro, sub, left } = useEntitlement();
  const manageUrl = manageSubscriptionUrl(sub.source, sub.productId);
  const canCoach = can('ai_coach');
  const [weightInput, setWeightInput] = useState('');
  const [saving, setSaving] = useState(false);

  const st = calcBodyStats(profile, weights, bodyProject);
  const eff = effectiveWeight(profile, weights);
  const vol = setsByPart(logs, { weekOnly: true });
  const maxVol = Math.max(4, ...PART_ORDER.map((p) => vol[p]));
  const weakest = weakestPart(vol);
  const weekSets = totalSets(logs, { weekOnly: true });
  const weekVolume = totalVolume(logs, { weekOnly: true });
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

  function handleLogout() {
    const doLogout = async () => {
      try {
        await logoutUser();
      } catch {
        showAlert('오류', '로그아웃에 실패했습니다. 네트워크를 확인해주세요.');
        return;
      }
      resetAll();
      router.replace('/auth/login');
    };
    if (pendingCount > 0) {
      // 아직 서버에 못 올린 기록이 있다 — 로그아웃해도 기기에 남지만, 알고 나가게 한다
      showAlert(
        '동기화되지 않은 기록',
        `서버에 아직 올라가지 않은 운동 기록 ${pendingCount}건이 있습니다. 다시 로그인하면 자동으로 올라갑니다. 로그아웃할까요?`,
        [{ text: '취소', style: 'cancel' }, { text: '로그아웃', onPress: doLogout }]
      );
      return;
    }
    doLogout();
  }

  // 가입할 때와 같은 흐름을 처음부터 — 중간에 닫으면 아무것도 바뀌지 않는다
  function restartOnboarding() {
    const running = bodyProject?.status === 'active';
    showAlert(
      '온보딩 다시 하기',
      `원하는 체형부터 다시 골라요. 끝까지 진행하면 루틴이 새로 정해지고, 운동 기록과 체중 기록은 그대로 남아요.${running ? ' 새 프로젝트를 시작하면 지금 진행 중인 프로젝트는 끝나요.' : ''}`,
      [
        { text: '취소', style: 'cancel' },
        { text: '처음부터 하기', onPress: () => router.push('/project/new?restart=1') },
      ]
    );
  }

  function confirmDelete() {
    showAlert(
      '계정 삭제',
      '운동 기록·체중·플랜이 모두 삭제되며 되돌릴 수 없습니다. 진행할까요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              // 서버(Admin SDK)가 지운다 — 재로그인 요구 없음
              await deleteUserAccount();
              resetAll();
              router.replace('/auth/login');
            } catch {
              showAlert('삭제 실패', '계정 삭제에 실패했습니다. 네트워크를 확인하고 잠시 후 다시 시도해주세요.');
            }
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.topbar}>
        <Text style={s.title}>MY</Text>
        <Text style={s.meta}>{user?.role === 'admin' ? 'ADMIN' : 'REPORT · COACH'}</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollInner} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Summary */}
        <View style={s.summaryRow}>
          <Summary value={`${weekSets}`} label="이번 주 세트" />
          <Summary value={fmtVolume(weekVolume)} label="주간 볼륨" />
          <Summary value={`${streakDays}일`} label="연속 기록" />
        </View>

        {/* 빠른 진입 */}
        <View style={s.menuRow}>
          <TouchableOpacity activeOpacity={0.7} style={s.menuBtn} onPress={() => router.push('/history')} accessibilityRole="button">
            <Text style={s.menuTitle}>운동 기록</Text>
            <Text style={s.menuSub}>{Math.max(user?.stats?.totalLogs ?? 0, logs.length)}회 누적{pendingCount ? ` · 대기 ${pendingCount}` : ''}</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} style={s.menuBtn} onPress={() => router.push('/history/records')}>
            <Text style={s.menuTitle}>개인 기록</Text>
            <Text style={s.menuSub}>종목별 최고 중량</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} style={s.menuBtn} onPress={() => router.push('/profile/edit')}>
            <Text style={s.menuTitle}>내 정보</Text>
            <Text style={s.menuSub}>
              {profile ? `${profile.height}cm · ${profile.weight}kg` : '설정 필요'}
            </Text>
          </TouchableOpacity>
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
                      <View style={s.barTrack}>
                        <View style={[s.barFill, { height: `${heightPct}%` }, isTop && s.barFillHi]} />
                      </View>
                      <Text style={s.barLabel}>{PART_LABEL[p]}</Text>
                    </View>
                  );
                })}
              </View>
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
        <Text style={s.sectionLabel}>체중 기록</Text>
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
                <TouchableOpacity activeOpacity={0.7} style={s.trendBtn} onPress={applyTrendWeight}>
                  <Text style={s.trendBtnTxt}>기준 갱신</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          <View style={s.weightRow}>
            <TextInput
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
            <TouchableOpacity activeOpacity={0.7}
              style={[s.weightBtn, (!weightInput.trim() || saving) && s.weightBtnOff]}
              onPress={handleSaveWeight}
              disabled={!weightInput.trim() || saving}
              accessibilityRole="button"
              accessibilityState={{ disabled: !weightInput.trim() || saving }}
            >
              <Text style={s.weightBtnTxt}>기록</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 구독 */}
        <Text style={s.sectionLabel}>구독</Text>
        <TouchableOpacity style={s.subRow} activeOpacity={0.8} onPress={() => router.push('/subscribe')}>
          <View style={{ flex: 1 }}>
            <View style={s.subHead}>
              <Text style={s.subTitle}>{pro ? PRO_NAME : '무료 플랜'}</Text>
              {pro && <ProBadge />}
            </View>
            <Text style={s.subSub}>
              {pro
                ? `${SUB_STATUS_LABEL[sub.status]}${left !== null ? ` · ${left}일 남음` : ''}`
                : 'AI 개인화 · 식단 · 루틴 추천은 구독 기능입니다'}
            </Text>
          </View>
          <Text style={s.subChev}>›</Text>
        </TouchableOpacity>

        {/* AI 코치 — 전용 화면(/coach). 채팅을 페이지 스크롤 안에 두면 iOS 키보드가 입력창을 가린다 */}
        <Text style={s.sectionLabel}>AI 코치</Text>
        <TouchableOpacity style={s.subRow} activeOpacity={0.8} onPress={() => router.push('/coach')} accessibilityRole="button">
          <View style={{ flex: 1 }}>
            <View style={s.subHead}>
              <Text style={s.subTitle}>코치에게 물어보기</Text>
              {!canCoach && <ProBadge />}
            </View>
            <Text style={s.subSub}>
              {canCoach ? '루틴 조정 · 대체 운동 · 식단 · 회복' : '구독하면 내 기록을 아는 코치와 대화할 수 있어요'}
            </Text>
          </View>
          <Text style={s.subChev}>›</Text>
        </TouchableOpacity>
        {manageUrl ? (
          <TouchableOpacity style={s.subRow} activeOpacity={0.8} onPress={() => Linking.openURL(manageUrl)}
            accessibilityRole="link" accessibilityLabel="구독 관리 · 해지">
            <View style={{ flex: 1 }}>
              <Text style={s.subTitle}>구독 관리 · 해지</Text>
              <Text style={s.subSub}>{sub.source === 'ios' ? 'App Store' : 'Google Play'} 구독 화면에서 해지 · 결제 수단을 바꿉니다</Text>
            </View>
            <Text style={s.subChev}>›</Text>
          </TouchableOpacity>
        ) : null}

        {/* 온보딩 — 가입 때 흐름(원하는 체형 → 분석 → 프로젝트)을 다시 */}
        <Text style={s.sectionLabel}>온보딩</Text>
        <TouchableOpacity style={s.subRow} activeOpacity={0.8} onPress={restartOnboarding} accessibilityRole="button"
          accessibilityLabel="온보딩 처음부터 다시 하기">
          <View style={{ flex: 1 }}>
            <Text style={s.subTitle}>온보딩 처음부터 다시 하기</Text>
            <Text style={s.subSub}>원하는 체형 선택부터 분석 · 프로젝트까지 다시 해요</Text>
          </View>
          <Text style={s.subChev}>›</Text>
        </TouchableOpacity>

        {user?.role === 'admin' ? (
          <>
            <Text style={s.sectionLabel}>관리자</Text>
            <TouchableOpacity style={s.subRow} activeOpacity={0.8} onPress={() => router.push('/profile/waitlist')}
              accessibilityRole="button" accessibilityLabel="대기자 명단 등록">
              <View style={{ flex: 1 }}>
                <Text style={s.subTitle}>대기자 명단 등록</Text>
                <Text style={s.subSub}>Tally CSV → 3개월 · 1개월 프리미엄 자동 지급</Text>
              </View>
              <Text style={s.subChev}>›</Text>
            </TouchableOpacity>
          </>
        ) : null}

        {/* 화면 · 진동 */}
        <Text style={s.sectionLabel}>화면</Text>
        <View style={s.card}>
          <Text style={s.setTitle}>모드</Text>
          <Segmented<ThemePref>
            label="화면 모드"
            options={THEME_OPTIONS}
            value={themePref}
            onChange={chooseTheme}
          />
          <Text style={s.setHint}>
            {themePref === 'system' ? '기기 설정을 따라 바뀝니다.' : '기기 설정과 상관없이 이 모드로 봅니다.'}
          </Text>
          <View style={s.setRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.setTitle}>누를 때 진동</Text>
              <Text style={s.setSub}>버튼 · 세트 체크 · 기록 갱신. 휴식 끝 알림은 항상 울립니다.</Text>
            </View>
            <Switch
              value={hapticsOn}
              onValueChange={(v) => {
                setHapticsEnabled(v);
                if (v) haptic.tap();
              }}
              // 모노: 켜면 글자색 판 위에 바탕색 손잡이 (iOS 기본 흰 손잡이는 다크에서 흰 판에 묻힌다)
              trackColor={{ false: colors.panel3, true: colors.ink }}
              thumbColor={hapticsOn ? colors.bg : '#FFFFFF'}
              ios_backgroundColor={colors.panel3}
              {...(Platform.OS === 'web' ? ({ activeThumbColor: colors.bg } as object) : null)}
              accessibilityLabel="누를 때 진동"
            />
          </View>
        </View>

        <Text style={s.notice}>통증·부상·질환 관련 판단은 의료 전문가와 상의하세요.</Text>
        {avatar3DError() ? <Text style={s.notice} selectable>3D 표시 꺼짐 · {avatar3DError()}</Text> : null}

        <TouchableOpacity activeOpacity={0.7} style={s.logoutBtn} onPress={handleLogout} accessibilityRole="button">
          <Text style={s.logoutTxt}>로그아웃</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.7} style={s.deleteBtn} onPress={confirmDelete} accessibilityRole="button">
          <Text style={s.deleteTxt}>계정 삭제</Text>
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Summary({ value, label }: { value: string; label: string }) {
  useThemeMode();
  return (
    <View style={s.summary}>
      <Text style={s.summaryVal}>{value}</Text>
      <Text style={s.summaryLabel}>{label}</Text>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topbar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  meta: { fontSize: 10, color: colors.muted, letterSpacing: 1 },
  scroll: { flex: 1 },
  scrollInner: { paddingHorizontal: 16, paddingBottom: 36 },

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

  sectionLabel: {
    fontSize: 10, fontWeight: '800', color: colors.muted,
    letterSpacing: 2, marginBottom: 10, marginTop: 18,
  },
  card: {
    backgroundColor: colors.panel, borderRadius: 18, padding: 18,
    borderWidth: 1, borderColor: colors.line, marginBottom: 4,
  },
  emptyTxt: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  setTitle: { fontSize: 14, fontWeight: '700', color: colors.ink, marginBottom: 10 },
  setHint: { fontSize: 11.5, color: colors.muted, marginTop: 8 },
  setRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderTopWidth: 1, borderTopColor: colors.line, marginTop: 16, paddingTop: 14,
  },
  setSub: { fontSize: 11.5, color: colors.muted, lineHeight: 17, marginTop: -6 },

  barsRow: { flexDirection: 'row', gap: 6, height: 104, alignItems: 'flex-end', marginBottom: 14 },
  barCol: { flex: 1, alignItems: 'center' },
  barValTxt: { fontSize: 10, color: colors.muted, marginBottom: 3 },
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
    backgroundColor: colors.ink, borderRadius: 12,
    paddingHorizontal: 18, paddingVertical: 11, alignItems: 'center',
  },
  weightBtnOff: { opacity: 0.4 },
  weightBtnTxt: { color: colors.bg, fontSize: 13, fontWeight: '700' },

  subRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.panel, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.line, marginBottom: 12,
  },
  subHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  subSub: { fontSize: 11.5, color: colors.muted, marginTop: 4, lineHeight: 18 },
  subChev: { fontSize: 20, color: colors.muted },


  notice: { fontSize: 10.5, color: colors.muted, lineHeight: 16, textAlign: 'center', marginTop: 18, marginBottom: 16 },
  logoutBtn: {
    borderWidth: 1, borderColor: colors.line2,
    borderRadius: 14, paddingVertical: 14, alignItems: 'center',
  },
  logoutTxt: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  deleteBtn: { paddingVertical: 16, alignItems: 'center' },
  deleteTxt: { color: colors.wrong, fontSize: 12.5, fontWeight: '600' },
}));
