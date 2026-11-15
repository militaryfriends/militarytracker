/**
 * 3D 아바타 렌더러 (iOS · Android, three.js + expo-gl).
 *  · 모델: assets/avatar/avatar_{m|f}_native.glb + 텍스처(jpg) — 웹 모델과 같은 메시 · 모프지만 meshopt 압축이 없다
 *    (meshopt 해제는 WebAssembly 인데 Hermes 에는 없다). 정점만 양자화(KHR_mesh_quantization, 약 1MB).
 *  · GLView 하나 = GL 컨텍스트 하나. 정지 아바타도 GLView 로 한 번 그리고 멈춘다(바뀔 때만 다시 그림).
 *  · 한 번이라도 GL 초기화가 실패하면 그 뒤로는 2D 로 그린다(broken) — 3D 때문에 화면이 깨지지 않게.
 * 장면 · 조명 · 움직임은 웹과 같은 stage.ts.
 */
import { getThemeMode } from '../../../theme/tokens';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { Asset } from 'expo-asset';
import type { ExpoWebGLRenderingContext } from 'expo-gl';
import type { Coord, Sex } from '../../../utils/bodyComp';
import { MODEL_SEXES, morphFor, type Shape } from './morph';
import { buildStage, makeDriver, prepareModel, styleRenderer, texSetup, type Loaded, type THREE } from './stage';
import { ensureTextDecoder } from './textDecoder';

const MODEL_SRC: Partial<Record<Sex, number>> = {
  male: require('../../../../assets/avatar/avatar_m_native.glb'),
  female: require('../../../../assets/avatar/avatar_f_native.glb'),
};
const TEX_SRC: Partial<Record<Sex, { normal?: number; ao?: number; cloth?: number }>> = {
  male: {
    ao: require('../../../../assets/avatar/m_body_ao.jpg'),
    cloth: require('../../../../assets/avatar/m_cloth.jpg'),
  },
  female: {
    ao: require('../../../../assets/avatar/f_body_ao.jpg'),
    cloth: require('../../../../assets/avatar/f_cloth.jpg'),
  },
};

/**
 * 앱의 텍스처 — expo-gl 은 HTMLImage 가 없고 gl.texImage2D · texSubImage2D 에 { localUri } 를 주면 파일을 직접 푼다
 * (expo-gl common/EXGLImageUtils.cpp). 그래서 three 에는 "데이터 텍스처"로 넘겨 그 객체를 그대로 GL 에 보내게 한다
 * (expo-three 와 같은 방식). 크기는 에셋이 알려 준 값 — 파일과 같아야 한다.
 */
async function nativeTexture(T: THREE, mod: number | undefined, color: boolean) {
  if (!mod) return null;
  try {
    const a = Asset.fromModule(mod);
    await a.downloadAsync();
    if (!a.localUri || !a.width || !a.height) return null;
    const t = new T.Texture();
    t.image = { data: { localUri: a.localUri }, width: a.width, height: a.height };
    (t as unknown as { isDataTexture: boolean }).isDataTexture = true;
    t.generateMipmaps = true;
    t.minFilter = T.LinearMipmapLinearFilter;
    t.magFilter = T.LinearFilter;
    return texSetup(T, t, color);
  } catch {
    return null;
  }
}

let broken = false;
let brokenWhy: string | null = null;

/**
 * 안드로이드 스토어 빌드와 expo-gl (2026-11-15 원인 확인).
 * SDK 58 템플릿은 릴리스 빌드에서 R8(코드 줄이기 · 이름 바꾸기)이 기본으로 켜진다. expo-gl 은 네이티브(C++)에서
 * 자바 `GLContext.flush()` 를 **이름으로** 찾는데(EXGLJniApi.cpp GetMethodID) 지켜 주는 규칙이 없어 이름이 바뀌고,
 * 첫 GL 컨텍스트를 준비하는 순간 앱이 통째로 죽는다(JS 의 try/catch 로 못 잡는다). iOS · Expo Go · 개발 빌드는 해당 없음.
 * 고친 것은 빌드 설정이다 — app.json 의 expo-build-properties(R8 끔 + expo.modules.gl 지키기). 그 설정으로 만든 빌드에는
 * app.json `extra.nativeRev` 2 가 들어 있다(빌드에 묻힌 설정 — 코드 푸시로는 안 바뀐다).
 * → 안드로이드에서 nativeRev 가 2 보다 작은 빌드는 3D 를 아예 띄우지 않는다(죽지 않고 자리 표시만).
 * 네이티브 설정을 또 바꿔야 하면 app.json 의 nativeRev 와 여기 NEED_NATIVE_REV 를 같이 올린다.
 */
