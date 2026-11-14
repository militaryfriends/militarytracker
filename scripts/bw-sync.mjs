#!/usr/bin/env node
/**
 * git 에 없는 비밀 파일을 Bitwarden 보안 메모로 올리고 받는다 (smiscamp scripts/bw-sync.mjs 와 같은 방식).
 *
 *   준비(기기마다 한 번): Bitwarden CLI — macOS `brew install bitwarden-cli` → `bw login`
 *   매번:   export BW_SESSION="$(bw unlock --raw)"
 *
 *   npm run secrets:status   로컬 파일과 금고 비교 (같음 · 다름 · 없음)
 *   npm run secrets:push     이 기기의 파일 → 금고 (값이 바뀐 것만 올림)
 *   npm run secrets:pull     금고 → 이 기기 (다른 파일은 .bak-날짜 로 남기고 덮어씀)
 *
 * - 금고 폴더 'militarytracker' 안에 'militarytracker: <경로> [i/n]' 이름의 보안 메모로 저장한다(4,000자씩 나눔).
 * - 경로가 '~/' 로 시작하면 홈 폴더 기준(저장소 밖 키 폴더). 폴더를 적으면 그 안의 파일을 모두 다룬다.
 * - 값은 화면에 찍지 않는다(파일 이름 · 글자 수만). bw 에는 표준 입력으로 넘겨 명령줄에 남지 않게 한다.
 * - .git/claude_deploy_key 는 기기마다 따로 만드는 키라 다루지 않는다.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FOLDER = 'militarytracker';
const CHUNK = 4000;
const ENTRIES = [
  '.env',                                   // 로컬 개발용 EXPO_PUBLIC_* 등
  'functions/.secret.local',                // Anthropic API 키 (평가 · 에뮬레이터, 서버 비밀값 원본)
  'media/r2.env',                           // Cloudflare R2 업로드 키
  '.secrets/google-play-service-account.json', // RevenueCat Play 결제 확인용 서비스 계정 JSON
  '.secrets/keys.md',                       // RevenueCat 비밀 키 · ASC Key ID/Issuer ID 등 메모
  '~/Keys/Militaryfriends_NQG4FMAHP7',      // ASC 인앱 결제 키(.p8) 폴더
];

const abs = (p) => (p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : path.join(ROOT, p));
// 폴더 항목은 그 안의 파일들로 펼친다(로컬에 있는 것 + 금고에 있는 것)
function expand(vaultPaths) {
  const out = new Set();
  for (const e of ENTRIES) {
    const f = abs(e);
    let isDir = false;
    try { isDir = fs.statSync(f).isDirectory(); } catch { /* 없음 */ }
    if (isDir) {
      for (const n of fs.readdirSync(f)) if (!n.startsWith('.') && fs.statSync(path.join(f, n)).isFile()) out.add(`${e}/${n}`);
    } else if (!fs.existsSync(f) && !path.extname(e)) {
      // 이 기기에 없는 폴더 — 금고에 있는 그 폴더의 파일들
      for (const v of vaultPaths) if (v.startsWith(`${e}/`)) out.add(v);
      if (![...vaultPaths].some((v) => v.startsWith(`${e}/`))) out.add(e);
    } else out.add(e);
  }
  return [...out];
}

