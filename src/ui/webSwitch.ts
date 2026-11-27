import { Platform } from 'react-native';

/**
 * 웹(react-native-web)의 Switch 는 켰을 때 손잡이 색을 thumbColor 가 아니라 activeThumbColor 에서 읽는다.
 * 안 주면 기본 청록(#009688)이 나와 모노 화면에 색이 하나 더 생긴다(11/27 화면 점검). 앱(iOS · Android)에는 없는 속성이라 웹에서만 넣는다.
 *   <Switch thumbColor={on ? colors.bg : colors.mid} {...webSwitch(colors.bg)} />
 */
export const webSwitch = (onThumb: string): { activeThumbColor?: string } => (Platform.OS === 'web' ? { activeThumbColor: onThumb } : {});
