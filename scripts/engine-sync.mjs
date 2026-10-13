#!/usr/bin/env node
/**
 * 체형 엔진을 서버(functions/src/engine/)로 복사한다.
 *
 * functions 는 따로 빌드되는 패키지라 src/ 를 import 할 수 없다. 서버가 저장된 입력으로 숫자를 다시
 * 계산해야 하므로(클라이언트 값을 믿지 않는다) 같은 코드를 복사본으로 둔다. 손으로 고치면 두 벌이
 * 어긋나므로 원본만 고치고 이 스크립트로 맞춘다.
 *
 *   npm run engine:sync           # 복사
 *   node scripts/engine-sync.mjs --check   # 복사본이 원본과 다르면 실패 (npm test 가 먼저 돌린다)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'functions', 'src', 'engine');

/** 복사 대상 — 서로만 import 한다(React Native · Firebase 금지) */
const SOURCES = [
  'src/utils/bodyComp.ts',
  'src/utils/projection.ts',
  'src/utils/bodyAnalysis.ts',
  'src/data/archetypes.ts',
];

const byAbs = new Map(SOURCES.map((s) => [resolve(ROOT, s).replace(/\.ts$/, ''), basename(s, '.ts')]));

function render(src) {
  const abs = resolve(ROOT, src);
  const body = readFileSync(abs, 'utf8').replace(
    /(from\s+|import\s*\()(['"])(\.{1,2}\/[^'"]+)\2/g,
    (_, pre, q, spec) => {
      const target = byAbs.get(resolve(dirname(abs), spec).replace(/\.ts$/, ''));
      // 복사 대상 밖을 import 하면 서버에서 풀리지 않는다 — 조용히 넘기지 않는다
      if (!target) throw new Error(`${src}: 엔진 밖 파일을 import 합니다 (${spec})`);
      return `${pre}${q}./${target}${q}`;
    },
  );
  return `// 자동 복사본 — 직접 고치지 말 것. 원본: ${src}. 고친 뒤 npm run engine:sync\n${body}`;
}

const check = process.argv.includes('--check');
const stale = [];
mkdirSync(OUT, { recursive: true });
for (const src of SOURCES) {
  const out = join(OUT, basename(src));
  const next = render(src);
  const cur = existsSync(out) ? readFileSync(out, 'utf8') : null;
  if (cur === next) continue;
  if (check) stale.push(relative(ROOT, out));
  else {
    writeFileSync(out, next);
    console.log(`복사: ${src} → ${relative(ROOT, out)}`);
  }
}

if (check && stale.length) {
  console.error(`엔진 복사본이 원본과 다릅니다: ${stale.join(', ')}\n→ npm run engine:sync 를 실행하세요.`);
  process.exit(1);
}
if (check) console.log('엔진 복사본 일치');
