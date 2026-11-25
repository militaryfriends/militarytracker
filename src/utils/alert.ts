import { Alert, Platform } from 'react-native';
import { hostAlert } from '../components/AlertHost';

export interface AlertButton {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

/**
 * React Native 의 Alert.alert 는 웹에서 아무 동작도 하지 않는다.
 * 웹에서는 window.alert / window.confirm 으로 대체한다.
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }

  const list = buttons ?? [];
  // 앱 안 대화상자(브라우저가 confirm 을 막아도 답할 수 있게) — 호스트가 아직 없을 때만 window.*
  if (hostAlert({ title, message, buttons: list })) return;

  const body = message ? `${title}\n\n${message}` : title;

  // 버튼이 없거나 하나뿐이면 단순 알림
  if (list.length <= 1) {
    window.alert(body);
    list[0]?.onPress?.();
    return;
  }

  // 취소 + 실행 구조는 confirm 으로 매핑
  const cancel = list.find((b) => b.style === 'cancel');
  const confirmBtn = list.find((b) => b.style !== 'cancel') ?? list[list.length - 1];
  const label = confirmBtn.text ? `\n\n[확인] ${confirmBtn.text}` : '';

  if (window.confirm(body + label)) confirmBtn.onPress?.();
  else cancel?.onPress?.();
}

export default showAlert;
