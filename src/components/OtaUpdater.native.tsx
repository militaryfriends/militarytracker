/**
 * 코드푸시(EAS Update) 저절로 받기 · 적용 (2026-11-25, SMIS CAMP 앱과 같은 방식 — 설정 문서는 이 앱의 Firebase 에 따로).
 *
 * 기본(app.json updates ON_LOAD)은 켤 때 받기만 하고 '다음에 켤 때' 적용해서, 앱을 잘 안 끄면 2~3번 껐다 켜야 새 코드가 들어갔다.
 *  - 앱을 켤 때 · 다시 앞으로 올 때 새 코드푸시가 있으면 뒤에서 받아 둔다(앞으로 올 때는 10분에 한 번까지).
 *  - 받아 둔 게 있고 앱이 30분 넘게 뒤에 있다 돌아오면 그 자리에서 다시 켜 적용한다(하던 일이 없을 때라).
 *  - 필수 코드푸시(관리자 MY › 관리자 › '방금 올린 코드푸시 모두 적용' — appConfig/main.otaRequiredAfter)면
 *    쓰는 중이어도 바로 받아 '새 버전 적용 중' 을 잠깐 보이고 다시 켠다. 켜져 있는 앱도 실시간으로 알아챈다.
 *    지금 도는 코드가 그 시각보다 새것이면(Updates.createdAt) 아무것도 안 한다 — 다시 켠 뒤 또 켜지는 일이 없다.
 *  - 운동 중(세션)이면 필수라도 운동이 끝날 때까지 미룬다(세트 기록을 잃지 않게).
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { APP_CONFIG_PATH } from '../services/appConfig';
import { useAppStore } from '../stores/appStore';
import { colors, themed, useThemeMode } from '../theme';

const RESUME_APPLY_MS = 30 * 60 * 1000;
const CHECK_GAP_MS = 10 * 60 * 1000;

export function OtaUpdater() {
  useThemeMode();
  const [applying, setApplying] = useState(false);
  const requiredAfter = useRef<number | null>(null);
  const fetched = useRef(false);
  const busy = useRef(false);
  const lastCheck = useRef(0);
  const bgAt = useRef<number | null>(null);
  const pendingRequired = useRef(false);
  const inSession = useAppStore((st) => !!st.session);
  const applyRef = useRef<(show: boolean) => void>(() => {});

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;

    const runningAt = Updates.createdAt?.getTime() ?? 0;
    const isRequired = () => requiredAfter.current !== null && runningAt > 0 && runningAt < requiredAfter.current;

    const apply = async (show: boolean) => {
      // 운동 중이면 끝날 때까지 미룬다
      if (useAppStore.getState().session) { pendingRequired.current = true; return; }
      if (show) setApplying(true);
      try {
        await Updates.reloadAsync();
      } catch {
        setApplying(false);
      }
    };
    applyRef.current = (show) => { void apply(show); };

    /** 새 코드푸시가 있으면 받아 둔다 — 받았으면 true */
    const fetchIfAny = async (force: boolean): Promise<boolean> => {
      if (fetched.current) return true;
      if (busy.current) return false;
      if (!force && Date.now() - lastCheck.current < CHECK_GAP_MS) return false;
      busy.current = true;
      lastCheck.current = Date.now();
      try {
        const r = await Updates.checkForUpdateAsync();
        if (!r.isAvailable) return false;
        const f = await Updates.fetchUpdateAsync();
        fetched.current = f.isNew || fetched.current;
        return fetched.current;
      } catch {
        return false;
      } finally {
        busy.current = false;
      }
    };

    const onRequiredChange = async () => {
      if (!isRequired()) return;
      if (await fetchIfAny(true)) void apply(true);
    };

    // 필수 코드푸시 시각 — 실시간 (로그인 전에도 읽을 수 있게 규칙이 공개 읽기)
    const unsub = onSnapshot(doc(db, ...APP_CONFIG_PATH), (snap) => {
      const v = snap.get('otaRequiredAfter') as { toMillis?: () => number } | undefined;
      requiredAfter.current = typeof v?.toMillis === 'function' ? v.toMillis() : null;
      void onRequiredChange();
    }, () => {});

    void fetchIfAny(true);

    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'background') { bgAt.current = Date.now(); return; }
      if (st !== 'active') return;
      const away = bgAt.current ? Date.now() - bgAt.current : 0;
      bgAt.current = null;
      void (async () => {
        const ok = await fetchIfAny(isRequired());
        if (!ok) return;
        if (isRequired()) void apply(true);
        else if (away >= RESUME_APPLY_MS) void apply(false);
      })();
    });

    return () => { unsub(); sub.remove(); };
  }, []);

  // 운동 중이라 미뤄 둔 필수 적용 — 운동이 끝나면 바로
  useEffect(() => {
    if (!inSession && pendingRequired.current) {
      pendingRequired.current = false;
      applyRef.current(true);
    }
  }, [inSession]);

  return (
    <Modal visible={applying} transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={s.overlay}>
        <View style={s.card}>
          <ActivityIndicator size="large" color={colors.red} />
          <Text style={s.title}>새 버전 적용 중</Text>
          <Text style={s.sub}>잠시 뒤 앱이 다시 열립니다.</Text>
        </View>
      </View>
    </Modal>
  );
}

const s = themed(() => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.panel, borderRadius: 28, paddingVertical: 28, paddingHorizontal: 32, alignItems: 'center', gap: 10, minWidth: 240 },
  title: { fontSize: 18, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 14, fontWeight: '600', color: colors.mid },
}));
