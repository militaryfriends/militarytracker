#!/usr/bin/env node
/**
 * 오늘의 가이드 영상 — 인코딩 + 표지 + R2 업로드 + 매니페스트 (src/data/guides.ts)
 *
 *   node scripts/upload-guides.mjs            인코딩 · 표지만 (업로드 안 함, 키 필요 없음)
 *   node scripts/upload-guides.mjs --upload   위 + R2 guide/video/{id}.mp4 업로드 + src/data/guideManifest.json 갱신
 *
 * 원본 목록: media/guides.local.json (git 에 안 들어감 — 노트북 경로가 들어 있다)
 *   { "bench5": { "src": "C:/…/final.mp4", "poster": 1.5 }, … }   poster = 표지로 쓸 초(기본 1.5)
 *
 * 하는 일
 *   원본(1080x1920) → 720x1280 H.264 CRF 24 · AAC 128k · faststart → media/guides_out/{id}.mp4
 *   표지 → 540x960 JPEG → assets/guide/{id}.jpg (앱에 들어간다 — 커밋)
 *   --upload: 영상 → R2 guide/video/{id}.mp4 (immutable, URL 에 ?v=내용버전) → guideManifest.json { video, sec }
 * 필요: ffmpeg · ffprobe, node 22+. 키: media/r2.env (scripts/lib/r2.mjs)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const upload = process.argv.includes('--upload');
const listFile = join(root, 'media', 'guides.local.json');
if (!existsSync(listFile)) {
  console.error('media/guides.local.json 이 없습니다 — { "id": { "src": "원본.mp4", "poster": 1.5 } } 형식');
  process.exit(1);
}
const list = JSON.parse(readFileSync(listFile, 'utf8'));
const outDir = join(root, 'media', 'guides_out');
const posterDir = join(root, 'assets', 'guide');
mkdirSync(outDir, { recursive: true });
mkdirSync(posterDir, { recursive: true });

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} 실패: ${(r.stderr || '').slice(-400)}`);
  return r.stdout;
};
const duration = (f) => Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).trim());

const done = {};
for (const [id, { src, poster = 1.5 }] of Object.entries(list)) {
  if (!existsSync(src)) { console.error(`✗ ${id}: 원본 없음 ${src}`); continue; }
  const out = join(outDir, `${id}.mp4`);
  run('ffmpeg', ['-y', '-v', 'error', '-i', src,
    '-vf', 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-movflags', '+faststart', out]);
  run('ffmpeg', ['-y', '-v', 'error', '-ss', String(poster), '-i', src, '-frames:v', '1',
    '-vf', 'scale=540:960:force_original_aspect_ratio=increase,crop=540:960', '-q:v', '4', join(posterDir, `${id}.jpg`)]);
  const sec = Math.round(duration(out));
  const mb = (readFileSync(out).length / 1e6).toFixed(1);
  console.log(`✓ ${id}: ${sec}초 · ${mb}MB`);
  done[id] = { out, sec };
}

if (!upload) {
  console.log('\n인코딩 · 표지만 했습니다. 올리려면 --upload (media/r2.env 필요)');
  process.exit(0);
}

const { r2Client, loadR2Keys, contentVersion } = await import('./lib/r2.mjs');
const r2 = r2Client(loadR2Keys(root));
const manifestFile = join(root, 'src', 'data', 'guideManifest.json');
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
manifest.items ??= {};
for (const [id, { out, sec }] of Object.entries(done)) {
  const buf = readFileSync(out);
  await r2.put(`guide/video/${id}.mp4`, buf, { contentType: 'video/mp4', cacheControl: 'public, max-age=31536000, immutable' });
  manifest.items[id] = { video: contentVersion(buf), sec };
  console.log(`↑ ${id} 업로드`);
}
manifest.updatedAt = new Date().toISOString();
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
console.log('\nsrc/data/guideManifest.json 갱신 — 커밋하세요.');