const NEED_NATIVE_REV = 2;
type NativeConst = { manifest?: unknown; deviceName?: string; systemVersion?: string; executionEnvironment?: string };
function nativeConst(): NativeConst {
  try {
    return (requireOptionalNativeModule('ExponentConstants') as NativeConst | null) ?? {};
  } catch {
    return {};
  }
}
/** 빌드에 묻힌 app.json 의 extra.nativeRev (코드 푸시를 받아도 그 빌드의 값 그대로) */
function nativeRev(): number {
  try {
    const raw = nativeConst().manifest;
    const cfg = (typeof raw === 'string' ? JSON.parse(raw) : raw) as { extra?: { nativeRev?: number } } | null;
    return Number(cfg?.extra?.nativeRev) || 0;
  } catch {
    return 0;
  }
}
const NATIVE_REV = nativeRev();
if (Platform.OS === 'android' && !__DEV__ && nativeConst().executionEnvironment !== 'storeClient' && NATIVE_REV < NEED_NATIVE_REV) {
  broken = true;
  brokenWhy = '이 안드로이드 빌드는 3D 를 그릴 수 없습니다 — 새 빌드로 업데이트하면 켜집니다';
}

export const native3D = (sex: Sex) => !broken && MODEL_SEXES.includes(sex) && !!MODEL_SRC[sex];
export function markBroken(e?: unknown) {
  if (!broken && __DEV__) console.warn('[avatar3d] 3D 를 끄고 자리 표시로 그립니다', e);
  if (!broken) brokenWhy = e instanceof Error ? e.message : e == null ? 'unknown' : String(e);
  broken = true;
}
/** 3D 를 끈 이유(처음 실패한 오류 메시지) — 없으면 null. MY 탭 아래에 작게 보여 준다(기기 진단용) */
export const avatar3DError = () => brokenWhy;

/**
 * 3D 때문에 앱이 꺼지는 기기를 스스로 알아챈다 (2026-11-15, 안드로이드 내부 테스트에서 로그인 뒤 튕김).
 * GL 쪽에서 죽으면 JS 의 try/catch 로는 못 잡는다 — 다음 실행도 같은 화면에서 또 죽어 앱에 못 들어간다.
 *  · 3D 를 처음 띄우기 직전에 '시도 중' 을 적고, 무사히 그리고 2.5초가 지나면 '정상' 으로 바꾼다.
 *  · 다음 실행에 '시도 중' 이 두 번 연달아 남아 있으면 = 두 번 죽었다 → 이 기기에서는 3D 를 끈다(자리 표시만 보인다).
 *  · 어디까지 갔다 죽었는지(glStage)도 같이 적어 두어, 꺼진 이유 옆에 마지막 단계 · 기기 이름이 나온다.
 *  · 3D 코드를 고치면 GUARD_VER 를, 네이티브 빌드가 바뀌면 nativeRev 를 올린다 — 꺼 둔 기기도 한 번 다시 시도한다.
 * 3D 화면은 glGuard() 가 true 를 준 뒤에만 GLView 를 만든다.
 */
const GUARD_KEY = 'mt-gl-guard';
const STAGE_KEY = 'mt-gl-stage';
const GUARD_VER = '2';
const GUARD_REV = `${GUARD_VER}-${NATIVE_REV}`;
const GUARD_MSG = '이전 실행에서 3D 를 그리다 앱이 종료되어 이 기기에서는 3D 를 껐습니다';
let guard: Promise<boolean> | null = null;
let stageDone = false;
/** 3D 를 띄우는 단계 기록 — view → context → model → renderer → frame. 무사히 끝난 뒤에는 적지 않는다 */
export async function glStage(stage: string): Promise<void> {
  if (stageDone) return;
  try { await AsyncStorage.setItem(STAGE_KEY, stage); } catch { /* 진단용 — 실패해도 그대로 간다 */ }
}
export function glGuard(): Promise<boolean> {
  if (!guard) {
    guard = (async () => {
      try {
        const [st, rev, nStr] = ((await AsyncStorage.getItem(GUARD_KEY)) ?? '').split(':');
        const same = rev === GUARD_REV;
        const n = same && st === 'trying' ? Number(nStr) || 0 : 0;
        if ((same && st === 'off') || n >= 2) {
          if (st !== 'off') await AsyncStorage.setItem(GUARD_KEY, `off:${GUARD_REV}:${n}`);
          const at = (await AsyncStorage.getItem(STAGE_KEY).catch(() => null)) ?? '?';
          const c = nativeConst();
          markBroken(new Error(`${GUARD_MSG} (단계 ${at} · ${c.deviceName ?? '?'} · OS ${c.systemVersion ?? '?'} · 빌드 ${NATIVE_REV})`));
          return false;
        }
        await AsyncStorage.setItem(GUARD_KEY, `trying:${GUARD_REV}:${n + 1}`);
        await glStage('view');
        return true;
      } catch {
        return true;
      }
    })();
  }
  return guard;
}
let guardSettled = false;
/** 3D 를 한 번 무사히 그렸다 — 조금 뒤에도 살아 있으면 '정상' 으로 적는다 */
export function glGuardOk() {
  if (guardSettled) return;
  guardSettled = true;
  setTimeout(() => {
    stageDone = true;
    AsyncStorage.setItem(GUARD_KEY, `ok:${GUARD_REV}:0`).catch(() => {});
  }, 2500);
}

