/**
 * 내 변화 프로젝트 — 진행 상황 + 4주 체크인.
 *
 *  · 시작 · 지금 · 예상 아바타를 나란히. 지금 몸은 체크인 · 주간 체중으로만 바뀐다.
 *  · 4주가 되면 체크인: 체중(추세값 미리 채움) · 허리 · 선택형 인바디 → 저장 → 서버(aiReport)가 다시 판정하고
 *    리포트를 쓴다. 예상보다 빠름/정상/느림(±10%p), 두 번 연속 느리면 완료 예상을 다시 계산해 몇 개월 늦어졌는지 알린다.
 *  · 허리는 체지방률로 환산하지 않는다 — 기록만 한다.
 *  · 구독이 끝나면 프로젝트는 멈춘다(데이터는 그대로, 다시 구독하면 지금 실측값에서 이어서).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, themed, useThemeMode } from '../../src/theme';
import { PressableScale, haptic } from '../../src/ui';
import { Screen, TopBar, Body, SectionLabel, EmptyState, useSafeBack } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/authStore';
import { useAppStore } from '../../src/stores/appStore';
import { useEntitlement } from '../../src/hooks/useEntitlement';
import { AvatarView } from '../../src/components/body/AvatarView';
import { kg, pct1 } from '../../src/components/body/format';
import { projectNow } from '../../src/components/body/progress';
import { cellWithHysteresis, toCoord, updateComp } from '../../src/utils/bodyComp';
import { STATUS_TEXT, checkinStatus, expectedPoint, progressPct } from '../../src/utils/projection';
import { checkInbodyDate, parseNum, trendWeight, validateBodyFat, validateField, validateSmm, validateWaist } from '../../src/utils/body';
import { stableDocId } from '../../src/utils/merge';
import { fetchActiveProject, fetchCheckins, fetchReport, saveCheckin } from '../../src/services/bodyService';
import { localDate, saveWeight } from '../../src/services/workoutService';
import { requestCheckinReport, SubscriptionRequired } from '../../src/services/aiService';
import { showAlert } from '../../src/utils/alert';
import type { BodyReportBody, Checkin, CheckinResult } from '../../src/types';

export default function CheckinScreen() {
  useThemeMode();
  const router = useRouter();
  const goBack = useSafeBack();
  const { width } = useWindowDimensions();
  const user = useAuthStore((st) => st.user);
  const project = useAppStore((st) => st.project);
  const checkins = useAppStore((st) => st.checkins);
  const weights = useAppStore((st) => st.weights);
  const { setCheckins, setProject, addWeight } = useAppStore();
  const { pro } = useEntitlement();

  const [report, setReport] = useState<BodyReportBody | null>(null);
  const [result, setResult] = useState<(CheckinResult & { cellChanged: boolean }) | null>(null);
  const [w, setW] = useState('');
  const [waist, setWaist] = useState('');
  const [ib, setIb] = useState({ on: false, bf: '', smm: '', date: localDate() });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 체크인 목록 · 마지막 리포트 — 화면을 열 때 한 번
  useEffect(() => {
    if (!user || !project) return;
    fetchCheckins(user.uid, project.id).then(setCheckins).catch(() => {});
  }, [user, project, setCheckins]);

  const now = useMemo(() => (project ? projectNow(project, checkins, weights) : null), [project, checkins, weights]);
  const lastReportId = now?.latest?.reportId ?? null;
  useEffect(() => {
    if (!lastReportId) return;
    fetchReport(lastReportId).then((r) => r && setReport(r.report)).catch(() => {});
  }, [lastReportId]);

  // 체중은 추세값(없으면 직전 체크인 · 시작 체중)으로 미리 채운다
  useEffect(() => {
    if (!project || w) return;
    const t = trendWeight(weights);
    setW(String(t ?? now?.latest?.weightKg ?? project.input.weightKg));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  if (!project || !now) {
    return (
      <Screen>
        <TopBar title="내 변화 프로젝트" onBack={goBack} />
        <EmptyState text="진행 중인 프로젝트가 없어요." cta="내 몸 분석하기" onCta={() => router.replace('/project/new')} />
      </Screen>
    );
  }

  const sex = project.input.sex;
  const colW = Math.min(110, (Math.min(width, 480) - 32 - 24) / 3);
  const due = now.dueIn <= 0;
  const baseCell = project.track[0]?.cell ?? now.prevCell;
  const endCell = project.end.cell;

  async function submit() {
    if (!user || !project || !now || busy) return;
    const wErr = validateField('weight', w);
    const waErr = waist.trim() ? validateWaist(waist, project.input.heightCm) : null;
    const bfErr = ib.on ? validateBodyFat(ib.bf) : null;
    const smErr = ib.on ? validateSmm(ib.smm, parseNum(w)) : null;
    const dtErr = ib.on ? checkInbodyDate(ib.date).error : null;
    const first = wErr ?? waErr ?? bfErr ?? smErr ?? dtErr;
    if (first) {
      setErr(first);
      haptic.error();
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const weightKg = parseNum(w);
      const inbody = ib.on ? { bfPct: parseNum(ib.bf), smmKg: parseNum(ib.smm), date: ib.date } : undefined;
      // 미리 보기 판정 — 서버(aiReport)가 같은 엔진으로 다시 판정해 덮어쓴다
      const comp = updateComp(now.prevComp, project.input.heightCm, weightKg, inbody?.bfPct);
      const cell = cellWithHysteresis(sex, comp.bfPct, comp.nffmi, now.prevCell);
      const base = { bfPct: project.baseline.bfPct, nffmi: project.baseline.nffmi };
      const exp = progressPct(sex, base, expectedPoint(project.track, project.trackOffset, now.nextMonthIndex), project.goal);
      const meas = progressPct(sex, base, comp, project.goal);
      const createdAt = new Date().toISOString();
      const c: Checkin = {
        id: stableDocId(user.uid, createdAt),
        userId: user.uid,
        projectId: project.id,
        date: localDate(),
        createdAt,
        monthIndex: now.nextMonthIndex,
        weightKg,
        ...(waist.trim() ? { waistCm: parseNum(waist) } : {}),
        ...(inbody ? { inbody } : {}),
        comp,
        coord: toCoord(sex, comp.bfPct, comp.nffmi),
        cell,
        expectedProgressPct: exp,
        measuredProgressPct: meas,
        status: checkinStatus(meas, exp),
      };
      await saveCheckin(c);
      // 체크인 체중은 체중 기록에도 남긴다(추세 · 칼로리 계산이 같이 따라온다)
      saveWeight(user.uid, weightKg).then(({ record }) => addWeight(record)).catch(() => {});
      const r = await requestCheckinReport(c.id);
      const judged: Checkin = {
        ...c, status: r.status, expectedProgressPct: r.expectedProgressPct, measuredProgressPct: r.measuredProgressPct, reportId: r.reportId,
      };
      setCheckins([judged, ...checkins.filter((x) => x.id !== c.id)]);
      setReport(r.report);
      setResult({ ...r, cellChanged: cell !== now.prevCell });
      haptic.success();
      if (r.recalculated) fetchActiveProject(user.uid).then((p) => p && setProject(p)).catch(() => {});
    } catch (e) {
      if (e instanceof SubscriptionRequired) {
        router.push('/subscribe?f=body_project');
        return;
      }
      haptic.error();
      showAlert('체크인 실패', e instanceof Error && e.message ? e.message : '잠시 후 다시 시도해주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <TopBar title="내 변화 프로젝트" meta={`${now.week}주차`} onBack={goBack} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Body>
          <Text style={s.name}>{project.name}</Text>
          <Text style={s.meta}>{project.months}개월 프로젝트 · {now.days}일째</Text>

          <View style={s.trio}>
            {[
              { cell: baseCell, badge: '시작' as const, txt: `${kg(project.input.weightKg)}kg` },
              { cell: now.nowCell, badge: '지금' as const, txt: `${kg(now.nowComp.fmKg + now.nowComp.ffmKg)}kg` },
              { cell: endCell, badge: '예상' as const, txt: `${kg(project.end.weightKg)}kg` },
            ].map((x) => (
              <View key={x.badge} style={s.col}>
                <AvatarView sex={sex} cell={x.cell} width={colW} badge={x.badge} />
                <Text style={s.colTxt}>{x.txt}</Text>
              </View>
            ))}
          </View>

          {!pro ? (
            <View style={s.paused}>
              <Text style={s.pausedTitle}>프로젝트가 멈춰 있어요</Text>
              <Text style={s.pausedTxt}>구독이 끝나 체크인과 맞춤 루틴·식단이 멈췄어요. 기록은 그대로 남아 있고, 다시 구독하면 지금 몸에서 이어서 계산해요.</Text>
              <PressableScale style={s.cta} onPress={() => router.push('/subscribe?f=body_project')}>
                <Text style={s.ctaTxt}>다시 시작하기</Text>
              </PressableScale>
            </View>
          ) : result ? (
            <Animated.View entering={FadeInDown.duration(300)}>
              <ResultCard r={result} />
            </Animated.View>
          ) : due ? (
            <View style={s.form}>
              <SectionLabel>{`${checkins.length + 1}번째 체크인`}</SectionLabel>
              <Text style={s.label}>체중 (kg)</Text>
              <TextInput style={s.input} keyboardType="decimal-pad" value={w} onChangeText={setW} accessibilityLabel="체중 (kg)" />
              <Text style={s.label}>허리둘레 (cm) · 선택</Text>
              <TextInput style={s.input} keyboardType="decimal-pad" value={waist} onChangeText={setWaist}
                placeholder="그래프로만 기록해요" placeholderTextColor={colors.placeholder} accessibilityLabel="허리둘레 (cm)" />
              <View style={s.toggle}>
                <Text style={s.toggleTxt}>인바디 결과가 있어요</Text>
                <Switch value={ib.on} onValueChange={(v) => setIb({ ...ib, on: v })}
                  trackColor={{ false: colors.line2, true: colors.ink }} thumbColor={ib.on ? colors.bg : colors.mid} />
              </View>
              {ib.on ? (
                <View style={s.row2}>
                  <TextInput style={[s.input, s.flex]} keyboardType="decimal-pad" value={ib.bf} onChangeText={(v) => setIb({ ...ib, bf: v })}
                    placeholder="체지방률 %" placeholderTextColor={colors.placeholder} accessibilityLabel="체지방률 (%)" />
                  <TextInput style={[s.input, s.flex]} keyboardType="decimal-pad" value={ib.smm} onChangeText={(v) => setIb({ ...ib, smm: v })}
                    placeholder="골격근량 kg" placeholderTextColor={colors.placeholder} accessibilityLabel="골격근량 (kg)" />
                  <TextInput style={[s.input, s.flex]} value={ib.date} onChangeText={(v) => setIb({ ...ib, date: v })} maxLength={10}
                    placeholder="YYYY-MM-DD" placeholderTextColor={colors.placeholder} accessibilityLabel="측정일" />
                </View>
              ) : null}
              {err ? <Text style={s.err} accessibilityRole="alert">{err}</Text> : null}
              <PressableScale style={[s.cta, { marginTop: 16 }]} onPress={submit} disabled={busy} accessibilityLabel="체크인하기">
                {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={s.ctaTxt}>체크인하기</Text>}
              </PressableScale>
              {busy ? <Text style={s.wait}>예측과 비교하고 리포트를 쓰는 중이에요</Text> : null}
            </View>
          ) : (
            <View style={s.next}>
              <Text style={s.nextBig}>다음 체크인까지 D-{now.dueIn}</Text>
              <Text style={s.nextTxt}>그동안 주에 한 번 체중을 기록하면 "지금" 몸이 따라 바뀌어요.</Text>
            </View>
          )}

          {now.latest && !result ? (
            <View style={s.last}>
              <SectionLabel>지난 체크인</SectionLabel>
              <Text style={s.status}>{STATUS_TEXT[now.latest.status]}</Text>
              <Text style={s.lastNum}>
                예상 진행 {Math.round(now.latest.expectedProgressPct)}% · 실제 {Math.round(now.latest.measuredProgressPct)}%
                {' · '}체지방 {pct1(now.latest.comp.bfPct)}%
              </Text>
              {report ? <ReportBody r={report} statusText={STATUS_TEXT[now.latest.status]} /> : null}
            </View>
          ) : null}
        </Body>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function ResultCard({ r }: { r: CheckinResult & { cellChanged: boolean } }) {
  useThemeMode();
  return (
    <View style={s.result}>
      {r.cellChanged ? <Text style={s.changed}>한 단계 변했어요</Text> : null}
      <Text style={s.status}>{STATUS_TEXT[r.status]}</Text>
      <Text style={s.lastNum}>예상 진행 {Math.round(r.expectedProgressPct)}% · 실제 {Math.round(r.measuredProgressPct)}%</Text>
      {r.recalculated ? (
        <Text style={s.recalc}>
          {r.recalculated.delayMonths > 0
            ? `완료 예상이 ${r.recalculated.delayMonths}개월 늦어졌어요 (전체 ${r.recalculated.months}개월)`
            : `완료 예상을 지금 몸 기준으로 다시 계산했어요 (전체 ${r.recalculated.months}개월)`}
        </Text>
      ) : null}
      <ReportBody r={r.report} statusText={STATUS_TEXT[r.status]} />
    </View>
  );
}

/** statusText: 바로 위에 이미 보인 상태 문구 — 리포트 헤드라인이 같으면(템플릿) 두 번 쓰지 않는다 */
function ReportBody({ r, statusText }: { r: BodyReportBody; statusText?: string }) {
  useThemeMode();
  return (
    <View style={s.report}>
      {r.headline && r.headline !== statusText ? <Text style={s.headline}>{r.headline}</Text> : null}
      {r.wins.length ? <Text style={s.repLabel}>잘한 점</Text> : null}
      {r.wins.map((t) => <Text key={t} style={s.repItem}>· {t}</Text>)}
      {r.adjust.length ? <Text style={s.repLabel}>바꿀 점</Text> : null}
      {r.adjust.map((t) => <Text key={t} style={s.repItem}>· {t}</Text>)}
      {r.nextFocus ? (
        <>
          <Text style={s.repLabel}>다음 4주</Text>
          <Text style={s.repItem}>{r.nextFocus}</Text>
        </>
      ) : null}
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  name: { fontSize: 21, fontWeight: '800', color: colors.ink, marginTop: 4 },
  meta: { fontSize: 12.5, color: colors.muted, marginTop: 4 },
  trio: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, marginBottom: 6 },
  col: { alignItems: 'center', flex: 1 },
  colTxt: { fontSize: 12.5, color: colors.mid, marginTop: 6, fontWeight: '700' },
  form: { marginTop: 14 },
  label: { fontSize: 12, color: colors.muted, marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line2,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.ink,
  },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  toggleTxt: { fontSize: 14, color: colors.ink, fontWeight: '600' },
  row2: { flexDirection: 'row', gap: 6, marginTop: 8 },
  flex: { flex: 1, fontSize: 13, paddingHorizontal: 10 },
  err: { fontSize: 12.5, color: colors.wrong, marginTop: 10 },
  wait: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 8 },
  cta: { backgroundColor: colors.ink, borderRadius: 14, paddingVertical: 15, alignItems: 'center', minHeight: 50, justifyContent: 'center' },
  ctaTxt: { color: colors.bg, fontSize: 15, fontWeight: '800' },
  next: { marginTop: 14, backgroundColor: colors.panel, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.line },
  nextBig: { fontSize: 18, fontWeight: '800', color: colors.ink },
  nextTxt: { fontSize: 12.5, color: colors.muted, marginTop: 6, lineHeight: 18 },
  paused: { marginTop: 14, backgroundColor: colors.panel, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.line2, gap: 8 },
  pausedTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  pausedTxt: { fontSize: 12.5, color: colors.muted, lineHeight: 19 },
  last: { marginTop: 18 },
  result: { marginTop: 14, backgroundColor: colors.panel, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.line2 },
  changed: { fontSize: 12, fontWeight: '800', color: colors.good, marginBottom: 6 },
  status: { fontSize: 18, fontWeight: '800', color: colors.ink },
  lastNum: { fontSize: 12.5, color: colors.mid, marginTop: 4 },
  recalc: { fontSize: 13, color: colors.pr, fontWeight: '700', marginTop: 8, lineHeight: 19 },
  report: { marginTop: 12, gap: 3 },
  headline: { fontSize: 15, fontWeight: '800', color: colors.ink, lineHeight: 22 },
  repLabel: { fontSize: 11, fontWeight: '800', color: colors.muted, letterSpacing: 1, marginTop: 10 },
  repItem: { fontSize: 13, color: colors.mid, lineHeight: 20 },
}));
