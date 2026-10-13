import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';
import PALETTE from '../src/theme/palette.json';

/**
 * 웹 전용 HTML 셸. 네이티브 빌드에는 포함되지 않는다.
 * 모바일 뷰포트 고정, 라이트 · 다크 바탕, 바운스 스크롤 차단.
 *
 * 정적 HTML 은 다크로 미리 그려진다(src/theme/tokens.ts). 저장된 모드나 기기 설정이 라이트면
 * 아래 스크립트가 첫 페인트 전에 바탕을 라이트로 칠하고 화면(#root)을 가려 둔다 → 앱이 라이트로 다시 그린 뒤
 * app/_layout.tsx 가 mt-wait 를 걷는다. 스크립트가 실패해도 3초 뒤에는 연다.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" content={PALETTE.dark.bg} />
        <meta name="color-scheme" content="dark light" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />

        <title>밀리터리트래커</title>
        <meta name="description" content="검증된 자세 가이드 위에서 기록하는 트레이닝 앱" />
        <meta property="og:title" content="밀리터리트래커" />
        <meta property="og:description" content="검증된 자세 가이드 위에서 기록하는 트레이닝 앱" />
        <meta property="og:type" content="website" />

        {/* RN Web 의 스크롤 컨테이너 기본값 리셋 */}
        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

// 'mt-theme' = src/theme/tokens.ts 의 THEME_STORAGE_KEY (AsyncStorage 웹 = localStorage 같은 키)
const themeScript = `(function(){try{
var p=localStorage.getItem('mt-theme');
var m=(p==='light'||p==='dark')?p:((window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark');
var d=document.documentElement;d.setAttribute('data-theme',m);
if(m!=='dark'){d.classList.add('mt-wait');setTimeout(function(){d.classList.remove('mt-wait')},3000);}
var t=document.querySelector('meta[name="theme-color"]');if(t)t.setAttribute('content',m==='light'?'${PALETTE.light.bg}':'${PALETTE.dark.bg}');
}catch(e){}})();`;

const css = `
html, body, #root {
  height: 100%;
  margin: 0;
  background-color: ${PALETTE.dark.bgDeep};
  color-scheme: dark;
}
html[data-theme="light"], html[data-theme="light"] body, html[data-theme="light"] #root {
  background-color: ${PALETTE.light.bgDeep};
  color-scheme: light;
}
html.mt-wait #root { visibility: hidden; }
body {
  overscroll-behavior: none;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-family: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard',
    'Noto Sans KR', 'Segoe UI', Roboto, sans-serif;
}
/* maximum-scale=1 로 핀치줌을 막지 않는다(접근성). 대신 입력창을 16px 이상으로 두어 iOS Safari 자동 줌을 피한다 */
input, textarea { font-size: max(16px, 1em); }
/* 프레임 안에서 스크롤바가 레이아웃을 흔들지 않도록 */
::-webkit-scrollbar { width: 0; height: 0; }
* { scrollbar-width: none; }
input, textarea { font-family: inherit; }
`;
