/**
 * 테마 — 라이트 · 다크 두 벌의 색. 값은 palette.json 한 곳 (check:theme 스크립트도 그 파일을 읽는다).
 *
 * 화면 코드에서 쓰는 법
 *  - 색 하나:  colors.ink · colors.panel … (지금 모드의 값을 돌려준다)
 *  - 스타일:   const s = themed(() => StyleSheet.create({ … colors.ink … }))
 *              → 모드마다 한 번 만들고, s.x 를 읽는 순간의 모드 값을 준다.
 *  - 다시 그리기: 색을 읽는 컴포넌트는 맨 위에서 useThemeMode() 를 한 번 부른다.
 *
 * colors 는 읽는 순간의 모드 값을 돌려주므로 렌더 중에 읽어야 한다.
 * 파일 맨 위에서 값으로 저장하면(const X = colors.ink) 그 순간 모드에 묶인다.
 *
 * 모드 정하기: 고른 값(pref) = 'system' | 'light' | 'dark'. 처음엔 'system' — 기기 설정을 따라간다.
 * 토글이나 MY › 화면에서 고르면 기억한다(AsyncStorage 'mt-theme', 웹은 localStorage 같은 키).
 *
 * 웹: 정적 HTML 은 다크로 미리 그려 둔다. 첫 렌더(하이드레이션)도 다크로 맞춘 뒤 restoreThemePref() 가 제 모드로 바꾼다.
 * 다크가 아닌 사람은 app/+html.tsx 의 스크립트가 그동안 바탕만 칠하고 화면을 가려 둔다 (깜빡임 없음).
 */
