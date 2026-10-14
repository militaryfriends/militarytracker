/**
 * 3D 아바타 렌더러 (웹, three.js).
 *  · 모델은 성별마다 한 번 내려받는다(assets/avatar/avatar_m.glb, meshopt 압축 약 0.4MB).
 *  · 작은 아바타(카드 · 홈)는 화면 밖 렌더러 하나로 PNG 를 찍어 이미지로 보여 준다 — WebGL 컨텍스트를 여러 개 열지 않는다.
 *  · 큰 아바타(분석 · 비교 · 프로젝트)는 캔버스를 붙여 손가락으로 돌리고, 모프를 부드럽게 바꾼다.
 * 그리는 일만 한다 — 좌표는 엔진(bodyComp · projection)이 정하고 morph.ts 가 모프 값으로 바꾼다.
 */
import { Asset } from 'expo-asset';
import type { Coord, Sex } from '../../../utils/bodyComp';
import { MODEL_SEXES, morphFor, type Morph, type MorphKey } from './morph';

type THREE = typeof import('three');
type Loaded = { T: THREE; scene: import('three').Object3D; height: number };

const MODEL_SRC: Partial<Record<Sex, number>> = {
  male: require('../../../../assets/avatar/avatar_m.glb'),
};

export const BODY_COLOR = '#B9B9BB';
export const CLOTH_COLOR = '#7C7C80';
/** 화면 높이 대비 몸 높이 — 발 아래 · 머리 위 여백 */
const FRAME = 1.07;
const FOV = 24;

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
      const body = new T.MeshStandardMaterial({ color: BODY_COLOR, roughness: 0.72, metalness: 0 });
      const cloth = new T.MeshStandardMaterial({ color: CLOTH_COLOR, roughness: 0.9, metalness: 0 });
      gltf.scene.traverse((o) => {
        const mesh = o as import('three').Mesh;
        if (!mesh.isMesh) return;
        mesh.material = /cloth/i.test(mesh.name) || /cloth/i.test(mesh.geometry.name) ? cloth : body;
        mesh.frustumCulled = false; // 모프로 커진 몸이 잘리지 않게
      });
      const box = new T.Box3().setFromObject(gltf.scene);
      return { T, scene: gltf.scene, height: box.max.y - box.min.y };
    })();
    p.catch(() => models.delete(sex));
    models.set(sex, p);
  }
  return p;
}

// ─── 장면 ──────────────────────────────────────────────────────────────────

interface Stage {
  scene: import('three').Scene;
  camera: import('three').PerspectiveCamera;
  pivot: import('three').Group;
  meshes: import('three').Mesh[];
  height: number;
}

function buildStage(m: Loaded, aspect: number): Stage {
  const { T } = m;
  const scene = new T.Scene();
  scene.add(new T.HemisphereLight(0xffffff, 0x3a3a3e, 1.0));
  const key = new T.DirectionalLight(0xffffff, 1.9);
  key.position.set(-2.2, 3.2, 4);
  const fill = new T.DirectionalLight(0xffffff, 0.75);
  fill.position.set(3, 1.2, 2.6);
  const rim = new T.DirectionalLight(0xffffff, 1.5);
  rim.position.set(0.5, 2.6, -4);
  scene.add(key, fill, rim);
  const pivot = new T.Group();
  const model = m.scene.clone(true);
  const meshes: import('three').Mesh[] = [];
  model.traverse((o) => {
    const mesh = o as import('three').Mesh;
    if (mesh.isMesh && mesh.morphTargetInfluences) meshes.push(mesh);
  });
  pivot.add(model);
  scene.add(pivot);
  const camera = new T.PerspectiveCamera(FOV, aspect, 0.1, 50);
  frame(camera, m.height, aspect);
  return { scene, camera, pivot, meshes, height: m.height };
}

function frame(camera: import('three').PerspectiveCamera, h: number, aspect: number) {
  const half = (FOV / 2) * (Math.PI / 180);
  // 세로가 맞으면 세로 기준, 화면이 아주 좁으면 가로(팔 너비 ≈ 키의 0.42)도 들어가게
  const byH = (h * FRAME) / 2 / Math.tan(half);
  const byW = (h * 0.5) / 2 / Math.tan(half) / Math.max(0.1, aspect);
  const d = Math.max(byH, byW);
  camera.aspect = aspect;
  camera.position.set(0, h / 2, d);
  camera.lookAt(0, h / 2, 0);
  camera.updateProjectionMatrix();
}

