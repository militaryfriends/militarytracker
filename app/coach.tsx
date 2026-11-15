/** 코치는 탭이 됐다(B3) — 옛 주소 /coach 로 들어오면 탭으로 보낸다 */
import { Redirect } from 'expo-router';

export default function CoachRedirect() {
  return <Redirect href="/tabs/coach" />;
}