/**
 * three r163+ 는 `context instanceof WebGLRenderingContext` 면 "WebGL 1 은 지원 안 함" 으로 멈춘다.
 * expo-gl(SDK 57)은 WebGL2 컨텍스트가 스펙대로 WebGLRenderingContext 를 상속해 이 검사에 걸린다 →
 * 렌더러를 만드는 동안만 전역 WebGLRenderingContext 를 치워 둔다(three 는 생성자에서만 이 이름을 본다).
 * 진짜 WebGL1(GLES 2) 기기는 supportsWebGL2 로 먼저 걸러 2D 로 보낸다.
 */
function makeRenderer(T: THREE, gl: ExpoWebGLRenderingContext, canvas: HTMLCanvasElement) {
  if ((gl as unknown as { supportsWebGL2?: boolean }).supportsWebGL2 === false) {
    throw new Error('GLES 3 미지원 기기');
  }
  const g = globalThis as unknown as { WebGLRenderingContext?: unknown };
  const saved = g.WebGLRenderingContext;
  g.WebGLRenderingContext = undefined;
  try {
    return new T.WebGLRenderer({ canvas, context: gl as unknown as WebGL2RenderingContext, antialias: false, alpha: true });
  } finally {
    g.WebGLRenderingContext = saved;
  }
}

// three 는 처음 3D 를 그릴 때 불러온다(앱 시작을 늦추지 않게)
const three = (): THREE => require('three');

const models = new Map<Sex, Promise<Loaded>>();

export function loadModel(sex: Sex): Promise<Loaded> {
  let p = models.get(sex);
  if (!p) {
    p = (async () => {
      ensureTextDecoder();
      const T = three();
      const { GLTFLoader } = require('three/examples/jsm/loaders/GLTFLoader.js') as typeof import('three/examples/jsm/loaders/GLTFLoader.js');
      const asset = Asset.fromModule(MODEL_SRC[sex]!);
      await asset.downloadAsync();
      // 네이티브 모듈은 쓸 때 불러온다 — 이 모듈이 없는 옛 빌드에서도 앱이 켜지게(그때는 2D)
      const { File } = require('expo-file-system') as typeof import('expo-file-system');
      const buf = await new File(asset.localUri ?? asset.uri).arrayBuffer();
      const gltf = await new GLTFLoader().parseAsync(buf, '');
      const src = TEX_SRC[sex] ?? {};
      const [normal, ao, cloth] = await Promise.all([
        nativeTexture(T, src.normal, false), nativeTexture(T, src.ao, false), nativeTexture(T, src.cloth, true),
      ]);
      return prepareModel(T, gltf.scene, { normal, ao, cloth });
    })();
    p.catch(() => models.delete(sex));
    models.set(sex, p);
  }
  return p;
}

export interface NativeView {
  setCoord(c: Coord, ms?: number, shape?: Shape): void;
  setYaw(y: number): void;
  grab(): void;
  drag(dx: number): void;
  release(): void;
  dispose(): void;
}

/** GLView 의 컨텍스트에 몸을 그린다 */
export async function attach(
  gl: ExpoWebGLRenderingContext,
  opts: { sex: Sex; coord: Coord; shape?: Shape; yaw?: number; intro?: boolean; onYaw?: (y: number) => void; breathe?: boolean },
): Promise<NativeView> {
  await glStage('context');
  const m = await loadModel(opts.sex);
  const { T } = m;
  await glStage('model');
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  // three 는 캔버스 객체를 기대한다 — 크기 · 이벤트 자리만 있으면 된다
  const canvas = {
    width: w, height: h, clientWidth: w, clientHeight: h, style: {},
    addEventListener: () => {}, removeEventListener: () => {}, getContext: () => gl,
  } as unknown as HTMLCanvasElement;
  const r = makeRenderer(T, gl, canvas);
  styleRenderer(T, r, getThemeMode() === 'light');
  r.setPixelRatio(1);
  r.setSize(w, h, false);
  const st = buildStage(m, w / h);
  await glStage('renderer');
  let dead = false;
  const drv = makeDriver(st, morphFor(opts.sex, opts.coord, opts.shape), {
    draw: () => {
      if (dead) return;
      r.render(st.scene, st.camera);
      gl.endFrameEXP();
    },
    yaw: opts.yaw, intro: opts.intro, onYaw: opts.onYaw, breathe: opts.breathe,
  });
  drv.kick();
  void glStage('frame');
  return {
    setCoord: (c, ms = 600, shape) => drv.setMorph(morphFor(opts.sex, c, shape), ms),
    setYaw: (y) => drv.setYaw(y),
    grab: () => drv.grab(),
    drag: (dx) => drv.drag(dx),
    release: () => drv.release(),
    dispose() {
      dead = true;
      drv.dispose();
      r.dispose();
    },
  };
}
