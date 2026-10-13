/**
 * 숫자 글꼴 — 무게 · 횟수 · 타이머 · 통계. 본문은 시스템 글꼴 그대로 (용량 · 렌더 속도).
 * app/_layout.tsx 에서 불러온다 (기다리지 않음 — 불러오기 전에는 시스템 글꼴로 보인다).
 * 숫자가 바뀔 때 폭이 흔들리면 fontVariant: ['tabular-nums'] 를 함께 준다 (기기에서 확인할 것).
 */
import { BarlowCondensed_600SemiBold } from '@expo-google-fonts/barlow-condensed/600SemiBold';
import { BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed/700Bold';

export const FONT_ASSETS = { BarlowCondensed_600SemiBold, BarlowCondensed_700Bold };

export const FONT = {
  num: 'BarlowCondensed_700Bold',
  numSemi: 'BarlowCondensed_600SemiBold',
} as const;
