/**
 * 로그인 · 회원가입은 테마와 상관없이 항상 다크 — 브랜드 첫인상(로고 · 연기 질감)이 어둠 위에서 만들어졌다.
 * 그래서 이 화면들은 colors(지금 모드)가 아니라 다크 팔레트를 고정으로 쓴다. 상태 표시줄도 밝은 글자로.
 */
import { paletteFor } from '../../theme/tokens';

export const D = paletteFor('dark');
/** 입력칸 — 포커스 테두리 · 포커스 바탕 · 오류 테두리 */
export const FIELD = {
  focusLine: 'rgba(244,244,245,0.6)',
  focusBg: '#141416',
  errorLine: 'rgba(228,88,88,0.7)',
} as const;
