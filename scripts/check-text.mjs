#!/usr/bin/env node
/**
 * 글자 규칙 검사 — 한국어 단어 중간 줄바꿈("차례예 / 요")을 막으려고 앱 글자는 src/components/Text 만 쓴다.
 *   npm run check:text   (npm test 에도 들어 있어 CI 에서 막힌다)
 * 걸리는 것:
 *   1. react-native 에서 Text 를 직접 import
 *   2. Animated.Text 안에 keepWords() 없이 한글 글자를 넣은 줄
 *   3. 웹 셸(app/+html.tsx)에서 word-break: keep-all 이 빠짐
 * 걸리면 종료 코드 1.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SELF = join(ROOT, 'src', 'components', 'Text.tsx');
const files = [];
const walk = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { if (n !== 'node_modules' && n !== '__tests__') walk(p); }
    else if (/\.tsx?$/.test(n)) files.push(p);
  }
};
walk(join(ROOT, 'app'));
walk(join(ROOT, 'src'));

const bad = [];
for (const f of files) {
  if (f === SELF) continue;
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]react-native['"]/g)) {
    if (m[1].split(',').map((s) => s.trim()).includes('Text')) {
      bad.push(`${relative(ROOT, f)}: react-native 의 Text 대신 src/components/Text 를 쓰세요`);
    }
  }
  src.split('\n').forEach((line, i) => {
    if (/<Animated\.Text[\s>]/.test(line) && /[가-힣]/.test(line) && !line.includes('keepWords(')) {
      bad.push(`${relative(ROOT, f)}:${i + 1}: Animated.Text 의 한글은 keepWords() 로 감싸세요`);
    }
  });
}
if (!/word-break:\s*keep-all/.test(readFileSync(join(ROOT, 'app', '+html.tsx'), 'utf8'))) {
  bad.push('app/+html.tsx: body 에 word-break: keep-all 이 없습니다');
}

if (bad.length) {
  console.error(`글자 규칙 위반 ${bad.length}건\n` + bad.map((b) => `  · ${b}`).join('\n'));
  process.exit(1);
}
console.log(`글자 규칙 통과 — 파일 ${files.length}개`);