function bw(args, input) {
  const r = spawnSync('bw', args, { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`bw 를 실행하지 못했어요 — Bitwarden CLI 가 설치돼 있나요? (${r.error.message})`);
  if (r.status !== 0) throw new Error(`bw ${args[0]} ${args[1] ?? ''} 실패: ${(r.stderr || '').trim().split('\n')[0]}`);
  return r.stdout;
}
const json = (args, input) => JSON.parse(bw(args, input));
const enc = (obj) => Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');

function ensureUnlocked() {
  const st = json(['status']);
  if (st.status !== 'unlocked' || !process.env.BW_SESSION) {
    throw new Error(st.status === 'unauthenticated'
      ? '먼저 `bw login` 하세요.'
      : '금고가 잠겨 있어요 — export BW_SESSION="$(bw unlock --raw)" 뒤 다시 실행하세요.');
  }
  bw(['sync']);
}

function folderId(create) {
  const f = json(['list', 'folders', '--search', FOLDER]).find((x) => x.name === FOLDER);
  if (f) return f.id;
  if (!create) return null;
  return json(['create', 'folder'], enc({ name: FOLDER })).id;
}

const NAME_RE = /^militarytracker: (.+) \[(\d+)\/(\d+)\]$/;
function vaultMap(fid) {
  const map = new Map();
  if (!fid) return map;
  for (const item of json(['list', 'items', '--folderid', fid])) {
    const m = NAME_RE.exec(item.name || '');
    if (!m || item.type !== 2) continue;
    const [, p, i, n] = m;
    if (!map.has(p)) map.set(p, []);
    map.get(p).push({ i: Number(i), n: Number(n), item });
  }
  return map;
}
function joined(parts) {
  if (!parts || !parts.length) return null;
  const n = parts[0].n;
  const sorted = [...parts].sort((a, b) => a.i - b.i);
  if (sorted.length !== n || sorted.some((x, k) => x.i !== k + 1 || x.n !== n)) return undefined;
  return sorted.map((x) => x.item.notes ?? '').join('');
}
function chunks(text) {
  const out = [];
  for (let k = 0; k < text.length; k += CHUNK) out.push(text.slice(k, k + CHUNK));
  return out.length ? out : [''];
}
const readLocal = (p) => { const f = abs(p); return fs.existsSync(f) && fs.statSync(f).isFile() ? fs.readFileSync(f, 'utf8') : null; };

function status() {
  ensureUnlocked();
  const map = vaultMap(folderId(false));
  for (const p of expand(map.keys())) {
    const local = readLocal(p);
    const remote = joined(map.get(p));
    const s = remote === undefined ? '금고 조각이 깨짐'
      : local == null && remote == null ? '둘 다 없음'
      : local == null ? '이 기기에 없음 (pull 하면 생김)'
      : remote == null ? '금고에 없음 (push 필요)'
      : local === remote ? '같음' : '다름';
    console.log(`${s.padEnd(22)} ${p}`);
  }
}

function push() {
  ensureUnlocked();
  const fid = folderId(true);
  const map = vaultMap(fid);
  const template = json(['get', 'template', 'item']);
  for (const p of expand(map.keys())) {
    const local = readLocal(p);
    if (local == null) { console.log(`건너뜀(이 기기에 없음)  ${p}`); continue; }
    const existing = map.get(p) || [];
    if (joined(existing) === local) { console.log(`그대로                 ${p}`); continue; }
    const parts = chunks(local);
    const byIndex = new Map(existing.map((x) => [x.i, x.item]));
    parts.forEach((notes, k) => {
      const name = `militarytracker: ${p} [${k + 1}/${parts.length}]`;
      const old = byIndex.get(k + 1);
      if (old) {
        bw(['edit', 'item', old.id], enc({ ...old, name, notes }));
        byIndex.delete(k + 1);
      } else {
        bw(['create', 'item'], enc({ ...template, type: 2, folderId: fid, name, notes,
          secureNote: { type: 0 }, login: null, card: null, identity: null, fields: [] }));
      }
    });
    for (const old of byIndex.values()) bw(['delete', 'item', old.id]);
    console.log(`올림 (${local.length}자, ${parts.length}칸)  ${p}`);
  }
  bw(['sync']);
}

function pull() {
  ensureUnlocked();
  const map = vaultMap(folderId(false));
  const stamp = new Date().toISOString().slice(0, 10);
  for (const p of expand(map.keys())) {
    const remote = joined(map.get(p));
    if (remote === undefined) { console.log(`건너뜀(금고 조각이 깨짐 — 원래 기기에서 push 다시)  ${p}`); continue; }
    if (remote == null) { console.log(`건너뜀(금고에 없음)  ${p}`); continue; }
    const f = abs(p);
    const local = readLocal(p);
    if (local === remote) { console.log(`그대로                 ${p}`); continue; }
    fs.mkdirSync(path.dirname(f), { recursive: true });
    if (local != null) fs.copyFileSync(f, `${f}.bak-${stamp}`);
    fs.writeFileSync(f, remote, { mode: 0o600 });
    try { fs.chmodSync(f, 0o600); } catch { /* 무시 */ }
    console.log(`${local == null ? '새로 씀' : '덮어씀(.bak 남김)'}  ${p}`);
  }
}

const cmd = process.argv[2];
try {
  if (cmd === 'push') push();
  else if (cmd === 'pull') pull();
  else if (cmd === 'status') status();
  else { console.log('사용법: node scripts/bw-sync.mjs status | push | pull'); process.exit(1); }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