function applyMorph(st: Stage, mo: Morph) {
  for (const mesh of st.meshes) {
    const dict = mesh.morphTargetDictionary;
    const inf = mesh.morphTargetInfluences;
    if (!dict || !inf) continue;
    (Object.keys(mo) as MorphKey[]).forEach((k) => {
      const i = dict[k];
      if (i !== undefined) inf[i] = mo[k];
    });
  }
}

function makeRenderer(T: THREE, canvas?: HTMLCanvasElement, keep = false) {
  const r = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: keep, powerPreference: 'low-power' });
  r.setClearColor(0x000000, 0);
  r.outputColorSpace = T.SRGBColorSpace;
  r.toneMapping = T.NeutralToneMapping; // 가슴 · 어깨 하이라이트가 하얗게 날아가지 않게
  r.toneMappingExposure = 1.05;
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

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

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

  let cur: Morph = morphFor(opts.sex, opts.coord);
  let from: Morph = cur;
  let to: Morph = cur;
  let t0 = 0;
  let dur = 0;
  let yaw = opts.yaw ?? 0;
  let vel = 0;
  let dragging = false;
  let raf = 0;
  let dead = false;
  let introUntil = opts.intro ? performance.now() + 1400 : 0;
  const introFrom = -0.55;

  const draw = () => {
    raf = 0;
    if (dead) return;
    const now = performance.now();
    let busy = false;
    if (dur > 0) {
      const k = Math.min(1, (now - t0) / dur);
      const e = ease(k);
      cur = {
        fat_up: from.fat_up + (to.fat_up - from.fat_up) * e,
        fat_down: from.fat_down + (to.fat_down - from.fat_down) * e,
        mus_up: from.mus_up + (to.mus_up - from.mus_up) * e,
        mus_down: from.mus_down + (to.mus_down - from.mus_down) * e,
      };
      if (k >= 1) dur = 0;
      else busy = true;
    }
    if (introUntil) {
      const k = 1 - Math.max(0, (introUntil - now) / 1400);
      st.pivot.rotation.y = introFrom + (yaw - introFrom) * ease(k);
      if (k >= 1) introUntil = 0;
      else busy = true;
    } else {
      if (!dragging && Math.abs(vel) > 0.0004) {
        yaw += vel;
        vel *= 0.92;
        opts.onYaw?.(yaw);
        busy = true;
      }
      st.pivot.rotation.y = yaw;
    }
    applyMorph(st, cur);
    r.render(st.scene, st.camera);
    if (busy || dragging) raf = requestAnimationFrame(draw);
  };
  const kick = () => {
    if (!raf && !dead) raf = requestAnimationFrame(draw);
  };

  let lastX = 0;
  let startX = 0;
  let startY = 0;
  let decided = false;
  const down = (e: PointerEvent) => {
    lastX = startX = e.clientX;
    startY = e.clientY;
    decided = false;
    dragging = true;
    vel = 0;
    introUntil = 0;
    canvas.style.cursor = 'grabbing';
    canvas.setPointerCapture?.(e.pointerId);
    kick();
  };
  const move = (e: PointerEvent) => {
    if (!dragging) return;
    if (!decided) {
      // 세로로 더 움직였으면 스크롤 — 회전하지 않는다
      if (Math.abs(e.clientY - startY) > Math.abs(e.clientX - startX) + 4) {
        dragging = false;
        canvas.style.cursor = 'grab';
        return;
      }
      if (Math.abs(e.clientX - startX) > 3) decided = true;
    }
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    yaw += dx * 0.012;
    vel = dx * 0.012;
    opts.onYaw?.(yaw);
    kick();
  };
  const up = () => {
    if (!dragging) return;
    dragging = false;
    canvas.style.cursor = 'grab';
    kick();
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', up);
  kick();

  return {
    setCoord(c, ms = 600) {
      from = cur;
      to = morphFor(opts.sex, c);
      t0 = performance.now();
      dur = ms;
      if (ms <= 0) {
        cur = to;
        dur = 0;
      }
      kick();
    },
    setYaw(y) {
      if (dragging) return;
      yaw = y;
      vel = 0;
      introUntil = 0;
      kick();
    },
    resize(w, h) {
      r.setSize(w, h, false);
      frame(st.camera, st.height, w / h);
      kick();
    },
    dispose() {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
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
