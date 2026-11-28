/**
 * 앱 글자 — react-native 의 Text 대신 항상 이것을 쓴다(scripts/check-text.mjs 가 막는다).
 *
 * 한국어는 기본 줄바꿈이 글자 단위라 "차례예 / 요" 처럼 단어 중간이 잘린다.
 *  · 웹: app/+html.tsx 의 word-break: keep-all 이 띄어쓰기에서만 자른다.
 *  · 네이티브(iOS · Android): keepWords 가 글자 사이에 보이지 않는 '단어 잇기' 문자를 넣는다.
 *    Android 에는 keep-all 옵션이 없어서 두 플랫폼에 다 통하는 방법은 이것뿐이다.
 * Reanimated 의 Animated.Text 처럼 이 부품을 못 쓰는 곳은 글자에 keepWords() 를 직접 씌운다.
 */
import type { ComponentProps, ReactNode } from 'react';
import { Platform, Text as RNText } from 'react-native';
import { keepWords as glue } from '../utils/keepWords';

/** 네이티브에서만 문자를 넣는다(웹은 CSS) */
export const keepWords = (s: string): string => (Platform.OS === 'web' ? s : glue(s));

function fix(c: ReactNode): ReactNode {
  if (typeof c === 'string') return keepWords(c);
  if (Array.isArray(c)) return c.map(fix);
  return c;
}

export function Text({ children, ...rest }: ComponentProps<typeof RNText>) {
  return <RNText {...rest}>{fix(children)}</RNText>;
}
