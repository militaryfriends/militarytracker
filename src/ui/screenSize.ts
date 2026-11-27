import { createContext, useContext } from 'react';
import { useWindowDimensions } from 'react-native';

/**
 * 앱이 실제로 그려지는 화면 크기.
 *
 * 웹을 데스크톱 폭으로 열면 앱은 폰 테두리(MobileFrame) 안에 그려진다. 이때 useWindowDimensions 는 브라우저 창 전체를 돌려줘서,
 * 창 폭으로 위치를 잡는 화면이 테두리 밖으로 밀려난다 — 운동 세션의 영상이 오른쪽 밖으로 나가 안 보였다(11/27 대표 제보).
 * 화면 크기로 배치 · 크기를 정하는 곳은 useWindowDimensions 대신 이 훅을 쓴다. 폰(앱 · 모바일 웹)에서는 창 크기와 같다.
 */
export const FrameSizeContext = createContext<{ width: number; height: number } | null>(null);

export function useScreenSize(): { width: number; height: number } {
  const win = useWindowDimensions();
  const frame = useContext(FrameSizeContext);
  return frame ?? { width: win.width, height: win.height };
}
