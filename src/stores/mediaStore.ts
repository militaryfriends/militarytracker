/**
 * 운동 미디어 매니페스트 — 버킷에 무엇이 올라가 있는지.
 *
 * 1. 앱에 들어간 스냅샷(src/data/mediaManifest.json)으로 시작한다 — 첫 실행·오프라인 대비
 * 2. 실행할 때마다 버킷의 exercise/manifest.json 을 받아 교체한다
 * 3. 받은 것은 기기에 저장해 두어 다음 실행에서 바로 쓴다
 *
 * 두 파일 모두 scripts/upload-videos.mjs 가 같은 내용으로 쓴다.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import bundled from '../data/mediaManifest.json';
import { MANIFEST_URL, MediaEntry } from '../data/media';

export interface MediaManifest {
  /** ISO 시각 — 비교용 */
  updatedAt: string;
  items: Record<string, MediaEntry>;
}

/** 버킷에서 온 값이 깨져 있어도 앱이 죽지 않도록 */
function parseManifest(raw: unknown): MediaManifest | null {
  const d = raw as Partial<MediaManifest> | null;
  if (!d || typeof d !== 'object' || !d.items || typeof d.items !== 'object') return null;
  const items: Record<string, MediaEntry> = {};
  for (const [id, e] of Object.entries(d.items)) {
    if (!/^[A-Za-z0-9_]+$/.test(id) || !e || typeof e !== 'object') continue;
    const { video, poster } = e as MediaEntry;
    const entry: MediaEntry = {};
    // 버전은 숫자 문자열이다 — 그 외 값은 버린다
    if (typeof video === 'string' && /^\d{1,24}$/.test(video)) entry.video = video;
    if (typeof poster === 'string' && /^\d{1,24}$/.test(poster)) entry.poster = poster;
    if (entry.video || entry.poster) items[id] = entry;
  }
  // updatedAt 이 없으면 비교 기준이 없어 매 실행 번들↔원격을 오간다 — 파싱 실패로 본다
  if (typeof d.updatedAt !== 'string' || !d.updatedAt) return null;
  return { updatedAt: d.updatedAt, items };
}

const BUNDLED: MediaManifest = parseManifest(bundled) ?? { updatedAt: '', items: {} };

interface MediaState {
  manifest: MediaManifest;
  /** 버킷의 최신 매니페스트를 받아 온다. 실패하면 가진 것으로 계속한다. */
  refresh: () => Promise<void>;
}

export const useMediaStore = create<MediaState>()(
  persist(
    (set, get) => ({
      manifest: BUNDLED,
      refresh: async () => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        try {
          const res = await fetch(MANIFEST_URL, { cache: 'no-store', signal: ctrl.signal });
          if (!res.ok) return;
          const next = parseManifest(await res.json());
          // 버킷이 기준이다 — 영상을 내린 경우(롤백)도 그대로 반영한다
          if (next && next.updatedAt !== get().manifest.updatedAt) set({ manifest: next });
        } catch {
          // 오프라인·타임아웃 — 저장해 둔 매니페스트로 계속
        } finally {
          clearTimeout(timer);
        }
      },
    }),
    {
      name: 'mt-media',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ manifest: s.manifest }),
      // 앱 업데이트로 들어온 스냅샷이 저장본보다 새것이면 스냅샷을 쓴다
      merge: (persisted, current) => {
        const saved = parseManifest((persisted as { manifest?: unknown } | undefined)?.manifest);
        const manifest = saved && saved.updatedAt > BUNDLED.updatedAt ? saved : BUNDLED;
        return { ...current, manifest };
      },
    }
  )
);

// ─── 훅 ────────────────────────────────────────────────────────────────────
export const useMediaEntry = (id: string): MediaEntry | undefined =>
  useMediaStore((s) => s.manifest.items[id]);

export const useMediaItems = (): Record<string, MediaEntry> =>
  useMediaStore((s) => s.manifest.items);

export const useVideoCount = (): number =>
  useMediaStore((s) => {
    let n = 0;
    for (const k in s.manifest.items) if (s.manifest.items[k].video) n++;
    return n;
  });