import { useLayoutEffect, useState } from 'react';
import { Appearance, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PALETTE from './palette.json';

export type ThemeMode = 'light' | 'dark';
export type ThemePref = 'system' | ThemeMode;
export type ColorToken = keyof typeof PALETTE.dark;
export type Palette = Record<ColorToken, string>;

// 두 모드의 키가 다르면 여기서 타입 오류가 난다
const TABLE: Record<ThemeMode, Palette> = PALETTE;

export const THEME_STORAGE_KEY = 'mt-theme';

/** 기기 설정 — 알 수 없으면 앱 본래 모습인 다크 */
function systemMode(): ThemeMode {
  return Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
}

/** 고른 값 → 실제 모드 */
export function resolveMode(p: ThemePref): ThemeMode {
  return p === 'system' ? systemMode() : p;
}

function isPref(v: unknown): v is ThemePref {
  return v === 'system' || v === 'light' || v === 'dark';
}

let pref: ThemePref = 'system';
// 웹은 정적 HTML 과 같은 다크로 시작한다 (하이드레이션이 어긋나지 않게)
let mode: ThemeMode = Platform.OS === 'web' ? 'dark' : systemMode();
const listeners = new Set<(m: ThemeMode) => void>();
const prefListeners = new Set<(p: ThemePref) => void>();

export function getThemeMode(): ThemeMode {
  return mode;
}

export function getThemePref(): ThemePref {
  return pref;
}

function applyMode(next: ThemeMode) {
  if (next === mode) return;
  mode = next;
  // 같은 틱 안의 setState 들은 React 가 한 번에 그린다
  [...listeners].forEach((l) => l(next));
}

/** 모드를 고른다 (remember: 기억할지). 화면에 알리는 게 먼저, 저장은 뒤에서 기다리지 않고. */
export function setThemePref(next: ThemePref, remember = true) {
  if (next !== pref) {
    pref = next;
    [...prefListeners].forEach((l) => l(next));
  }
  applyMode(next === 'system' ? systemMode() : next);
  if (remember) {
    AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch((e) => console.warn('[theme] 저장 실패', e));
  }
}

export function subscribeThemeMode(l: (m: ThemeMode) => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** 앱 시작 때 — 저장된 값이 있으면 그 값, 없으면 기기 설정 */
export async function restoreThemePref(): Promise<ThemeMode> {
  let v: string | null = null;
  try {
    v = await AsyncStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    /* 저장소 실패 — 기기 설정 */
  }
  // 저장된 값이 없어도 한 번 정한다 (웹은 다크로 시작했으니 기기 설정으로 다시)
  setThemePref(isPref(v) ? v : pref, false);
  return mode;
}

Appearance.addChangeListener(({ colorScheme }) => {
  if (pref !== 'system') return;
  applyMode(colorScheme === 'light' ? 'light' : 'dark');
});

/** 모드가 바뀌면 이 컴포넌트를 다시 그린다 (색을 읽는 컴포넌트 맨 위에서 한 번) */
export function useThemeMode(): ThemeMode {
  const [, setSeen] = useState<ThemeMode>(mode);
  useLayoutEffect(() => {
    const onChange = (next: ThemeMode) => setSeen(next);
    listeners.add(onChange);
    // 그린 뒤 · 구독 전 사이에 바뀌었으면 따라잡는다
    setSeen((s) => (s === mode ? s : mode));
    return () => {
      listeners.delete(onChange);
    };
  }, []);
  return mode;
}

/** 고른 값 (MY › 화면 설정용) */
export function useThemePref(): ThemePref {
  const [p, setP] = useState<ThemePref>(pref);
  useLayoutEffect(() => {
    const on = (next: ThemePref) => setP(next);
    prefListeners.add(on);
    setP(pref);
    return () => {
      prefListeners.delete(on);
    };
  }, []);
  return p;
}

// ── 색 읽기 ─────────────────────────────────────────────

/** 지금 모드의 색 — 렌더 중에 읽는다 */
export const colors: Palette = new Proxy({} as Palette, {
  get: (_t, key) => (typeof key === 'string' ? TABLE[mode][key as ColorToken] : undefined),
  has: (_t, key) => key in TABLE[mode],
  ownKeys: () => Reflect.ownKeys(TABLE[mode]),
  getOwnPropertyDescriptor: (_t, key) =>
    typeof key === 'string' && key in TABLE[mode]
      ? { value: TABLE[mode][key as ColorToken], enumerable: true, configurable: true }
      : undefined,
});

/** 모드를 정해 놓고 읽는 색표 (전환 막 · 비교용) */
export function paletteFor(m: ThemeMode): Palette {
  return TABLE[m];
}

/**
 * 모드마다 한 번 만드는 값 (StyleSheet · 색 묶음 · 목록).
 * 돌려받은 값은 읽는 순간의 모드 값처럼 쓴다 (s.card · LIST.map …).
 */
export function themed<T extends object>(factory: () => T): T {
  const cache: Partial<Record<ThemeMode, T>> = {};
  const current = (): T => {
    const hit = cache[mode];
    if (hit) return hit;
    const made = factory();
    cache[mode] = made;
    return made;
  };
  const target = (Array.isArray(current()) ? [] : {}) as T;
  return new Proxy(target, {
    get: (_t, key) => {
      const obj = current() as Record<string | symbol, unknown>;
      const v = obj[key];
      // 배열 메서드(map · filter …)는 지금 값에 묶어서
      return typeof v === 'function' && Array.isArray(obj) ? (v as (...a: unknown[]) => unknown).bind(obj) : v;
    },
    has: (_t, key) => key in (current() as object),
    ownKeys: () => Reflect.ownKeys(current() as object),
    getOwnPropertyDescriptor: (t, key) => {
      const cur = current() as object;
      const d = Reflect.getOwnPropertyDescriptor(cur, key);
      if (!d) return undefined;
      // 배열의 length 는 감싼 빈 배열에도 고칠 수 없는 속성으로 있다 — 같은 성질로 알려 준다
      if (Array.isArray(t) && key === 'length') return { value: d.value, writable: true, enumerable: false, configurable: false };
      return { ...d, configurable: true };
    },
  });
}

/** 부위별 악센트 — 플레이스홀더 · 차트. 중간 밝기라 두 모드에 같은 값을 쓴다 (위 글자는 onMedia) */
export const partTint: Record<string, string> = {
  chest: '#5B7FA6',
  back: '#6A8F73',
  legs: '#A68A5B',
  shoulders: '#8A6FA6',
  biceps: '#A66F76',
  triceps: '#6F93A6',
  abs: '#8C8C93',
};
