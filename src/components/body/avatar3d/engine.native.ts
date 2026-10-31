/**
 * 3D 아바타 렌더러 (iOS · Android, three.js + expo-gl).
 *  · 모델: assets/avatar/avatar_{m|f}_native.glb + 텍스처(jpg) — 웹 모델과 같은 메시 · 모프지만 meshopt 압축이 없다
 *    (meshopt 해제는 WebAssembly 인데 Hermes 에는 없다). 정점만 양자화(KHR_mesh_quantization, 약 1MB).
 *  · GLView 하나 = GL 컨텍스트 하나. 정지 아바타도 GLView 로 한 번 그리고 멈춘다(바뀔 때만 다시 그림).
 *  · 한 번이라도 GL 초기화가 실패하면 그 뒤로는 2D 로 그린다(broken) — 3D 때문에 화면이 깨지지 않게.
 * 장면 · 조명 · 움직임은 웹과 같은 stage.ts.
 */
import { Asset } from 'expo-asset';
import type { ExpoWebGLRenderingContext } from 'expo-gl';
import type { Coord, Sex } from '../../../utils/bodyComp';
import { MODEL_SEXES, morphFor } from './morph';
import { buildStage, makeDriver, prepareModel, styleRenderer, texSetup, type Loaded, type THREE } from './stage';
import { ensureTextDecoder } from './textDecoder';

const MODEL_SRC: Partial<Record<Sex, number>> = {
  male: require('../../../../assets/avatar/avatar_m_native.glb'),
  female: require('../../../../assets/avatar/avatar_f_native.glb'),
};
const TEX_SRC: Partial<Record<Sex, { normal?: number; ao?: number; cloth?: number }>> = {
  male: {
    normal: require('../../../../assets/avatar/m_body_n.jpg'),
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
export const native3D = (sex: Sex) => !broken && MODEL_SEXES.includes(sex) && !!MODEL_SRC[sex];
export function markBroken(e?: unknown) {
  if (!broken && __DEV__) console.warn('[avatar3d] 3D 를 끄고 2D 로 그립니다', e);
  if (!broken) brokenWhy = e instanceof Error ? e.message : e == null ? 'unknown' : String(e);
  broken = true;
}
/** 3D 를 끈 이유(처음 실패한 오류 메시지) — 없으면 null. MY 탭 아래에 작게 보여 준다(기기 진단용) */
export const avatar3DError = () => brokenWhy;

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
  setCoord(c: Coord, ms?: number): void;
  setYaw(y: number): void;
  grab(): void;
  drag(dx: number): void;
  release(): void;
  dispose(): void;
}

/** GLView 의 컨텍스트에 몸을 그린다 */
export async function attach(
  gl: ExpoWebGLRenderingContext,
  opts: { sex: Sex; coord: Coord; yaw?: number; intro?: boolean; onYaw?: (y: number) => void },
): Promise<NativeView> {
  const m = await loadModel(opts.sex);
  const { T } = m;
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  // three 는 캔버스 객체를 기대한다 — 크기 · 이벤트 자리만 있으면 된다
  const canvas = {
    width: w, height: h, clientWidth: w, clientHeight: h, style: {},
    addEventListener: () => {}, removeEventListener: () => {}, getContext: () => gl,
  } as unknown as HTMLCanvasElement;
  const r = makeRenderer(T, gl, canvas);
  styleRenderer(T, r);
  r.setPixelRatio(1);
  r.setSize(w, h, false);
  const st = buildStage(m, w / h);
  let dead = false;
  const drv = makeDriver(st, morphFor(opts.sex, opts.coord), {
    draw: () => {
      if (dead) return;
      r.render(st.scene, st.camera);
      gl.endFrameEXP();
    },
    yaw: opts.yaw, intro: opts.intro, onYaw: opts.onYaw,
  });
  drv.kick();
  return {
    setCoord: (c, ms = 600) => drv.setMorph(morphFor(opts.sex, c), ms),
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
