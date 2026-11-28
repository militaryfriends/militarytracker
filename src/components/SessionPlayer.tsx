import { prescription, repsText, rxText } from '../utils/prescription';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, TextInput, StyleSheet, ScrollView, FlatList,
  Vibration, Platform, ActivityIndicator, KeyboardAvoidingView, Keyboard, PanResponder,
} from 'react-native';
import { Text } from './Text';
import type { TextInputInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Extrapolation, cancelAnimation, interpolate, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { colors, themed, useThemeMode } from '../theme';
import { FONT, PressableScale, PRESS_SCALE, SPRING, haptic } from '../ui';
import { showAlert } from '../utils/alert';
import { useAppStore } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import { exById, exFilter, Exercise, PART_LABEL } from '../data/exercises';
import { persistLog } from '../services/sync';
import { useCountdown, useElapsed } from '../hooks/useCountdown';
import { fmtClock, fmtSetDetail, lastSetsOf, prIdsIn } from '../utils/stats';
import ExerciseMedia from './ExerciseMedia';
import { ProgressRing } from '../ui/ProgressRing';
import { useScreenSize } from '../ui/screenSize';

/** 휴식 종료 알림 — 네이티브는 진동, 웹은 지원 브라우저에서만 */
function buzz() {
  if (Platform.OS !== 'web') {
    Vibration.vibrate([0, 220, 120, 220]);
    return;
  }
  const nav = (globalThis as { navigator?: { vibrate?: (p: number[]) => void } }).navigator;
  try { nav?.vibrate?.([220, 120, 220]); } catch { /* unsupported */ }
}

/** 접었을 때 영상 줄의 높이 · 작은 영상 칸 */
const COMPACT_H = 72;
const THUMB = 56;

/**
 * 영상은 화면 폭 1:1 이 기본 — 다만 아래에 지난 기록 + 세트 2줄은 늘 보이게 남은 높이로 줄인다.
 * 476 = 머리줄 68 + 종목 탭 76 + 휴식칸 · 이전/다음 · 여백 156 + 지난 기록 · 세트 2줄 168 + 여유 8. 키패드가 뜨면 작게.
 */
function mediaSizeFor(winW: number, winH: number, insetV: number, kb: boolean) {
  const roomH = winH - insetV - 476;
  return kb
    ? Math.round(Math.min(winW - 32, winH * 0.16))
    : Math.round(Math.max(180, Math.min(winW - 32, 480, roomH)));
}

/** 세트 완료 ✓ — 누르면 눌렸다 튕기고, 완료되는 순간 톡 튀어나온다 */
function SetCheck({ done, now, label, onPress, onLongPress }: {
  done: boolean; now: boolean; label: string; onPress: () => void; onLongPress: () => void;
}) {
  useThemeMode();
  const pop = useSharedValue(1);
  const was = useRef(done);
  useEffect(() => {
    if (done && !was.current) pop.value = withSequence(withTiming(0.72, { duration: 70 }), withSpring(1, SPRING.pop));
    was.current = done;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return (
    <PressableScale haptic={false} scaleTo={PRESS_SCALE.small}
      onPress={onPress} onLongPress={onLongPress}
      accessibilityRole="checkbox" accessibilityState={{ checked: done }}
      accessibilityLabel={label} accessibilityHint="길게 누르면 세트를 삭제합니다">
      <Animated.View style={[s.ck, done && s.ckDone, now && s.ckNow, anim]}>
        {done || now
          ? <Ionicons name="checkmark" size={18} color={(StyleSheet.flatten([s.ckTxt, done && s.ckTxtDone, now && s.ckTxtNow])?.color as string)} />
          : <View style={s.ckDot} />}
      </Animated.View>
    </PressableScale>
  );
}

export default function SessionPlayer() {
  useThemeMode();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useScreenSize();
  const user = useAuthStore((s) => s.user);
  const session = useAppStore((s) => s.session);
  const profile = useAppStore((s) => s.profile);
  const lv = (profile?.level ?? 2) as 1 | 2 | 3;
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
  // 키패드가 뜨면 영상을 작게 — 고정 영상 + 키패드에 세트 칸이 눌려 안 보이지 않게
  const [kb, setKb] = useState(false);
  useEffect(() => {
    const a = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKb(true));
    const b = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(false));
    return () => { a.remove(); b.remove(); };
  }, []);
  // 무게 → 횟수 → 다음 세트 무게로 키보드 '다음' 이 이동하도록
  const inputRefs = useRef<Record<string, TextInputInstance | null>>({});

  // 원형 휴식 타이머의 전체 길이 — 휴식이 시작될 때(+15초로 늘리면 그만큼) 잡는다
  const restTotal = useRef(0);
  /**
   * 시트 올리기 — 손가락을 따라 움직이고, 놓으면 가까운 자리(영상 펼침 0 · 세트 칸 올림 1)로 스프링처럼 붙는다.
   *  · 끌 수 있는 자리: 영상, 손잡이, 휴식 칸(시트 윗부분 전체). 손잡이는 눌러도 오르내린다.
   *  · 빠르게 튕기면 그 방향으로, 천천히 놓으면 절반을 넘었는지로 정한다. 끝을 넘겨 끌면 고무줄처럼 덜 따라온다.
   *  · 영상은 접히는 동안 계속 재생되며 왼쪽 위 작은 칸으로 줄어든다(같은 플레이어 — 다시 받지 않는다).
   * 웹(마우스 · 터치)도 같은 코드.
   */
  const pos = useSharedValue(0);
  const posJs = useRef(0); // JS 쪽 사본 — 끌기 시작 위치 · 놓을 때 판단
  const dragFrom = useRef(0);
  const movedAt = useRef(0);
  const travel = useRef(1); // 다 올렸을 때 시트 윗변이 움직이는 거리(px)
  const [up, setUp] = useState(false);
  const upRef = useRef(false);
  const settle = useRef((to: 0 | 1, velocity = 0) => {
    posJs.current = to;
    pos.value = withSpring(to, { ...SPRING.snap, velocity });
    if (upRef.current !== (to === 1)) {
      upRef.current = to === 1;
      haptic.select();
      setUp(to === 1);
    }
  }).current;
  const sheetPan = useMemo(() => {
    const vertical = (g: { dx: number; dy: number }) => Math.abs(g.dy) > 5 && Math.abs(g.dy) > Math.abs(g.dx) * 1.2;
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => vertical(g),
      // 휴식 칸의 버튼 · 영상 위에서 시작해도 세로로 끌면 시트가 가져간다(누르기는 그대로 버튼에게)
      onMoveShouldSetPanResponderCapture: (_e, g) => vertical(g),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        cancelAnimation(pos);
        dragFrom.current = Math.max(0, Math.min(1, posJs.current));
      },
      onPanResponderMove: (_e, g) => {
        const raw = dragFrom.current - g.dy / travel.current;
        const v = raw < 0 ? raw * 0.22 : raw > 1 ? 1 + (raw - 1) * 0.22 : raw;
        posJs.current = v;
        pos.value = v;
        movedAt.current = Date.now();
      },
      onPanResponderRelease: (_e, g) => {
        // 멈췄다 놓으면 자리로, 튕기듯 놓으면(끈 방향과 같은 쪽일 때만) 속도로 정한다
        const vy = Date.now() - movedAt.current > 90 ? 0 : g.vy;
        const to = vy < -0.35 && g.dy < 0 ? 1 : vy > 0.35 && g.dy > 0 ? 0 : posJs.current > 0.5 ? 1 : 0;
        settle(to, (-vy * 1000) / travel.current);
      },
      onPanResponderTerminate: () => settle(posJs.current > 0.5 ? 1 : 0),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 운동을 시작하면 화면이 아래에서 올라온다
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withSpring(1, SPRING.snap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const rootAnim = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - enter.value) * winH }] }));

  // 영상 칸의 크기 — 아래 본문과 같은 계산(훅은 조건문 위에 있어야 해서 여기서 미리)
  const mediaSize = mediaSizeFor(winW, winH, insets.top + insets.bottom, kb);
  travel.current = Math.max(1, mediaSize - COMPACT_H);
  const thumbK = THUMB / mediaSize;
  const boxAnim = useAnimatedStyle(() => ({
    // 끝을 조금 넘겨도(고무줄) 높이는 따라가게 — 영상 · 글자는 0~1 안에서만 움직인다
    height: mediaSize + (COMPACT_H - mediaSize) * pos.value,
  }), [mediaSize]);
  const vidAnim = useAnimatedStyle(() => {
    const t = Math.max(0, Math.min(1, pos.value));
    return {
      borderRadius: interpolate(t, [0, 1], [20, 12 / thumbK]),
      transform: [
        { translateX: (16 + THUMB / 2 - winW / 2) * t },
        { translateY: (8 + THUMB / 2 - mediaSize / 2) * t },
        { scale: 1 + (thumbK - 1) * t },
      ],
    };
  }, [mediaSize, winW, thumbK]);
  const metaAnim = useAnimatedStyle(() => ({ opacity: interpolate(pos.value, [0, 0.35], [1, 0], Extrapolation.CLAMP) }));
  const compactAnim = useAnimatedStyle(() => ({
    opacity: interpolate(pos.value, [0.55, 1], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(pos.value, [0.55, 1], [8, 0], Extrapolation.CLAMP) }],
  }));
  const grabAnim = useAnimatedStyle(() => ({
    // 손잡이 막대 — 끄는 동안 살짝 넓어진다
    transform: [{ scaleX: interpolate(Math.abs(pos.value - Math.round(pos.value)), [0, 0.5], [1, 1.35], Extrapolation.CLAMP) }],
  }));

  if (rest > 0 && (!wasResting.current || rest > restTotal.current)) restTotal.current = rest;

  // 휴식이 끝나는 순간 알린다
  useEffect(() => {
    if (rest > 0) {
      wasResting.current = true;
      if (rest <= 3) haptic.select(); // 마지막 3초
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
  const rx = e ? prescription(e, lv) : null;

  /**
   * ✓ — 빈 칸은 지난 기록(placeholder)으로 채우고 완료한다.
   * placeholder 만 보고 ✓ 를 누르면 예전엔 세트가 조용히 버려졌다(저장 시 빈 세트 제외).
   */
  function handleToggle(si: number) {
    const st = cur.sets[si];
    if (!st.done) {
      const ref = last?.detail[si];
      // 지난 기록이 없는 종목(처음 하는 종목)은 방금 끝낸 앞 세트 값을 이어받는다 — 세트마다 같은 숫자를 다시 치지 않게(11/27 화면 점검)
      const prev = si > 0 && cur.sets[si - 1].done ? cur.sets[si - 1] : null;
      let w = st.w.trim();
      let r = st.r.trim();
      if (!w && ref && ref.w > 0) { w = String(ref.w); setVal(si, 'w', w); }
      if (!r && ref && ref.r > 0) { r = String(ref.r); setVal(si, 'r', r); }
      if (!w && !r && prev) {
        if (prev.w.trim()) { w = prev.w.trim(); setVal(si, 'w', w); }
        if (prev.r.trim()) { r = prev.r.trim(); setVal(si, 'r', r); }
      }
      if (!w && !r) {
        haptic.error();
        showAlert('세트 입력', '무게 또는 횟수를 입력한 뒤 완료할 수 있습니다.');
        return;
      }
      haptic.set();
    } else {
      haptic.tap();
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

  // 맨 위 '완료'는 손이 쉽게 닿는 자리다 — 세트가 남았으면 한 번 묻는다(15세트 중 3세트만 하고 눌러도 바로 저장 · 종료됐다, 11/27 화면 점검)
  function askFinish() {
    const left = (session?.data ?? []).reduce((n, x) => n + x.sets.filter((t) => !t.done).length, 0);
    if (left === 0) { void handleFinish(); return; }
    showAlert('여기까지 하고 끝낼까요?', `아직 ${left}세트가 남았어요. 완료한 세트는 저장돼요.`, [
      { text: '계속하기', style: 'cancel' },
      { text: '저장하고 끝내기', onPress: () => { void handleFinish(); } },
    ]);
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
    <Animated.View style={[s.root, rootAnim]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <PressableScale
          style={s.closeBtn}
          onPress={handleClose}
          disabled={saving}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={anyRecorded ? '운동 종료하고 저장' : '운동 취소'}
        >
          <Ionicons name="close" size={20} color={colors.mid} />
        </PressableScale>
        <View style={s.headerCenter}>
          <Text style={s.headerDay} maxFontSizeMultiplier={1.3}>{session.dayName}</Text>
          <Text style={s.headerProgress} maxFontSizeMultiplier={1.3}>
            {session.exIdx + 1} / {session.data.length} · {fmtClock(elapsed)}
          </Text>
        </View>
        {/* 마지막 종목이 아니어도 언제든 끝낼 수 있게 — 예전엔 ✕ 가 유일한 완료 경로였다 */}
        <PressableScale
          style={s.finishBtn}
          onPress={askFinish}
          disabled={!anyRecorded}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="운동 완료하고 저장"
        >
          {saving ? <ActivityIndicator color={colors.ink} size="small" /> : <Text style={s.finishTxt}>완료</Text>}
        </PressableScale>
      </View>

      {/* 영상은 1:1 로 위에 고정, 자동 재생 — 아래 세트 기록만 스크롤된다(10/31 피드백 4절). 종목 탭을 누르면 영상이 바뀐다.
          시트를 올리면 같은 영상이 왼쪽 작은 칸으로 줄고, 옆에 종목 이름 한 줄이 나온다 */}
      <Animated.View style={[s.mediaArea, boxAnim]} {...sheetPan.panHandlers}>
        <Animated.View style={[s.mediaVid, { left: (winW - mediaSize) / 2, width: mediaSize, height: mediaSize }, vidAnim]}>
          <ExerciseMedia key={cur.id} exId={cur.id} autoPlay rounded={20} dim={0.15} style={{ width: mediaSize, height: mediaSize }} />
          {/* 종목 이름 · 처방은 영상 아래쪽에 겹쳐 — 세트 칸에 자리를 더 준다 */}
          {!kb ? (
            <Animated.View style={[s.mediaMeta, metaAnim]} pointerEvents={up ? 'none' : 'box-none'}>
              <View style={{ flex: 1 }} pointerEvents="none">
                <Text style={s.exName} numberOfLines={1}>{e?.n ?? ''}</Text>
                <Text style={s.exPart} numberOfLines={1}>{e && rx ? `${PART_LABEL[e.part]} · ${rxText(rx)} · 세트마다 ${rx.rir}회 여유` : ''}</Text>
              </View>
              <PressableScale onPress={() => setPicker('swap')} hitSlop={10} accessibilityLabel="종목 교체" style={s.swapBtn}>
                <Text style={s.swapLink}>종목 교체</Text>
              </PressableScale>
            </Animated.View>
          ) : null}
        </Animated.View>
        <Animated.View style={[s.compact, compactAnim]} pointerEvents={up ? 'auto' : 'none'}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.compactName} numberOfLines={1}>{e?.n ?? ''}</Text>
            <Text style={s.compactSub} numberOfLines={1}>{e && rx ? `${PART_LABEL[e.part]} · ${rxText(rx)}` : ''}</Text>
          </View>
          <PressableScale onPress={() => settle(0)} hitSlop={10} accessibilityLabel="영상 다시 펼치기" style={s.compactBtn}>
            <Text style={s.compactBtnTxt}>영상 보기</Text>
          </PressableScale>
        </Animated.View>
      </Animated.View>

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
            <PressableScale haptic="select"
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
              {done && <Ionicons name="checkmark" size={13} color={colors.mid} style={{ marginTop: 4 }} />}
            </PressableScale>
          );
        })}
        <PressableScale style={[s.filmCell, s.filmAdd]} onPress={() => setPicker('add')} accessibilityRole="button" accessibilityLabel="종목 추가">
          <Text style={s.filmAddTxt}>＋</Text>
          <Text style={s.filmAddLabel}>종목 추가</Text>
        </PressableScale>
      </ScrollView>

      <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
        {/* 끄는 자리 — 손잡이 + 휴식 칸. 세로로 끌면 시트가 따라오고, 손잡이는 눌러도 오르내린다 */}
        <View {...sheetPan.panHandlers} style={s.dragZone}>
          <PressableScale haptic={false} scaleTo={1} style={s.grabZone} onPress={() => settle(up ? 0 : 1)}
            accessibilityLabel={up ? '세트 칸 내리기 — 영상 펼치기' : '세트 칸 올리기 — 영상 접기'}>
            <Animated.View style={[s.grab, grabAnim]} />
          </PressableScale>

        {/* 휴식 슬롯은 항상 같은 높이로 자리를 잡는다 — 마운트/언마운트되면 방금 누른 ✓ 가 손가락 아래서 밀린다 */}
        <View style={[s.restBox, rest > 0 && s.restBoxOn]}>
          {rest > 0 ? (
            <>
              <View style={s.restLeft}>
                <View style={s.ringWrap}>
                  <ProgressRing size={52} stroke={5} color={colors.ink} progress={restTotal.current ? rest / restTotal.current : 0} animate={false} />
                </View>
                <View>
                  <Text style={s.restLabel}>다음 {Math.min(completedSets + 1, cur.sets.length)}세트</Text>
                  <Text style={s.restTime} maxFontSizeMultiplier={1.2}>{fmtClock(rest)}</Text>
                </View>
              </View>
              <View style={s.restBtns}>
                <PressableScale style={s.skipBtn} onPress={() => (rest > 15 ? startRest(rest - 15) : stopRest())} accessibilityRole="button" accessibilityLabel="휴식 15초 줄이기">
                  <Text style={s.skipTxt}>−15초</Text>
                </PressableScale>
                <PressableScale style={s.skipBtn} onPress={() => startRest(rest + 15)} accessibilityRole="button" accessibilityLabel="휴식 15초 늘리기">
                  <Text style={s.skipTxt}>+15초</Text>
                </PressableScale>
                <PressableScale style={s.skipBtn} onPress={stopRest} accessibilityRole="button" accessibilityLabel="휴식 건너뛰기">
                  <Text style={s.skipTxt}>건너뛰기</Text>
                </PressableScale>
              </View>
            </>
          ) : (
            <>
              <View style={s.restLeft}>
                <Text style={s.restLabel}>세트</Text>
                <Text style={s.restTime} maxFontSizeMultiplier={1.2}>{completedSets}/{cur.sets.length}</Text>
              </View>
              <Text style={s.restHint}>세트를 완료하면 {rx?.rest ?? 75}초 휴식이 시작됩니다</Text>
            </>
          )}
        </View>
        </View>

        <ScrollView
          style={s.setsScroll}
          contentContainerStyle={s.setsContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {kb ? <Text style={s.kbName} numberOfLines={1}>{e?.n ?? ''}{rx ? ` · ${rxText(rx)}` : ''}</Text> : null}
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
          <Text style={s.sheetTitle}>세트 기록 · 체크를 길게 눌러 삭제</Text>
          {cur.sets.map((st, si) => {
            const ref = last?.detail[si];
            // 지난 기록이 없으면 방금 끝낸 앞 세트 값을 흐리게 보여 준다(✓ 만 누르면 그 값으로 완료)
            const carry = !ref && !st.done && si > 0 && cur.sets[si - 1].done ? cur.sets[si - 1] : null;
            // 지금 할 세트(아직 안 한 첫 줄) 하나만 빨강 — 끝낸 줄은 흰 체크
            const now = si === cur.sets.findIndex((x) => !x.done);
            const isLastRow = si === cur.sets.length - 1;
            return (
              <View key={si} style={[s.setRow, now && s.setRowNow]}>
                <Text style={[s.setNum, st.done && s.setNumDone, now && s.setNumNow]} maxFontSizeMultiplier={1.3}>{si + 1}</Text>
                <TextInput
                  ref={(r) => { inputRefs.current[`${si}-w`] = r; }}
                  style={[s.setInput, st.done && s.setInputDone]}
                  placeholder={ref && ref.w > 0 ? String(ref.w) : carry?.w.trim() ? carry.w.trim() : 'kg'}
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
                  placeholder={ref ? String(ref.r) : carry?.r.trim() ? carry.r.trim() : '회'}
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
                <SetCheck done={st.done} now={now} label={`${si + 1}세트 완료`} onPress={() => handleToggle(si)} onLongPress={() => handleRemove(si)} />
              </View>
            );
          })}
          <PressableScale style={s.addSet} onPress={addSet} accessibilityRole="button">
            <Text style={s.addSetTxt}>+ 세트 추가</Text>
          </PressableScale>
        </ScrollView>

        <View style={s.navRow}>
          <PressableScale
            style={[s.navBtn, s.navGhost]}
            disabled={session.exIdx === 0}
            onPress={() => moveEx(-1)}
            accessibilityRole="button"
            accessibilityLabel="이전 종목"
            accessibilityState={{ disabled: session.exIdx === 0 }}
          >
            <Text style={s.navGhostTxt}>← 이전</Text>
          </PressableScale>
          {isLast ? (
            <PressableScale style={[s.navBtn, s.navSolid]} onPress={handleFinish}>
              {saving ? (
                <ActivityIndicator color={colors.onRed} />
              ) : (
                <Text style={s.navSolidTxt}>{doneAll ? '운동 완료' : '저장하고 종료'}</Text>
              )}
            </PressableScale>
          ) : (
            // 이 종목의 세트가 남았으면 빨강은 '지금 할 세트' 하나 — 다 끝냈을 때만 '다음'이 빨강이 된다
            <PressableScale style={[s.navBtn, completedSets >= cur.sets.length ? s.navSolid : s.navNext]} onPress={() => moveEx(1)} accessibilityRole="button" accessibilityLabel="다음 종목">
              <Text style={completedSets >= cur.sets.length ? s.navSolidTxt : s.navNextTxt}>다음 →</Text>
            </PressableScale>
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
    </Animated.View>
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
        <PressableScale style={p.close} onPress={onClose}>
          <Ionicons name="close" size={18} color={colors.mid} />
        </PressableScale>
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
          <PressableScale haptic="select" style={[p.chip, sameOnly && p.chipOn]} onPress={() => setSameOnly(true)}>
            <Text style={[p.chipTxt, sameOnly && p.chipTxtOn]}>
              같은 부위 ({PART_LABEL[cur.part]})
            </Text>
          </PressableScale>
          <PressableScale haptic="select" style={[p.chip, !sameOnly && p.chipOn]} onPress={() => setSameOnly(false)}>
            <Text style={[p.chipTxt, !sameOnly && p.chipTxtOn]}>전체</Text>
          </PressableScale>
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
    <PressableScale style={p.row} scaleTo={PRESS_SCALE.card} onPress={onPick}>
      <ExerciseMedia exId={ex.id} rounded={10} style={p.thumb} dim={0.3} />
      <View style={{ flex: 1 }}>
        <Text style={p.name}>{ex.n}</Text>
        <Text style={p.meta}>{PART_LABEL[ex.part]} · {ex.g} · {repsText(ex.r)}</Text>
      </View>
      <Text style={p.pick}>선택</Text>
    </PressableScale>
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

  mediaArea: {
    flexShrink: 0, overflow: 'hidden',
    ...Platform.select({ web: { touchAction: 'none', userSelect: 'none' } as object, default: {} }),
  },
  mediaVid: { position: 'absolute', top: 0, overflow: 'hidden' },
  mediaMeta: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 14, paddingTop: 28, paddingBottom: 12, borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
    backgroundColor: colors.mediaDim,
  },
  exName: { fontSize: 19, fontWeight: '800', color: colors.onMedia, letterSpacing: -0.3 },
  exPart: { fontSize: 12, color: colors.onMediaSub, marginTop: 3 },
  swapBtn: { borderWidth: 1, borderColor: colors.onMediaSub, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  kbName: { fontSize: 13, fontWeight: '800', color: colors.ink },
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
  filmContent: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  filmCell: {
    width: 80, borderRadius: 12, padding: 10,
    backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line,
    alignItems: 'center',
  },
  filmCellActive: { borderColor: colors.ink, backgroundColor: colors.panel2 },
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
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 16, paddingTop: 8, flex: 1, minHeight: 200,
  },
  // 끄는 자리 — 손잡이 + 휴식 칸(시트 폭 전체). 보이는 막대는 작다
  dragZone: {
    marginTop: -8, marginHorizontal: -16, paddingHorizontal: 16,
    ...Platform.select({ web: { cursor: 'grab', userSelect: 'none', touchAction: 'none' } as object, default: {} }),
  },
  grabZone: { height: 32, alignItems: 'center', justifyContent: 'center' },
  grab: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.line2 },
  compact: { position: 'absolute', left: 16 + THUMB + 12, right: 16, top: 8, height: THUMB, flexDirection: 'row', alignItems: 'center', gap: 12 },
  compactName: { fontSize: 18, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  compactSub: { fontSize: 12.5, color: colors.mid, marginTop: 2 },
  compactBtn: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: colors.line2, justifyContent: 'center' },
  compactBtnTxt: { fontSize: 13, fontWeight: '600', color: colors.ink },
  sheetTitle: { fontSize: 10.5, fontWeight: '700', color: colors.muted, letterSpacing: 0.8, marginTop: 4 },
  swapLink: { fontSize: 12, color: colors.onMedia, fontWeight: '700' },

  restBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.panel2, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12, minHeight: 68, gap: 8,
  },
  restBoxOn: { backgroundColor: colors.panel3 },
  restLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ringWrap: { width: 52, height: 52 },
  restLabel: { fontSize: 12, color: colors.muted },
  restTime: { fontFamily: FONT.num, fontSize: 30, lineHeight: 32, color: colors.ink },
  restHint: { fontSize: 11, color: colors.muted, flexShrink: 1, textAlign: 'right' },
  restBtns: { flexDirection: 'row', gap: 5, flexShrink: 1 },
  skipBtn: {
    borderWidth: 1, borderColor: colors.line2, borderRadius: 22, minHeight: 44,
    paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center',
  },
  skipTxt: { fontSize: 13, fontWeight: '600', color: colors.ink },

  setsScroll: { flex: 1 },
  setsContainer: { gap: 8, paddingBottom: 12 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, paddingVertical: 2 },
  setRowNow: { backgroundColor: colors.panel2 },
  setNumNow: { color: colors.ink, fontWeight: '700' },
  // 지금 할 세트 = 굵은 테두리 + 체크(끝낸 세트는 꽉 찬 흰색) — 빨강은 큰 버튼에만(검수 3)
  ckNow: { backgroundColor: 'transparent', borderColor: colors.ink, borderWidth: 2 },
  ckTxtNow: { color: colors.ink, fontWeight: '700' },
  setNum: { fontSize: 11, color: colors.muted, width: 18, textAlign: 'right', flexShrink: 0 },
  setNumDone: { color: colors.ink },
  setInput: {
    flex: 1, minWidth: 0, backgroundColor: colors.panel2,
    borderWidth: 1, borderColor: colors.line2,
    borderRadius: 14, paddingHorizontal: 8, paddingVertical: 11,
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
  ckDone: { backgroundColor: colors.ink, borderColor: colors.ink },
  ckTxt: { fontSize: 16, color: colors.muted },
  ckDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: colors.muted },
  ckTxtDone: { color: colors.bg, fontWeight: '700' },
  addSet: { paddingVertical: 10, alignItems: 'center' },
  addSetTxt: { fontSize: 12.5, color: colors.muted, fontWeight: '600' },

  navRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  navBtn: { flex: 1, borderRadius: 27, minHeight: 54, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  navGhost: { borderWidth: 1, borderColor: colors.line2 },
  navGhostTxt: { color: colors.mid, fontSize: 14, fontWeight: '700' },
  navSolid: { backgroundColor: colors.red },
  navNext: { borderWidth: 1, borderColor: colors.line2, backgroundColor: colors.panel2 },
  navNextTxt: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  navSolidTxt: { color: colors.onRed, fontSize: 16, fontWeight: '700' },
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
