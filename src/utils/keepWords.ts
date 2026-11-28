/**
 * 한국어 단어 안에서 줄이 안 바뀌게 — 글자 사이에 보이지 않는 '단어 잇기' 문자(U+2060 WORD JOINER)를 넣는다.
 * 네이티브 Text 전용(src/components/Text.tsx). 웹은 CSS word-break: keep-all 로 같은 일을 한다.
 * 한 단어가 한 줄보다 길면 OS 가 그때만 단어 안에서 자른다.
 */
export const WJ = '⁠';

// 한글 바로 뒤에 한글 · 숫자 · 영문 · % 가 오거나, 숫자 · 영문 · % 바로 뒤에 한글이 오는 자리
const GLUE = /([가-힣])(?=[가-힣0-9A-Za-z%])|([0-9A-Za-z%])(?=[가-힣])/g;

export function keepWords(s: string): string {
  return s.replace(GLUE, (m) => m + WJ);
}
