/**
 * Cloudflare R2 (S3 호환) — 업로드 스크립트용 최소 클라이언트. 의존성 없이 SigV4 서명만 한다.
 *
 * 키는 media/r2.env (git 에 안 올라감, media/r2.env.example 참조) 또는 같은 이름의 환경변수.
 *   R2_ACCESS_KEY_ID · R2_SECRET_ACCESS_KEY  — 버킷 militarytracker 에 Object Read & Write 인 계정 API 토큰
 * 키는 이 스크립트(맥)만 갖는다 — 앱 코드 · EXPO_PUBLIC_* 에 넣지 않는다. 앱은 공개 주소로 읽기만 한다.
 */
import { createHash, createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const R2_ACCOUNT_ID = '2e99ed06965080fce3c2f66ca6426fc8'; // Cloudflare 계정 militaryfriends.official
export const R2_BUCKET = 'militarytracker';

const sha256hex = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, s) => createHmac('sha256', key).update(s, 'utf8').digest();
// RFC 3986 — S3 경로 인코딩 (슬래시는 경로 구분자라 그대로)
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
export const encodePath = (p) => p.split('/').map(enc).join('/');

/**
 * SigV4 헤더 서명. headers 는 소문자 키 — host · x-amz-date · x-amz-content-sha256 이 들어 있어야 한다.
 * 돌려주는 값은 Authorization 헤더 값.
 */
export function signV4({ method, path, query = '', headers, accessKeyId, secretAccessKey, region, service = 's3' }) {
  const amzDate = headers['x-amz-date'];
  const date = amzDate.slice(0, 8);
  const names = Object.keys(headers).map((k) => k.toLowerCase()).sort();
  const canonicalHeaders = names.map((k) => `${k}:${String(headers[k]).trim().replace(/\s+/g, ' ')}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = [method, path, query, canonicalHeaders, signedHeaders, headers['x-amz-content-sha256']].join('\n');
  const scope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');
  const kDate = hmac(`AWS4${secretAccessKey}`, date);
  const kSigning = hmac(hmac(hmac(kDate, region), service), 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');
  return `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

/** media/r2.env 의 KEY=VALUE 를 읽는다. 환경변수가 있으면 그쪽이 우선 */
export function loadR2Keys(root) {
  const file = join(root, 'media', 'r2.env');
  const env = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      'R2 키가 없습니다 — media/r2.env 에 R2_ACCESS_KEY_ID · R2_SECRET_ACCESS_KEY 를 넣으세요 (media/r2.env.example).'
    );
  }
  return { accessKeyId, secretAccessKey };
}

export function r2Client({ accessKeyId, secretAccessKey, accountId = R2_ACCOUNT_ID, bucket = R2_BUCKET }) {
  const host = `${accountId}.r2.cloudflarestorage.com`;

  async function call(method, key, { body, headers: extra = {}, query = '' } = {}) {
    const path = `/${bucket}${key ? '/' + encodePath(key) : ''}`;
    const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const headers = {
      host,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': sha256hex(body ?? ''),
      ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k.toLowerCase(), v])),
    };
    const authorization = signV4({ method, path, query, headers, accessKeyId, secretAccessKey, region: 'auto' });
    const { host: _h, ...sendHeaders } = headers;
    const res = await fetch(`https://${host}${path}${query ? '?' + query : ''}`, {
      method,
      headers: { ...sendHeaders, authorization },
      body,
    });
    return res;
  }

  return {
    host,
    bucket,
    /** 올린다. 실패하면 던진다 */
    async put(key, buf, { contentType, cacheControl }) {
      const res = await call('PUT', key, {
        body: buf,
        headers: { 'content-type': contentType, ...(cacheControl ? { 'cache-control': cacheControl } : {}) },
      });
      if (!res.ok) throw new Error(`R2 PUT ${key} ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return res.headers.get('etag');
    },
    /** 받는다. 없으면 null */
    async get(key) {
      const res = await call('GET', key);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`R2 GET ${key} ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return Buffer.from(await res.arrayBuffer());
    },
    /** 메타데이터만. 없으면 null */
    async head(key) {
      const res = await call('HEAD', key);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`R2 HEAD ${key} ${res.status}`);
      return {
        size: Number(res.headers.get('content-length')),
        contentType: res.headers.get('content-type'),
        cacheControl: res.headers.get('cache-control'),
        etag: res.headers.get('etag'),
      };
    },
    /** 키 목록 (prefix, 최대 1000) — 토큰 확인용 */
    async list(prefix = '') {
      const query = `list-type=2&max-keys=1000&prefix=${enc(prefix)}`;
      const res = await call('GET', '', { query });
      if (!res.ok) throw new Error(`R2 LIST ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const xml = await res.text();
      return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
    },
  };
}

/** 파일 내용으로 정한 버전(숫자 문자열) — 같은 파일을 다시 올리면 URL 이 그대로라 캐시를 버리지 않는다 */
export function contentVersion(buf) {
  return String(parseInt(sha256hex(buf).slice(0, 13), 16));
}
