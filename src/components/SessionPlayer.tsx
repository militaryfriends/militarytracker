import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, FlatList,
  Vibration, Platform, ActivityIndicator, KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, themed, useThemeMode } from '../theme';
import { showAlert } from '../utils/alert';
import { useAppStore } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import { exById, exFilter, Exercise, PART_LABEL } from '../data/exercises';
import { persistLog } from '../services/sync';
import { useCountdown, useElapsed } from '../hooks/useCountdown';
import { fmtClock, fmtSetDetail, lastSetsOf, prIdsIn } from '../utils/stats';
import ExerciseMedia from './ExerciseMedia';

/** 휴식 종료 알림 — 네이티브는 진동, 웹은 지원 브라우저에서만 */
function buzz() {
  if (Platform.OS !== 'web') {
    Vibration.vibrate([0, 220, 120, 220]);
    return;
  }
  const nav = (globalThis as { navigator?: { vibrate?: (p: number[]) => void } }).navigator;
  try { nav?.vibrate?.([220, 120, 220]); } catch { /* unsupported */ }
}

export default function SessionPlayer() {
  useThemeMode();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const session = useAppStore((s) => s.session);
  const profile = useAppStore((s) => s.profile);
  const logs = useAppStore((s) => s.logs);
  const setVal = useAppStore((s) => s.setVal);
  const toggleSet = useAppStore((s) => s.toggleSet);
  const addSet = useAppStore((s) => s.addSet);
  const removeSet = useAppStore((s) => s.removeSet);
  const goToEx = useAppStore((s) => s.goToEx);
  const moveEx = useAppStore((s) => s.moveEx);
  const stopRest = useAppStore((s) => s.stopRest);
  const startRest = useAppStore((s) => s.startRest);
  const buildLog = useAppStore((s) => s.buildLog);
  const closeSession = useAppStore((s) => s.closeSession);
  const clearSession = useAppStore((s) => s.clearSession);
  const setSummary = useAppStore((s) => s.setSummary);
  const swapExercise = useAppStore((s) => s.swapExercise);
  const appendExercise = useAppStore((s) => s.appendExercise);

  const rest = useCountdown(session?.restEndsAt ?? null);
  const elapsed = useElapsed(session?.startedAt ?? null);
  const [picker, setPicker] = useState<'swap' | 'add' | null>(null);
  const [saving, setSaving] = useState(false);
  const wasResting = useRef(false);
  // 무게 → 횟수 → 다음 세트 무게로 키보드 '다음' 이 이동하도록
  const inputRefs = useRef<Record<string, TextInput | null>>({});

  // 휴식이 끝나는 순간 알린다
  useEffect(() => {
    if (rest > 0) {
      wasResting.current = true;
      return;
    }
    if (wasResting.current) {
      wasResting.current = false;
      buzz();
    }
  }, [rest]);

  if (!session) return null;

  const cur = session.data[session.exIdx];
  const e = cur ? exById(cur.id) : undefined;
  if (!cur) return null;

  const isLast = session.exIdx === session.data.length - 1;
  const doneAll = session.data.every((x) => x.sets.every((t) => t.done));
  const completedSets = cur.sets.filter((t) => t.done).length;
  const anyRecorded = session.data.some((x) => x.sets.some((t) => t.done));
  const last = lastSetsOf(logs, cur.id);
  const usedKey = session.data.map((x) => x.id).join(',');

  /**
   * ✓ — 빈 칸은 지난 기록(placeholder)으로 채우고 완료한다.
   * placeholder 만 보고 ✓ 를 누르면 예전엔 세트가 조용히 버려졌다(저장 시 빈 세트 제외).
   */
  function handleToggle(si: number) {
    const st = cur.sets[si];
    if (!st.done) {
      const ref = last?.detail[si];
      let w = st.w.trim();
      let r = st.r.trim();
      if (!w && ref && ref.w > 0) { w = String(ref.w); setVal(si, 'w', w); }
      if (!r && ref && ref.r > 0) { r = String(ref.r); setVal(si, 'r', r); }
      if (!w && !r) {
        showAlert('세트 입력', '무게 또는 횟수를 입력한 뒤 완료할 수 있습니다.');
        return;
      }
    }
    toggleSet(si);
  }

  function handleRemove(si: number) {
    const st = cur.sets[si];
    if (cur.sets.length <= 1) return;
    if (!st.w.trim() && !st.r.trim() && !st.done) { removeSet(si); return; }
    showAlert('세트 삭제', `${si + 1}세트를 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => removeSet(si) },
    ]);
  }

  function focusNext(si: number, field: 'w' | 'r') {
    const key = field === 'w' ? `${si}-r` : `${si + 1}-w`;
    inputRefs.current[key]?.focus();
  }

  async function handleFinish() {
    if (!user || saving) return;
    const log = buildLog(user.uid);
    if (!log) return;

    // 기록이 하나도 없으면 로그를 남기지 않고 그냥 닫는다
    if (log.totalSets === 0) {
      showAlert('운동 취소', '기록된 세트가 없습니다. 이 운동을 저장하지 않고 닫을까요?', [
        { text: '계속하기', style: 'cancel' },
        { text: '저장 없이 닫기', style: 'destructive', onPress: () => clearSession() },
      ]);
      return;
    }

    setSaving(true);
    const prIds = prIdsIn(log, logs, user.stats);
    // 오프라인이면 8초 안에 돌아온다 — 기기에 보관되고 다음 기회에 올라간다
    const saved = await persistLog(user.uid, log);
    setSaving(false);
    closeSession();
    setSummary({
      dayName: log.dayName,
      totalSets: log.totalSets,
      totalVolume: log.totalVolume,
      durationSec: log.durationSec,
      exercises: log.exercises,
      prIds: [...new Set(prIds)],
      saved,
    });
  }

  function handleClose() {
    if (!anyRecorded) {
      showAlert('운동 종료', '기록된 세트가 없습니다. 저장하지 않고 닫을까요?', [
        { text: '계속하기', style: 'cancel' },
        { text: '닫기', style: 'destructive', onPress: () => clearSession() },
      ]);
      return;
    }
    showAlert('운동 종료', '완료한 세트는 저장됩니다.', [
      { text: '취소', style: 'cancel' },
      { text: '종료', style: 'destructive', onPress: handleFinish },
    ]);
  }

  return (
    <View style={s.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity activeOpacity={0.7}
          style={s.closeBtn}
          onPress={handleClose}
          disabled={saving}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={anyRecorded ? '운동 종료하고 저장' : '운동 취소'}
        >
          <Text style={s.closeTxt}>✕</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerDay} maxFontSizeMultiplier={1.3}>{session.dayName}</Text>
          <Text style={s.headerProgress} maxFontSizeMultiplier={1.3}>
            {session.exIdx + 1} / {session.data.length} · {fmtClock(elapsed)}
          </Text>
        </View>
        {/* 마지막 종목이 아니어도 언제든 끝낼 수 있게 — 예전엔 ✕ 가 유일한 완료 경로였다 */}
        <TouchableOpacity activeOpacity={0.7}
          style={[s.finishBtn, !anyRecorded && s.navOff]}
          onPress={handleFinish}
          disabled={saving || !anyRecorded}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="운동 완료하고 저장"
        >
          {saving ? <ActivityIndicator color={colors.ink} size="small" /> : <Text style={s.finishTxt}>완료</Text>}
        </TouchableOpacity>
      </View>

      <View style={s.mediaArea}>
        <ExerciseMedia exId={cur.id} autoPlay rounded={24} dim={0.25} style={s.media} />
        <View style={s.mediaMeta}>
          <Text style={s.exName}>{e?.n ?? ''}</Text>
          <Text style={s.exPart}>{e ? `${PART_LABEL[e.part]} · ${e.g} · 권장 ${e.r}` : ''}</Text>
        </View>

        <View style={s.lastRow}>
          {last ? (
            <Text style={s.lastTxt} numberOfLines={1}>
              지난 기록 <Text style={s.lastDate}>{last.date.slice(5)}</Text>{'  '}
              <Text style={s.lastSets}>{last.detail.map(fmtSetDetail).join('  ')}</Text>
            </Text>
          ) : (
            <Text style={s.lastEmpty}>이 종목의 첫 기록입니다</Text>
          )}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filmScroll}
        contentContainerStyle={s.filmContent}
      >
        {session.data.map((ex, i) => {
          const info = exById(ex.id);
          const done = ex.sets.every((t) => t.done);
          const active = i === session.exIdx;
          return (
            <TouchableOpacity activeOpacity={0.7}
              key={`${ex.id}-${i}`}
              style={[s.filmCell, active && s.filmCellActive, done && !active && s.filmCellDone]}
              onPress={() => goToEx(i)}
              accessibilityRole="button"
              accessibilityLabel={`${i + 1}번 ${info?.n ?? ''}${done ? ', 완료' : ''}`}
              accessibilityState={{ selected: active }}
            >
              <Text style={[s.filmNum, active && s.filmNumActive]}>{i + 1}</Text>
              <Text style={[s.filmName, active && s.filmNameActive]} numberOfLines={2}>
                {info?.n ?? ''}
              </Text>
              {done && <Text style={s.filmCheck}>✓</Text>}
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity activeOpacity={0.7} style={[s.filmCell, s.filmAdd]} onPress={() => setPicker('add')} accessibilityRole="button" accessibilityLabel="종목 추가">
          <Text style={s.filmAddTxt}>＋</Text>
          <Text style={s.filmAddLabel}>종목 추가</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
        <View style={s.grab} />

        {/* 휴식 슬롯은 항상 같은 높이로 자리를 잡는다 — 마운트/언마운트되면 방금 누른 ✓ 가 손가락 아래서 밀린다 */}
        <View style={[s.restBox, rest > 0 && s.restBoxOn]}>
          {rest > 0 ? (
            <>
              <View style={s.restLeft}>
                <Text style={s.restLabel}>휴식</Text>
                <Text style={s.restTime} maxFontSizeMultiplier={1.2}>{fmtClock(rest)}</Text>
              </View>
              <View style={s.restBtns}>
                <TouchableOpacity activeOpacity={0.7} style={s.skipBtn} onPress={() => startRest(rest + 30)} accessibilityRole="button" accessibilityLabel="휴식 30초 추가">
                  <Text style={s.skipTxt}>+30초</Text>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.7} style={s.skipBtn} onPress={stopRest} accessibilityRole="button" accessibilityLabel="휴식 건너뛰기">
                  <Text style={s.skipTxt}>건너뛰기</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <View style={s.restLeft}>
                <Text style={s.restLabel}>세트</Text>
                <Text style={s.restTime} maxFontSizeMultiplier={1.2}>{completedSets}/{cur.sets.length}</Text>
              </View>
              <Text style={s.restHint}>세트를 완료하면 {e?.rest ?? 75}초 휴식이 시작됩니다</Text>
            </>
          )}
        </View>

        <View style={s.sheetHead}>
          <Text style={s.sheetTitle}>세트 기록 · 길게 눌러 삭제</Text>
          <TouchableOpacity activeOpacity={0.7} onPress={() => setPicker('swap')} hitSlop={12} accessibilityRole="button" accessibilityLabel="종목 교체">
            <Text style={s.swapLink}>종목 교체</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={s.setsScroll}
          contentContainerStyle={s.setsContainer}
          keyboardShouldPersistTaps="handled"
        >
          {cur.sets.map((st, si) => {
            const ref = last?.detail[si];
            const isLastRow = si === cur.sets.length - 1;
            return (
              <View key={si} style={s.setRow}>
                <Text style={[s.setNum, st.done && s.setNumDone]} maxFontSizeMultiplier={1.3}>{si + 1}</Text>
                <TextInput
                  ref={(r) => { inputRefs.current[`${si}-w`] = r; }}
                  style={[s.setInput, st.done && s.setInputDone]}
                  placeholder={ref && ref.w > 0 ? String(ref.w) : 'kg'}
                  placeholderTextColor={colors.placeholder}
                  keyboardType="decimal-pad"
                  value={st.w}
                  onChangeText={(v) => setVal(si, 'w', v)}
                  selectTextOnFocus
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => focusNext(si, 'w')}
                  accessibilityLabel={`${si + 1}세트 무게`}
                />
                <Text style={s.setX}>×</Text>
                <TextInput
                  ref={(r) => { inputRefs.current[`${si}-r`] = r; }}
                  style={[s.setInput, st.done && s.setInputDone]}
                  placeholder={ref ? String(ref.r) : '회'}
                  placeholderTextColor={colors.placeholder}
                  keyboardType="numeric"
                  value={st.r}
                  onChangeText={(v) => setVal(si, 'r', v)}
                  selectTextOnFocus
                  returnKeyType={isLastRow ? 'done' : 'next'}
                  blurOnSubmit={isLastRow}
                  onSubmitEditing={() => { if (!isLastRow) focusNext(si, 'r'); }}
                  accessibilityLabel={`${si + 1}세트 횟수`}
                />
                <TouchableOpacity activeOpacity={0.7}
                  style={[s.ck, st.done && s.ckDone]}
                  onPress={() => handleToggle(si)}
                  onLongPress={() => handleRemove(si)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: st.done }}
                  accessibilityLabel={`${si + 1}세트 완료`}
                  accessibilityHint="길게 누르면 세트를 삭제합니다"
                >
                  <Text style={[s.ckTxt, st.done && s.ckTxtDone]}>{st.done ? '✓' : '○'}</Text>
                </TouchableOpacity>
              </View>
            );
          })}
          <TouchableOpacity activeOpacity={0.7} style={s.addSet} onPress={addSet} accessibilityRole="button">
            <Text style={s.addSetTxt}>+ 세트 추가</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={s.navRow}>
          <TouchableOpacity activeOpacity={0.7}
            style={[s.navBtn, s.navGhost, session.exIdx === 0 && s.navOff]}
            disabled={session.exIdx === 0}
            onPress={() => moveEx(-1)}
            accessibilityRole="button"
            accessibilityLabel="이전 종목"
            accessibilityState={{ disabled: session.exIdx === 0 }}
          >
            <Text style={s.navGhostTxt}>← 이전</Text>
          </TouchableOpacity>
          {isLast ? (
            <TouchableOpacity activeOpacity={0.7} style={[s.navBtn, s.navSolid]} onPress={handleFinish} disabled={saving} accessibilityRole="button">
              {saving ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <Text style={s.navSolidTxt}>{doneAll ? '운동 완료 ✓' : '저장하고 종료'}</Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity activeOpacity={0.7} style={[s.navBtn, s.navSolid]} onPress={() => moveEx(1)} accessibilityRole="button" accessibilityLabel="다음 종목">
              <Text style={s.navSolidTxt}>다음 →</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      </KeyboardAvoidingView>

      {picker && (
        <ExercisePicker
          mode={picker}
          currentId={cur.id}
          usedKey={usedKey}
          place={profile?.env ?? 'gym'}
          onClose={() => setPicker(null)}
          onPick={(id) => {
            if (picker === 'swap') swapExercise(id);
            else appendExercise(id);
            setPicker(null);
          }}
        />
      )}
    </View>
  );
}

// ─── 종목 선택 시트 ─────────────────────────────────────────────────────────
function ExercisePicker({
  mode, currentId, usedKey, place, onClose, onPick,
}: {
  mode: 'swap' | 'add';
  currentId: string;
  /** 세션에 있는 종목 id 를 ','로 이은 문자열 — 배열을 넘기면 매 렌더 새 참조라 메모가 무효다 */
  usedKey: string;
  place: 'gym' | 'home';
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  useThemeMode();
  const insets = useSafeAreaInsets();
  const cur = exById(currentId);
  const [sameOnly, setSameOnly] = useState(mode === 'swap');
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const used = new Set(usedKey.split(',').filter(Boolean));
    // 공백을 무시하고 비교 — "벤치 프레스" 로 "벤치프레스" 를 찾는다
    const keyword = q.replace(/\s+/g, '');
    return exFilter({ place, ...(sameOnly && cur ? { part: cur.part } : {}) })
      // 이미 세션에 들어있는 종목은 제외 — 중복되면 기록이 뭉개진다
      .filter((x) => (mode === 'swap' ? x.id !== currentId : true) && !used.has(x.id))
      .filter((x) => !keyword || x.n.replace(/\s+/g, '').includes(keyword) || x.g.replace(/\s+/g, '').includes(keyword));
  }, [place, sameOnly, cur, q, usedKey, mode, currentId]);

  return (
    <View style={[p.root, { paddingTop: insets.top + 16 }]}>
      <View style={p.head}>
        <View style={{ flex: 1 }}>
          <Text style={p.title}>{mode === 'swap' ? '종목 교체' : '종목 추가'}</Text>
          <Text style={p.sub}>
            {mode === 'swap' && cur ? `${cur.n} → 다른 종목으로` : '세션 맨 뒤에 추가됩니다'}
          </Text>
        </View>
        <TouchableOpacity activeOpacity={0.7} style={p.close} onPress={onClose}>
          <Text style={p.closeTxt}>✕</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={p.search}
        placeholder="종목 검색"
        placeholderTextColor={colors.muted}
        value={q}
        onChangeText={setQ}
        autoCorrect={false}
      />

      {cur && (
        <View style={p.filterRow}>
          <TouchableOpacity activeOpacity={0.7} style={[p.chip, sameOnly && p.chipOn]} onPress={() => setSameOnly(true)}>
            <Text style={[p.chipTxt, sameOnly && p.chipTxtOn]}>
              같은 부위 ({PART_LABEL[cur.part]})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} style={[p.chip, !sameOnly && p.chipOn]} onPress={() => setSameOnly(false)}>
            <Text style={[p.chipTxt, !sameOnly && p.chipTxtOn]}>전체</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={list}
        keyExtractor={(x) => x.id}
        contentContainerStyle={p.listInner}
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={p.empty}>조건에 맞는 종목이 없습니다.</Text>}
        renderItem={({ item }) => <PickerRow ex={item} onPick={() => onPick(item.id)} />}
      />
    </View>
  );
}

function PickerRow({ ex, onPick }: { ex: Exercise; onPick: () => void }) {
  useThemeMode();
  return (
    <TouchableOpacity style={p.row} activeOpacity={0.75} onPress={onPick}>
      <ExerciseMedia exId={ex.id} rounded={10} style={p.thumb} dim={0.3} />
      <View style={{ flex: 1 }}>
        <Text style={p.name}>{ex.n}</Text>
        <Text style={p.meta}>{PART_LABEL[ex.part]} · {ex.g} · {ex.s}세트 {ex.r}</Text>
      </View>
      <Text style={p.pick}>선택</Text>
    </TouchableOpacity>
  );
}

const s = themed(() => StyleSheet.create({
  root: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.bg, zIndex: 40, flexDirection: 'column',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
  },
  closeBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.panel2, alignItems: 'center', justifyContent: 'center',
  },
  closeTxt: { fontSize: 16, color: colors.mid },
  headerCenter: { alignItems: 'center', flex: 1 },
  headerDay: { fontSize: 13, fontWeight: '700', color: colors.ink },
  headerProgress: { fontSize: 11, color: colors.muted, marginTop: 2 },
  finishBtn: {
    minWidth: 56, height: 44, borderRadius: 22, paddingHorizontal: 14,
    borderWidth: 1, borderColor: colors.line2, backgroundColor: colors.panel2,
    alignItems: 'center', justifyContent: 'center',
  },
  finishTxt: { fontSize: 13, fontWeight: '700', color: colors.ink },

  mediaArea: { flex: 1, paddingHorizontal: 20, justifyContent: 'center', gap: 12, minHeight: 120 },
  media: { width: '100%', aspectRatio: 1, maxHeight: 260, alignSelf: 'center', flexShrink: 1 },
  mediaMeta: { alignItems: 'center' },
  exName: { fontSize: 21, fontWeight: '800', color: colors.ink, textAlign: 'center', letterSpacing: -0.3 },
  exPart: { fontSize: 12, color: colors.muted, marginTop: 4, textAlign: 'center' },
  lastRow: {
    backgroundColor: colors.panel2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: colors.line,
  },
  lastTxt: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  lastDate: { color: colors.mid },
  lastSets: { color: colors.ink, fontWeight: '700' },
  lastEmpty: { fontSize: 12, color: colors.muted, textAlign: 'center' },

  // 가로 스크롤러: ScrollView 기본값이 flexShrink:1 이라 형제에 눌려 잘린다
  filmScroll: { flexGrow: 0, flexShrink: 0 },
  filmContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filmCell: {
    width: 80, borderRadius: 12, padding: 10,
    backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line,
    alignItems: 'center',
  },
  filmCellActive: { borderColor: colors.ink, backgroundColor: colors.panel3 },
  filmCellDone: { opacity: 0.5 },
  filmNum: { fontSize: 10, fontWeight: '700', color: colors.muted, letterSpacing: 0.5, marginBottom: 4 },
  filmNumActive: { color: colors.ink },
  filmName: { fontSize: 10, color: colors.muted, textAlign: 'center', lineHeight: 13 },
  filmNameActive: { color: colors.ink },
  filmCheck: { fontSize: 11, color: colors.mid, marginTop: 4 },
  filmAdd: { borderStyle: 'dashed', justifyContent: 'center' },
  filmAddTxt: { fontSize: 17, color: colors.muted, marginBottom: 2 },
  filmAddLabel: { fontSize: 10, color: colors.muted },

  sheet: {
    backgroundColor: colors.panel, borderTopWidth: 1, borderTopColor: colors.line2,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 16, paddingTop: 8, maxHeight: '56%',
  },
  grab: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.line2, alignSelf: 'center', marginBottom: 12,
  },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sheetTitle: { fontSize: 10.5, fontWeight: '700', color: colors.muted, letterSpacing: 0.8 },
  swapLink: { fontSize: 12, color: colors.mid, fontWeight: '600' },

  restBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.panel2, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 8, marginBottom: 12, minHeight: 60,
  },
  restBoxOn: { backgroundColor: colors.panel3 },
  restLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  restLabel: { fontSize: 12, color: colors.muted },
  restTime: { fontSize: 22, fontWeight: '800', color: colors.ink },
  restHint: { fontSize: 11, color: colors.muted, flexShrink: 1, textAlign: 'right' },
  restBtns: { flexDirection: 'row', gap: 6 },
  skipBtn: {
    borderWidth: 1, borderColor: colors.line2, borderRadius: 22, minHeight: 44,
    paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center',
  },
  skipTxt: { fontSize: 13, fontWeight: '600', color: colors.ink },

  setsScroll: { flexGrow: 0 },
  setsContainer: { gap: 8, paddingBottom: 8 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  setNum: { fontSize: 11, color: colors.muted, width: 18, textAlign: 'right', flexShrink: 0 },
  setNumDone: { color: colors.good },
  setInput: {
    flex: 1, backgroundColor: colors.panel2,
    borderWidth: 1, borderColor: colors.line2,
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 10,
    fontSize: 16, color: colors.ink, textAlign: 'center', fontWeight: '600',
  },
  // 완료한 세트는 흐리게가 아니라 '확정' 으로 보이게 — 값은 여전히 읽혀야 한다
  setInputDone: { borderColor: colors.line, color: colors.mid, backgroundColor: colors.panel },
  setX: { fontSize: 12, color: colors.muted },
  ck: {
    width: 44, height: 44, borderRadius: 10,
    borderWidth: 1, borderColor: colors.line2,
    backgroundColor: colors.panel3,
    alignItems: 'center', justifyContent: 'center',
  },
  ckDone: { backgroundColor: colors.good, borderColor: colors.good },
  ckTxt: { fontSize: 16, color: colors.muted },
  ckTxtDone: { color: colors.bg, fontWeight: '700' },
  addSet: { paddingVertical: 10, alignItems: 'center' },
  addSetTxt: { fontSize: 12.5, color: colors.muted, fontWeight: '600' },

  navRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  navBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  navGhost: { borderWidth: 1, borderColor: colors.line2 },
  navGhostTxt: { color: colors.mid, fontSize: 14, fontWeight: '700' },
  navSolid: { backgroundColor: colors.ink },
  navSolidTxt: { color: colors.bg, fontSize: 14, fontWeight: '700' },
  navOff: { opacity: 0.3 },
}));

const p = themed(() => StyleSheet.create({
  root: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.bg, zIndex: 60,
  },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 12 },
  title: { fontSize: 20, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 12, color: colors.muted, marginTop: 3 },
  close: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.panel2, alignItems: 'center', justifyContent: 'center',
  },
  closeTxt: { fontSize: 15, color: colors.mid },
  search: {
    marginHorizontal: 20, marginTop: 14,
    backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line2,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: colors.ink,
  },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginTop: 12 },
  chip: {
    backgroundColor: colors.panel2, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: colors.line,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipTxt: { fontSize: 12, fontWeight: '600', color: colors.muted },
  chipTxtOn: { color: colors.bg },
  listInner: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 40 },
  empty: { color: colors.muted, fontSize: 13, textAlign: 'center', marginTop: 30 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.panel, borderRadius: 14, padding: 10,
    borderWidth: 1, borderColor: colors.line, marginBottom: 8,
  },
  thumb: { width: 48, height: 48 },
  name: { fontSize: 14, fontWeight: '600', color: colors.ink },
  meta: { fontSize: 10.5, color: colors.muted, marginTop: 2 },
  pick: { fontSize: 12, color: colors.mid, fontWeight: '700' },
}));
