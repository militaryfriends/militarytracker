#!/usr/bin/env node
/**
 * R2 영상 버킷 점검 · 옛 버킷에서 옮기기
 *
 *   npm run media:r2 -- check     키가 맞는지(목록 읽기) + 공개 주소 · CORS 확인
 *   npm run media:r2 -- migrate   Firebase Storage(gs://military-tracker-96bdd)의 exercise/** 를 R2 로 복사
 *
 * migrate 는 같은 경로 · 같은 Cache-Control 로 올리고, 매니페스트도 그대로 옮긴다(값 = 옛 GCS generation —
 * 숫자라 앱 형식 그대로 쓴다. 이후 새로 올리는 영상은 내용 버전). 이미 같은 크기로 있으면 건너뛰니 다시 돌려도 된다.
 * 옛 버킷의 파일은 지우지 않는다 — 옛 앱 빌드가 아직 읽는다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { r2Client, loadR2Keys, R2_BUCKET } from './lib/r2.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cmd = process.argv[2];
if (cmd !== 'check' && cmd !== 'migrate') {
  console.error('사용법: npm run media:r2 -- check | migrate');
  process.exit(1);
}
const IMMUTABLE = 'public, max-age=31536000, immutable';
const NO_CACHE = 'no-cache, max-age=0';
const MANIFEST = 'exercise/manifest.json';
const OLD = 'https://firebasestorage.googleapis.com/v0/b/military-tracker-96bdd/o';
const oldUrl = (key) => `${OLD}/${encodeURIComponent(key)}?alt=media`;

/** 앱이 읽는 공개 주소 — src/data/media.ts 의 MEDIA_BASE */
function publicBase() {
  const src = readFileSync(join(root, 'src/data/media.ts'), 'utf8');
  return src.match(/export const MEDIA_BASE = '([^']+)'/)?.[1] ?? null;
}

try {
  const r2 = r2Client(loadR2Keys(root));

  if (cmd === 'check') {
    const keys = await r2.list('exercise/');
    const videos = keys.filter((k) => k.startsWith('exercise/video/')).length;
    console.log(`\n✓ R2 키 확인 — 버킷 ${R2_BUCKET}: exercise/ 아래 ${keys.length}개 (영상 ${videos})`);

    const base = publicBase();
    if (!base) {
      console.log('· 공개 주소: src/data/media.ts 에 MEDIA_BASE 가 아직 없다\n');
      process.exit(0);
    }
    const res = await fetch(`${base}/${MANIFEST}`, { headers: { Origin: 'https://military-tracker-96bdd.web.app' } });
    console.log(`· 공개 주소 ${base} → 매니페스트 ${res.status}`);
    const cors = res.headers.get('access-control-allow-origin');
    console.log(cors ? `✓ CORS: ${cors}` : '✗ CORS 헤더 없음 — 버킷 Settings › CORS Policy 에 media/r2-cors.json 을 넣을 것 (웹이 매니페스트를 못 읽는다)');
    if (res.ok) {
      const m = await res.json();
      const [id, e] = Object.entries(m.items ?? {}).find(([, x]) => x.video) ?? [];
      if (id) {
        const v = await fetch(`${base}/exercise/video/${id}.mp4?v=${e.video}`, { method: 'HEAD' });
        console.log(`· 영상 ${id}: ${v.status} ${v.headers.get('content-type')} · ${v.headers.get('cache-control')} · cf-cache-status=${v.headers.get('cf-cache-status') ?? '-'}`);
      }
    }
    console.log('');
    process.exit(0);
  }

  if (cmd === 'migrate') {
    const res = await fetch(oldUrl(MANIFEST));
    if (!res.ok) throw new Error(`옛 매니페스트 읽기 실패 ${res.status}`);
    const manifestBuf = Buffer.from(await res.arrayBuffer());
    const manifest = JSON.parse(manifestBuf.toString('utf8'));
    const jobs = [];
    for (const [id, e] of Object.entries(manifest.items ?? {})) {
      if (e.video) jobs.push({ key: `exercise/video/${id}.mp4`, type: 'video/mp4' });
      if (e.poster) jobs.push({ key: `exercise/poster/${id}.jpg`, type: 'image/jpeg' });
    }
    console.log(`\n옛 버킷 → R2 ${R2_BUCKET}: ${jobs.length}개 파일 + 매니페스트\n`);

    let copied = 0, skipped = 0, bytes = 0;
    // 4개씩 동시에
    for (let i = 0; i < jobs.length; i += 4) {
      await Promise.all(jobs.slice(i, i + 4).map(async ({ key, type }) => {
        const src = await fetch(oldUrl(key));
        if (!src.ok) throw new Error(`${key} 받기 실패 ${src.status}`);
        const buf = Buffer.from(await src.arrayBuffer());
        const have = await r2.head(key);
        if (have && have.size === buf.length) { skipped++; return; }
        await r2.put(key, buf, { contentType: type, cacheControl: IMMUTABLE });
        const check = await r2.head(key);
        if (!check || check.size !== buf.length) throw new Error(`${key} 확인 실패 (R2 ${check?.size} ≠ ${buf.length})`);
        copied++;
        bytes += buf.length;
      }));
      process.stdout.write(`  ${Math.min(i + 4, jobs.length)}/${jobs.length}\r`);
    }
    await r2.put(MANIFEST, manifestBuf, { contentType: 'application/json', cacheControl: NO_CACHE });
    console.log(`\n✓ 복사 ${copied}개 (${(bytes / 1048576).toFixed(1)}MB) · 건너뜀 ${skipped}개 · 매니페스트 (영상 ${Object.values(manifest.items).filter((e) => e.video).length}개)\n`);
    process.exit(0);
  }
} catch (e) {
  console.error(`\n✗ ${e.message}\n`);
  process.exit(1);
}
