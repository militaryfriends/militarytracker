/**
 * 3D 아바타 렌더러 (웹, three.js).
 *  · 모델은 성별마다 한 번 내려받는다(assets/avatar/avatar_m.glb, meshopt 압축 약 0.4MB).
 *  · 작은 아바타(카드 · 홈)는 화면 밖 렌더러 하나로 PNG 를 찍어 이미지로 보여 준다 — WebGL 컨텍스트를 여러 개 열지 않는다.
 *  · 큰 아바타(분석 · 비교 · 프로젝트)는 캔버스를 붙여 손가락으로 돌리고, 모프를 부드럽게 바꾼다.
 * 그리는 일만 한다 — 좌표는 엔진(bodyComp · projection)이 정하고 morph.ts 가 모프 값으로 바꾼다.
 */
import { Asset } from 'expo-asset';
import type { Coord, Sex } from '../../../utils/bodyComp';
import { MODEL_SEXES, morphFor } from './morph';
import { applyMorph, buildStage, frame, makeDriver, prepareModel, styleRenderer, type Loaded, type Stage, type THREE } from './stage';

const MODEL_SRC: Partial<Record<Sex, number>> = {
  male: require('../../../../assets/avatar/avatar_m.glb'),
};

let threeP: Promise<{ T: THREE; GLTFLoader: typeof import('three/examples/jsm/loaders/GLTFLoader.js').GLTFLoader; Meshopt: unknown }> | null = null;
function loadThree() {
  threeP ??= import('./kit.web').then((k) => ({ T: k.T as THREE, GLTFLoader: k.GLTFLoader, Meshopt: k.MeshoptDecoder }));
  threeP.catch(() => { threeP = null; });
  return threeP;
}

const models = new Map<Sex, Promise<Loaded>>();

export function supports3D(sex: Sex): boolean {
  if (!MODEL_SEXES.includes(sex) || !MODEL_SRC[sex]) return false;
  return webglOK();
}

let glOK: boolean | null = null;
function webglOK(): boolean {
  if (glOK !== null) return glOK;
  try {
    const c = document.createElement('canvas');
    glOK = !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    glOK = false;
  }
  return glOK;
}

export function loadModel(sex: Sex): Promise<Loaded> {
  let p = models.get(sex);
  if (!p) {
    p = (async () => {
      const { T, GLTFLoader, Meshopt } = await loadThree();
      const asset = Asset.fromModule(MODEL_SRC[sex]!);
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(Meshopt as never);
      const gltf = await loader.loadAsync(asset.uri);
      return prepareModel(T, gltf.scene);
    })();
    p.catch(() => models.delete(sex));
    models.set(sex, p);
  }
  return p;
}

function makeRenderer(T: THREE, canvas?: HTMLCanvasElement, keep = false) {
  const r = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: keep, powerPreference: 'low-power' });
  styleRenderer(T, r);
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  return r;
}

// ─── 스냅샷 (작은 아바타) ──────────────────────────────────────────────────

const shots = new Map<string, string>();
const SHOT_LIMIT = 80;
let shooter: { r: import('three').WebGLRenderer; stages: Map<Sex, Stage> } | null = null;
let queue: Promise<unknown> = Promise.resolve();

export function cachedSnapshot(key: string): string | undefined {
  return shots.get(key);
}

/** 좌표의 몸을 정면(yaw 라디안)에서 찍은 PNG data URL */
export function snapshot(sex: Sex, c: Coord, w: number, h: number, key: string, yaw = 0): Promise<string> {
  const hit = shots.get(key);
  if (hit) return Promise.resolve(hit);
  const job = queue.then(async () => {
    const again = shots.get(key);
    if (again) return again;
    const m = await loadModel(sex);
    if (!shooter) shooter = { r: makeRenderer(m.T, undefined, true), stages: new Map() };
    let st = shooter.stages.get(sex);
    if (!st) {
      st = buildStage(m, w / h);
      shooter.stages.set(sex, st);
    }
    shooter.r.setSize(w, h, false);
    frame(st.camera, st.height, w / h);
    st.pivot.rotation.y = yaw;
    applyMorph(st, morphFor(sex, c));
    shooter.r.render(st.scene, st.camera);
    const url = shooter.r.domElement.toDataURL('image/png');
    shots.set(key, url);
    if (shots.size > SHOT_LIMIT) shots.delete(shots.keys().next().value as string);
    return url;
  });
  queue = job.catch(() => {});
  return job;
}

// ─── 살아 있는 뷰어 (큰 아바타) ─────────────────────────────────────────────

export interface Viewer {
  setCoord(c: Coord, ms?: number): void;
  setYaw(y: number): void;
  resize(w: number, h: number): void;
  dispose(): void;
}

export async function mountViewer(
  host: HTMLElement,
  opts: { sex: Sex; coord: Coord; w: number; h: number; yaw?: number; onYaw?: (y: number) => void; intro?: boolean },
): Promise<Viewer> {
  const m = await loadModel(opts.sex);
  const { T } = m;
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.touchAction = 'pan-y'; // 세로 스크롤은 페이지가, 가로 드래그는 회전
  canvas.style.cursor = 'grab';
  host.appendChild(canvas);
  const r = makeRenderer(T, canvas);
  r.setSize(opts.w, opts.h, false);
  const st = buildStage(m, opts.w / opts.h);

  const drv = makeDriver(st, morphFor(opts.sex, opts.coord), {
    draw: () => r.render(st.scene, st.camera), yaw: opts.yaw, intro: opts.intro, onYaw: opts.onYaw,
  });
  let dragging = false;

  let lastX = 0;
  let startX = 0;
  let startY = 0;
  let decided = false;
  const down = (e: PointerEvent) => {
    lastX = startX = e.clientX;
    startY = e.clientY;
    decided = false;
    dragging = true;
    canvas.style.cursor = 'grabbing';
    canvas.setPointerCapture?.(e.pointerId);
    drv.grab();
  };
  const move = (e: PointerEvent) => {
    if (!dragging) return;
    if (!decided) {
      // 세로로 더 움직였으면 스크롤 — 회전하지 않는다
      if (Math.abs(e.clientY - startY) > Math.abs(e.clientX - startX) + 4) {
        dragging = false;
        canvas.style.cursor = 'grab';
        drv.release();
        return;
      }
      if (Math.abs(e.clientX - startX) > 3) decided = true;
    }
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    drv.drag(dx);
  };
  const up = () => {
    if (!dragging) return;
    dragging = false;
    canvas.style.cursor = 'grab';
    drv.release();
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', up);
  drv.kick();

  return {
    setCoord(c, ms = 600) {
      drv.setMorph(morphFor(opts.sex, c), ms);
    },
    setYaw(y) {
      drv.setYaw(y);
    },
    resize(w, h) {
      r.setSize(w, h, false);
      frame(st.camera, st.height, w / h);
      drv.kick();
    },
    dispose() {
      drv.dispose();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('pointerleave', up);
      r.dispose();
      r.forceContextLoss();
      canvas.remove();
    },
  };
}
