# 운동 영상

## 폴더

```
media/
  originals/      원본 보관 — .gitignore 로 제외 (부위당 100~200MB)
    chest/        01.pushup.mp4 … 30.guillotine.mp4
    back/  legs/  shoulders/  biceps/  triceps/  abs/
  r2.env          R2 업로드 키 — .gitignore 로 제외 (r2.env.example 을 복사해 채운다)
  r2-cors.json    R2 버킷 CORS 설정 (아래)
  cors.json       옛 GCS 버킷 CORS 설정
```

원본은 **절대 `assets/` 에 넣지 않는다.** `assets/` 는 저장소와 앱 번들에 들어간다.

## 올리기

```bash
npm run media:upload -- back --dry   # 파일 → 종목 매칭표만 확인
npm run media:upload -- back         # 인코딩 · 업로드 · 매니페스트 갱신
```

- 파일명 앞 번호 = `src/data/exercises.ts` 에서 그 부위의 순번.
  `7.Lat Pulldown (1).mp4` 처럼 받은 이름 그대로 넣으면 된다.
- 업로드가 끝나면 원본 이름이 `07.latpull.mp4` 형식으로 정리된다.
- 같은 종목을 다시 올리면 교체된다. 내용이 바뀌면 URL 이 바뀌어 기기 캐시도 새 파일을 받는다.
- 필요: `ffmpeg`, Node 22+, `media/r2.env` (R2 키).

## R2 버킷 `militarytracker` (Cloudflare 계정 militaryfriends.official)

앱은 R2 에서 영상을 읽는다(2026-10-13 전환, 가슴 30개 이전). R2 는 내려받기(이그레스) 요금이 없다.
공개 주소는 `src/data/media.ts` 의 `MEDIA_BASE` 한 줄 — 지금은 r2.dev, **출시 전에 커스텀 도메인으로**(아래 6).

```bash
npm run media:r2 -- check     # 키 확인 · 공개 주소 · CORS
npm run media:r2 -- migrate   # 옛 버킷 exercise/** → R2 (다시 돌려도 됨)
```

전환 순서
1. **키** — R2 › Manage API tokens › Create Account API token: Object Read & Write, 버킷 `militarytracker` 만, TTL Forever.
   Access Key ID · Secret Access Key 를 `media/r2.env` 에 (`media/r2.env.example` 참조). 키는 이 스크립트만 쓴다 — 앱에 넣지 않는다.
2. **공개 주소** — 버킷 Settings › Custom Domains(권장, Cloudflare CDN 캐시) 또는 Public Development URL(r2.dev — 속도 제한, 개발용).
3. **CORS** — 버킷 Settings › CORS Policy 에 `media/r2-cors.json`. 없으면 웹 앱이 매니페스트를 못 읽는다(영상 재생은 무관).
4. `npm run media:r2 -- migrate` → `src/data/media.ts` 의 `MEDIA_BASE` 를 공개 주소로 → `npm run media:r2 -- check`.
   `MEDIA_BASE` 가 정해지기 전에는 `media:upload` 가 멈춘다(앱이 옛 버킷을 읽는 동안 R2 에 올리면 안 보인다).
5. 옛 버킷 파일은 지우지 않는다 — 이미 설치된 옛 빌드 · 배포된 웹이 읽는다.
6. **출시 전: 커스텀 도메인.** r2.dev 는 Cloudflare 가 개발용으로 안내하고 속도 제한이 있으며 CDN 캐시가 없다.
   `militaryfriends.co.kr`(지금 DNS: 호스트코코아, 홈페이지는 AWS, 메일 MX 없음)을 이 Cloudflare 계정으로 옮긴 뒤
   (무료 플랜 · 네임서버 변경 · 기존 A 레코드는 DNS only 로) 버킷 Custom Domains 에 `media.militaryfriends.co.kr` →
   `MEDIA_BASE` 를 그 주소로 → `npm run media:r2 -- check`. 영상 경로 · 매니페스트는 그대로다.

매니페스트 값은 파일 내용으로 정한 버전(숫자, `scripts/lib/r2.mjs` 의 `contentVersion`) — 옛 버킷에서 옮긴 30개는 GCS generation 그대로.

## 옛 버킷 (GCS) — 읽기 전용으로 남김

`gs://military-tracker-96bdd` — **asia-northeast3 (서울)**

| 경로 | 내용 | Cache-Control |
|---|---|---|
| `exercise/video/{id}.mp4` | 정사각형 최대 1280 H.264 High, CRF 18, 무음, faststart | `immutable` 1년 |
| `exercise/poster/{id}.jpg` | 512×512 첫 프레임 | `immutable` 1년 |
| `exercise/manifest.json` | `{ updatedAt, items: { id: { video, poster } } }` | `no-cache` |

매니페스트의 값은 각 파일의 GCS `generation` 이다. 앱은 URL 에 `v=<generation>` 을
붙이므로 같은 이름으로 다시 올리면 URL 이 달라져 캐시가 자동으로 무효화된다.
그래서 영상·썸네일에 `immutable` 을 걸어도 안전하다.

### 접근

- **읽기: 누구나** (`storage.rules` 의 `exercise/**`). 영상 플레이어, 특히 웹 `<video>` 는
  Firebase 인증 헤더를 붙일 수 없어 로그인 조건을 걸 수 없다. 원래 앱 번들에 그대로
  들어가던 공개 콘텐츠다.
- **쓰기: 규칙상 전면 차단.** 업로드 스크립트는 Google Cloud 권한으로 쓰므로 규칙을 거치지 않는다.
- **CORS (`cors.json`)**: 웹 앱이 `fetch()` 로 매니페스트를 읽으려면 필요하다. 없으면 웹은
  앱에 들어간 스냅샷만 보게 되어 새 영상이 안 뜬다. GET·HEAD 만 허용하며, 이미 공개된
  파일이라 접근 범위는 달라지지 않는다. 버킷을 새로 만들면 다시 적용할 것:

  ```bash
  gcloud storage buckets update gs://military-tracker-96bdd --cors-file=media/cors.json
  ```

## 앱 쪽

- `src/data/media.ts` — URL 생성, 번들 썸네일(`EX_IMAGE`)
- `src/stores/mediaStore.ts` — 매니페스트 (앱 스냅샷 → 실행 시 버킷에서 갱신 → 기기에 저장)
- `src/components/ExerciseMedia.tsx` — 영상을 받는 동안 썸네일로 덮고, 첫 프레임이 그려지면 걷는다.
  오프라인이면 썸네일이 남는다. iOS·Android 는 `useCaching` 으로 한 번 받은 영상을 기기에 저장.

## 참고 수치 (가슴 30개)

원본(1280², 약 10Mbps) 165MB → **32MB, 클립 평균 1.1MB** (최대 1280 · CRF 18, 2026-10-13).
처음엔 1080 · CRF 23(11.6MB, 평균 394KB)이었는데 근육 결 · 피부 음영이 눈에 띄게 뭉개졌다.
벤치프레스 SSIM(원본 대비): 1080/23 0.990 · 1080/18 0.993 · 1280/20 0.996 · 1280/18 0.997 —
CRF 보다 해상도를 줄인 게 더 컸다. R2 는 내려받기 요금이 없고 기기에 캐시되니 용량보다 화질을 택했다.
