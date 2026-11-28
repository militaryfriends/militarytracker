/**
 * 웹 전용 앱 안 대화상자(2026-11-25 검수 4) — window.confirm 은 브라우저가 막으면 영원히 답을 못 한다
 * (AI 동의를 못 해 코치 · AI 식단 · AI 플랜이 막혔다). showAlert 가 웹에서는 여기로 보낸다. 앱은 네이티브 Alert 그대로.
 */
import { useEffect, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { colors, themed, useThemeMode } from '../theme';
import { PressableScale } from '../ui';
import type { AlertButton } from '../utils/alert';

interface Req { title: string; message?: string; buttons: AlertButton[] }

let push: ((r: Req) => void) | null = null;

/** 호스트가 떠 있으면 거기에 띄우고 true. 없으면 false(호출한 쪽이 window.* 로) */
export function hostAlert(r: Req): boolean {
  if (!push) return false;
  push(r);
  return true;
}

export function AlertHost() {
  useThemeMode();
  const [queue, setQueue] = useState<Req[]>([]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    push = (r) => setQueue((q) => [...q, r]);
    return () => { push = null; };
  }, []);
  if (Platform.OS !== 'web') return null;
  const cur = queue[0];
  const close = (b?: AlertButton) => {
    setQueue((q) => q.slice(1));
    b?.onPress?.();
  };
  const buttons = cur?.buttons.length ? cur.buttons : [{ text: '확인' }];
  const cancel = buttons.find((b) => b.style === 'cancel');
  return (
    <Modal visible={!!cur} transparent animationType="fade" onRequestClose={() => close(cancel)}>
      <View style={s.scrim}>
        {cur ? (
          <View style={s.card} accessibilityRole="alert">
            <Text style={s.title}>{cur.title}</Text>
            {cur.message ? (
              <ScrollView style={{ maxHeight: 360 }}>
                <Text style={s.msg}>{cur.message}</Text>
              </ScrollView>
            ) : null}
            <View style={[s.row, buttons.length > 2 && { flexDirection: 'column' }]}>
              {buttons.map((b, i) => {
                const main = b.style !== 'cancel' && i === buttons.length - 1;
                return (
                  <PressableScale key={`${b.text}-${i}`} style={[s.btn, main && s.btnMain, buttons.length > 2 && { flex: 0 }]}
                    onPress={() => close(b)} accessibilityRole="button">
                    <Text style={[s.btnTxt, main && s.btnMainTxt, b.style === 'destructive' && !main && { color: colors.redText }]}>
                      {b.text ?? '확인'}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const s = themed(() => StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 400, backgroundColor: colors.panel, borderRadius: 24, padding: 22, borderWidth: 1, borderColor: colors.line2 },
  title: { fontSize: 17, fontWeight: '800', color: colors.ink },
  msg: { fontSize: 13.5, color: colors.mid, lineHeight: 20, marginTop: 10 },
  row: { flexDirection: 'row', gap: 8, marginTop: 20 },
  btn: { flex: 1, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line2 },
  btnMain: { backgroundColor: colors.ink, borderColor: colors.ink },
  btnTxt: { fontSize: 14.5, fontWeight: '700', color: colors.mid },
  btnMainTxt: { color: colors.bg },
}));
