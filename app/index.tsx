import { View } from 'react-native';
import { colors, useThemeMode } from '../src/theme';

/**
 * 진입점. 실제 분기는 _layout.tsx 의 라우팅 가드가 처리한다.
 * 여기서 Redirect 를 쓰면 로그인 화면이 한 프레임 보였다가 사라지므로
 * 스플래시와 같은 색 배경만 그린다.
 */
export default function Index() {
  useThemeMode();
  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}
