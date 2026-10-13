#!/usr/bin/env node
/**
 * 순수 TS 단위 테스트 — 새 의존성 없이 돈다.
 * src/**\/__tests__/*.test.ts 와 그 상대 import 들을 TypeScript(transpileModule)로 .cache/test 에 풀어
 * node --test 로 실행한다. React Native 를 import 하는 파일은 테스트할 수 없다(엔진 · 데이터 전용).
 *
 *   npm test
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.cache', 'test');

function walk(dir, hit = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, hit);
    else if (/__tests__[\\/].+\.test\.ts$/.test(p)) hit.push(p);
  }
  return hit;
}

const resolveTs = (from, spec) => {
  const base = resolve(dirname(from), spec);
  for (const c of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) if (existsSync(c)) return c;
  throw new Error(`못 찾음: ${spec} (${relative(ROOT, from)})`);
};

const done = new Set();
function emit(file) {
  if (done.has(file)) return;
  done.add(file);
  const src = readFileSync(file, 'utf8');
  const deps = [];
  const out = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false },
    fileName: file,
  }).outputText.replace(/(from\s+|import\s*\()(['"])(\.{1,2}\/[^'"]+)\2/g, (_, pre, q, spec) => {
    const dep = resolveTs(file, spec);
    deps.push(dep);
    let rel = relative(dirname(file), dep).replace(/\.tsx?$/, '.mjs').replace(/\\/g, '/');
    if (!rel.startsWith('.')) rel = `./${rel}`;
    return `${pre}${q}${rel}${q}`;
  });
  const target = join(OUT, relative(ROOT, file)).replace(/\.tsx?$/, '.mjs');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, out);
  deps.forEach(emit);
}

rmSync(OUT, { recursive: true, force: true });
const tests = walk(join(ROOT, 'src'));
tests.forEach(emit);
const files = tests.map((t) => join(OUT, relative(ROOT, t)).replace(/\.ts$/, '.mjs'));
const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(r.status ?? 1);
