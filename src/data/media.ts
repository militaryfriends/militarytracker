/**
 * 운동 미디어
 * ───────────────────────────────────────────────────────────────────────────
 * 영상은 앱에 넣지 않고 Cloudflare R2 버킷(militarytracker)에서 받아 기기에 캐시한다.
 * 무엇이 올라가 있는지는 버킷의 exercise/manifest.json 이 알려 주므로,
 * 영상을 추가·교체해도 앱 업데이트가 필요 없다 (src/stores/mediaStore.ts).
 *
 * 버킷 구조
 *   exercise/video/{id}.mp4    정사각형 최대 1280, H.264, 무음, 루프용
 *   exercise/poster/{id}.jpg   512x512 첫 프레임
 *   exercise/manifest.json     { items: { [id]: { video, poster } } } — 값은 버전(숫자 문자열)
 *
 * 업로드: npm run media:upload -- <부위>  (media/README.md)
 *
 * URL 의 v= 에 버전을 넣는다. 내용이 바뀌면 버전이 바뀌어 URL 이 달라지므로
 * 기기 캐시·브라우저 캐시가 자동으로 새 파일을 받는다. 그래서 객체에는 Cache-Control: immutable 을 걸어 두었다.
 */
import type { ImageSourcePropType } from 'react-native';
import type { VideoSource } from 'expo-video';

/**
 * R2 공개 주소. 지금은 r2.dev(Cloudflare 가 개발용으로 안내 · 속도 제한 있음).
 * 출시 전에 커스텀 도메인(예: https://media.militaryfriends.co.kr)으로 바꾼다 — 이 한 줄만 고치면 된다.
 * (scripts/upload-videos.mjs · media-r2.mjs 가 이 줄을 읽는다 — 형식 유지)
 */
export const MEDIA_BASE = 'https://pub-3b0808a706984f0cb9b60a16a47334c5.r2.dev';

// rev 는 버전(숫자 문자열). 매니페스트가 오염돼도 URL 에 임의 쿼리가 붙지 않게 인코딩한다
const objectUrl = (path: string, rev?: string): string =>
  `${MEDIA_BASE}/${path}${rev ? `?v=${encodeURIComponent(rev)}` : ''}`;

export const MANIFEST_URL = objectUrl('exercise/manifest.json');
export const videoUrl = (id: string, rev: string) => objectUrl(`exercise/video/${encodeURIComponent(id)}.mp4`, rev);
export const posterUrl = (id: string, rev: string) => objectUrl(`exercise/poster/${encodeURIComponent(id)}.jpg`, rev);

/** 매니페스트 한 항목 — 값은 버전 (없으면 해당 미디어 없음) */
export interface MediaEntry {
  video?: string;
  poster?: string;
}

// 같은 소스 객체를 돌려줘야 useVideoPlayer 가 렌더마다 플레이어를 다시 만들지 않는다
const sourceCache = new Map<string, VideoSource>();

export function videoSource(id: string, rev: string): VideoSource {
  const key = `${id}@${rev}`;
  let src = sourceCache.get(key);
  if (!src) {
    // useCaching: iOS·Android 에서 한 번 받은 영상을 기기에 저장해 두고 재사용한다.
    // 웹은 브라우저 캐시가 같은 일을 한다.
    src = { uri: videoUrl(id, rev), useCaching: true };
    sourceCache.set(key, src);
  }
  return src;
}

/** 번들 썸네일이 있으면 그걸(즉시 표시), 없으면 버킷 썸네일 */
export function posterSource(id: string, entry?: MediaEntry): ImageSourcePropType | null {
  const local = EX_IMAGE[id];
  if (local) return local;
  if (entry?.poster) return { uri: posterUrl(id, entry.poster) };
  return null;
}

/**
 * 앱에 함께 들어가는 썸네일 — 자세 탭 그리드가 네트워크 없이 즉시 뜨도록.
 * 새 종목은 여기 추가하지 않아도 버킷 썸네일(exercise/poster)로 표시된다.
 */
export const EX_IMAGE: Record<string, number> = {
  // 가슴 30종 포스터 (영상 첫 프레임)
  pushup: require('../../assets/exercise/image/pushup.jpg'),
  widepushup: require('../../assets/exercise/image/widepushup.jpg'),
  diamondpushup: require('../../assets/exercise/image/diamondpushup.jpg'),
  declinepushup: require('../../assets/exercise/image/declinepushup.jpg'),
  inclinepushup: require('../../assets/exercise/image/inclinepushup.jpg'),
  bench: require('../../assets/exercise/image/bench.jpg'),
  inclinebench: require('../../assets/exercise/image/inclinebench.jpg'),
  declinebench: require('../../assets/exercise/image/declinebench.jpg'),
  dbbench: require('../../assets/exercise/image/dbbench.jpg'),
  incdbpress: require('../../assets/exercise/image/incdbpress.jpg'),
  decdbpress: require('../../assets/exercise/image/decdbpress.jpg'),
  dbfly: require('../../assets/exercise/image/dbfly.jpg'),
  incdbfly: require('../../assets/exercise/image/incdbfly.jpg'),
  crossover: require('../../assets/exercise/image/crossover.jpg'),
  lowcablefly: require('../../assets/exercise/image/lowcablefly.jpg'),
  highcablefly: require('../../assets/exercise/image/highcablefly.jpg'),
  pecdeck: require('../../assets/exercise/image/pecdeck.jpg'),
  chestpressmc: require('../../assets/exercise/image/chestpressmc.jpg'),
  dipschest: require('../../assets/exercise/image/dipschest.jpg'),
  smithbench: require('../../assets/exercise/image/smithbench.jpg'),
  svend: require('../../assets/exercise/image/svend.jpg'),
  floorpress: require('../../assets/exercise/image/floorpress.jpg'),
  pikepushup: require('../../assets/exercise/image/pikepushup.jpg'),
  archerpushup: require('../../assets/exercise/image/archerpushup.jpg'),
  plyopushup: require('../../assets/exercise/image/plyopushup.jpg'),
  spiderpushup: require('../../assets/exercise/image/spiderpushup.jpg'),
  hindupushup: require('../../assets/exercise/image/hindupushup.jpg'),
  revbench: require('../../assets/exercise/image/revbench.jpg'),
  squeezepress: require('../../assets/exercise/image/squeezepress.jpg'),
  guillotine: require('../../assets/exercise/image/guillotine.jpg'),

  // 영상이 아직 없는 종목 — 기존 일러스트 사용
  deadlift: require('../../assets/form/form_dead.webp'),
  latpull: require('../../assets/form/form_latpull.webp'),
  latraise: require('../../assets/form/form_latraise.webp'),
  ohp: require('../../assets/form/form_ohp.webp'),
  plank: require('../../assets/form/form_plank.webp'),
  pullup: require('../../assets/form/form_pullup.webp'),
  pushdown: require('../../assets/form/form_pushdown.webp'),
  cablerow: require('../../assets/form/form_row.webp'),
  backsquat: require('../../assets/form/form_squat.webp'),
  uprow: require('../../assets/form/form_uprow.webp'),
};
