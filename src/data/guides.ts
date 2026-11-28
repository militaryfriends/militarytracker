/**
 * 오늘의 가이드 — 밀리터리프렌즈 인스타에 이미 게시한 최신 VO(보이스오버) 운동 꿀팁 릴스(2026-11-28 대표 지시).
 *  · 우리가 만든 영상만(저작권 정리가 쉬움). 가많실 시리즈 · 예전 릴스 · 운동 꿀팁이 아닌 편(수면 · 보충제 · 다이어트 상식)은 넣지 않는다.
 *  · 남의 음원 · 효과음이 섞인 편은 뺐다(11/28 점검: 카프레이즈 30일 · 할로우 홀드 30일 = 다른 크리에이터 음원, 전완근 = 레퍼런스 효과음).
 *  · 표지(9:16 한 장면)는 앱에 넣고(assets/guide), 영상은 R2 의 guide/video/{id}.mp4 (scripts/upload-guides.mjs).
 *  · 버전은 guideManifest.json — 업로드 스크립트가 쓴다. 버전이 없는 편은 아직 안 올라간 것 → 목록에 안 보인다.
 *  · 문구는 게시한 영상의 내용 그대로 — 영상에 없는 숫자 · 효과를 덧붙이지 않는다.
 */
import type { ImageSourcePropType } from 'react-native';
import manifest from './guideManifest.json';
import { MEDIA_BASE } from './media';

export interface Guide {
  id: string;
  title: string;
  /** 한 줄 설명 — 게시한 캡션 · 표지 글 그대로(없으면 빈 문자열) */
  hook: string;
  /** 오늘 운동 부위와 맞출 때 쓰는 말(plan day focus 의 낱말과 같게: 가슴 · 등 · 하체 · 어깨 · 이두 · 삼두 · 코어 …) */
  tags: readonly string[];
  /** 영상 길이(초) */
  sec: number;
  /** 인스타 릴스 코드 — instagram.com/reel/{ig} */
  ig: string;
  poster: ImageSourcePropType;
}

const ALL: Guide[] = [
  { id: 'bench5', title: '벤치프레스 5단계', hook: '바를 잡기 전에 절반이 결정됩니다', tags: ['가슴', '삼두'], sec: 40, ig: 'DgRuj6XqZUJ', poster: require('../../assets/guide/bench5.jpg') },
  { id: 'squat-rom', title: '스쿼트 가동범위', hook: '가동범위, 중요할까요?', tags: ['하체'], sec: 72, ig: 'DgFToT_qnp9', poster: require('../../assets/guide/squat-rom.jpg') },
  { id: 'pull-day', title: '풀데이 루틴', hook: '', tags: ['등', '이두'], sec: 42, ig: 'Dfjgd1iKyJe', poster: require('../../assets/guide/pull-day.jpg') },
  { id: 'tri-oh', title: '삼두의 비밀', hook: '삼두 키우고 싶으면', tags: ['삼두', '팔'], sec: 60, ig: 'DgRMjTsKdpr', poster: require('../../assets/guide/tri-oh.jpg') },
  { id: 'bench-vs-db', title: '바벨 100kg vs 덤벨 50kg', hook: '바벨 100kg은 올라가는데', tags: ['가슴'], sec: 88, ig: 'DgBxj6RKAGm', poster: require('../../assets/guide/bench-vs-db.jpg') },
  { id: 'cable', title: '케이블 머신은 왜 다를까', hook: '같은 40인데 왜 무게가 다를까?', tags: ['상식'], sec: 80, ig: 'Df9QdgmKlw1', poster: require('../../assets/guide/cable.jpg') },
  { id: 'pushup-30', title: '푸시업 30일', hook: '매일 하면 몸에 무슨 일이 일어날까요?', tags: ['가슴', '맨몸'], sec: 69, ig: 'DgG07DGK0NU', poster: require('../../assets/guide/pushup-30.jpg') },
  { id: 'muscle-memory', title: '머슬메모리', hook: '운동 쉬면 근육, 다시 돌아오는 데 얼마나?', tags: ['상식'], sec: 67, ig: 'DgO3Db3qim8', poster: require('../../assets/guide/muscle-memory.jpg') },
  { id: 'tib-30', title: '벽 발끝 들기 30일', hook: '벽에 등 대고 발끝을 매일 들면', tags: ['하체', '맨몸'], sec: 63, ig: 'DgKJqWXKZtE', poster: require('../../assets/guide/tib-30.jpg') },
  { id: 'bw-routine', title: '맨몸 운동 루틴', hook: '집에서 운동하신다면', tags: ['맨몸', '전신'], sec: 72, ig: 'Df_FUTUqqeU', poster: require('../../assets/guide/bw-routine.jpg') },
  { id: 'posture5', title: '거북목 · 말린 어깨 5분', hook: '하나쯤 해당되시죠?', tags: ['스트레칭', '어깨'], sec: 45, ig: 'DgHjvnNqXsd', poster: require('../../assets/guide/posture5.jpg') },
];

// 로컬 시험(EXPO_PUBLIC_GUIDE_BASE=http://localhost:…)이면 모든 편을 그 주소에서 읽는다 — 업로드 전 화면 · 재생 확인용
const LOCAL_BASE = process.env.EXPO_PUBLIC_GUIDE_BASE;
const VERSIONS: Record<string, { video?: string; sec?: number }> = LOCAL_BASE
  ? Object.fromEntries(ALL.map((g) => [g.id, { video: 'local' }]))
  : (manifest as { items?: Record<string, { video?: string; sec?: number }> }).items ?? {};

/** 영상이 올라간 편만 — 순서 = 위 목록(최신 · 대표작 먼저) */
export const GUIDES: Guide[] = ALL
  .filter((g) => !!VERSIONS[g.id]?.video)
  .map((g) => ({ ...g, sec: VERSIONS[g.id]?.sec ?? g.sec }));

export const guideById = (id: string): Guide | undefined => GUIDES.find((g) => g.id === id);

export function guideVideoUrl(id: string): string | null {
  const v = VERSIONS[id]?.video;
  return v ? `${LOCAL_BASE ?? MEDIA_BASE}/guide/video/${encodeURIComponent(id)}.mp4?v=${encodeURIComponent(v)}` : null;
}

export const secLabel = (sec: number) => (sec >= 60 ? `${Math.floor(sec / 60)}분${sec % 60 ? ` ${sec % 60}초` : ''}` : `${sec}초`);
