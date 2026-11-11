/**
 * 코치 프롬프트용 종목 목록 — src/data/exercises.ts → functions/src/coach/catalog.ts
 * 코치가 앱에 있는 종목 이름(자세 탭에 영상이 있는 것)으로만 추천하게 한다. 종목을 바꾸면 다시 돌린다:
 *   node scripts/gen-coach-catalog.cjs      (npm run coach:catalog)
 * 난이도 3(상급)은 뺀다 — 코치가 먼저 권할 종목이 아니다.
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const src = fs.readFileSync(path.join(__dirname, '../src/data/exercises.ts'), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', 'require', js)(mod, mod.exports, require);
const { EX, PART_LABEL, PART_ORDER } = mod.exports;

const clean = (n) => n.replace(/\s*\((가슴|어깨|하체|삼두)\)/, '');
const lines = [];
for (const part of PART_ORDER) {
  const list = EX.filter((e) => e.part === part && e.lv <= 2);
  const bw = list.filter((e) => e.pl.includes('home') && e.eq.includes('bw'));
  const home = list.filter((e) => e.pl.includes('home') && !e.eq.includes('bw'));
  const gym = list.filter((e) => !e.pl.includes('home'));
  const names = (l) => [...new Set(l.map((e) => clean(e.n)))].join(', ');
  lines.push(`[${PART_LABEL[part]}] 맨몸: ${names(bw) || '-'} / 집(덤벨 · 밴드): ${names(home) || '-'} / 헬스장: ${names(gym) || '-'}`);
}
const body = `/**
 * 생성 파일 — 고치지 말 것. scripts/gen-coach-catalog.cjs 가 src/data/exercises.ts 에서 만든다.
 */
export const CATALOG = ${JSON.stringify(lines.join('\n'))};
`;
fs.writeFileSync(path.join(__dirname, '../functions/src/coach/catalog.ts'), body);
console.log(lines.join('\n'));
console.log(`\n${lines.join('\n').length}자`);
