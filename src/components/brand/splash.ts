/**
 * 네이티브 스플래시 — 앱이 켜질 때 OS 가 띄우는 정지 화면(검정 바탕 + 흰 로고).
 *
 * 걷는 쪽은 다음 화면이다. 그 화면이 스플래시와 같은 장면(SPLASH_FRAME 자리의 로고)을 먼저 그려 둔 뒤에 걷어서
 * 한 동작처럼 이어진다.
 *   · 로그아웃 상태 → 로그인 화면이 첫 레이아웃에서 걷고, 거기서 인트로를 이어 간다(HANDOFF).
 *   · 로그인 상태 → 루트의 BootCurtain 이 걷고, 로고가 커지며 사라져 홈이 드러난다.
 *   · 그 밖(딥 링크 등) → 루트가 2초 뒤에 걷는다(안전장치).
 */
import { Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

let up = Platform.OS !== 'web';

/** 아직 스플래시가 떠 있는지 — 앱을 막 켠 첫 화면인지 */
export const splashUp = () => up;

export function holdSplash() {
  SplashScreen.preventAutoHideAsync().catch(() => {});
  // 같은 장면으로 바뀌므로 짧게 겹쳐 넘긴다 (래스터 차이 · 한두 프레임 늦음을 덮는다)
  SplashScreen.setOptions({ duration: 200, fade: true });
}

export function hideSplash() {
  if (!up) return;
  up = false;
  SplashScreen.hideAsync().catch(() => {});
}
