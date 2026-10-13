#!/usr/bin/env node
/**
 * assets/avatars/avatar_{m|f}_F{1-5}M{1-5}.webp → src/data/avatarGrid.ts (정적 require 표)
 *   node scripts/avatar-grid.mjs
 *
 * React Native 번들러는 require('…') 경로가 소스에 글자 그대로 있어야 이미지를 싣는다 → 표를 코드로 만든다.
 * 이미지를 넣거나 빼면 다시 돌린다. 이미지가 하나도 없어도 빈 표로 유효한 파일을 쓴다.
 */
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'assets/avatars');
const outFile = join(root, 'src/data/avatarGrid.ts');
const SEX = { m: 'male', f: 'female' };
const RE = /^avatar_([mf])_F([1-5])M([1-5])\.webp$/;

const found = { male: [], female: [] };
const ignored = [];
for (const name of existsSync(dir) ? readdirSync(dir).sort() : []) {
  const m = name.match(RE);
  if (m) found[SEX[m[1]]].push({ key: `F${m[2]}M${m[3]}`, f: +m[2], mu: +m[3], name });
  else if (!name.startsWith('.')) ignored.push(name);
}

const block = (sex) => {
  const rows = found[sex].sort((a, b) => a.mu - b.mu || a.f - b.f);
  if (!rows.length) return `  ${sex}: {},`;
  const lines = rows.map((r) => `    ${r.key}: require('../../assets/avatars/${r.name}'),`);
  return `  ${sex}: {\n${lines.join('\n')}\n  },`;
};

const count = found.male.length + found.female.length;
const src = `// 자동 생성 — 손으로 고치지 말 것. node scripts/avatar-grid.mjs (scripts/AVATARS.md)
import type { ImageSourcePropType } from 'react-native';

export type AvatarSex = 'male' | 'female';

/** 칸 → 프리셋 이미지. 비어 있는 칸은 화면이 실루엣으로 대신 그린다. 이 파일은 scripts/avatar-grid.mjs 가 만든다 */
export const AVATARS: Record<AvatarSex, Partial<Record<string, ImageSourcePropType>>> = {
${block('male')}
${block('female')}
};

export const AVATAR_COUNT = ${count};
`;

writeFileSync(outFile, src);
console.log(`src/data/avatarGrid.ts — 남 ${found.male.length}/25 · 여 ${found.female.length}/25 (총 ${count})`);
if (ignored.length) console.log(`무시한 파일 (이름 형식 avatar_{m|f}_F{1-5}M{1-5}.webp 아님): ${ignored.join(', ')}`);
