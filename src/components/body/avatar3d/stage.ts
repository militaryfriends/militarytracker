/**
 * 3D 아바타 장면 — 웹(engine.web.ts) · 앱(engine.native.ts)이 같이 쓴다. 조명 · 카메라 · 재질 · 모프 적용이 한 벌이라
 * 두 플랫폼의 몸이 똑같이 보인다. three 는 인자로 받는다(여기서 import 하면 웹 메인 번들에 three 가 섞인다).
 */
import type * as THREE_NS from 'three';
import type { Morph, MorphKey } from './morph';

export type THREE = typeof THREE_NS;

export const BODY_COLOR = '#B9B9BB';
export const CLOTH_COLOR = '#7C7C80';
/** 화면 높이 대비 몸 높이 — 발 아래 · 머리 위 여백 */
const FRAME = 1.07;
const FOV = 24;

export interface Loaded { T: THREE; scene: THREE_NS.Object3D; height: number }

export interface Stage {
  scene: THREE_NS.Scene;
  camera: THREE_NS.PerspectiveCamera;
  pivot: THREE_NS.Group;
  meshes: THREE_NS.Mesh[];
  height: number;
}

/** 불러온 glTF 장면에 재질을 입히고 키를 잰다 (성별마다 한 번) */
export function prepareModel(T: THREE, scene: THREE_NS.Object3D): Loaded {
  const body = new T.MeshStandardMaterial({ color: BODY_COLOR, roughness: 0.72, metalness: 0 });
  const cloth = new T.MeshStandardMaterial({ color: CLOTH_COLOR, roughness: 0.9, metalness: 0 });
  scene.traverse((o) => {
    const mesh = o as THREE_NS.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = /cloth/i.test(mesh.name) || /cloth/i.test(mesh.geometry.name) ? cloth : body;
    mesh.frustumCulled = false; // 모프로 커진 몸이 잘리지 않게
  });
  const box = new T.Box3().setFromObject(scene);
  return { T, scene, height: box.max.y - box.min.y };
}

export function buildStage(m: Loaded, aspect: number): Stage {
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
  const meshes: THREE_NS.Mesh[] = [];
  model.traverse((o) => {
    const mesh = o as THREE_NS.Mesh;
    if (mesh.isMesh && mesh.morphTargetInfluences) meshes.push(mesh);
  });
  pivot.add(model);
  scene.add(pivot);
  const camera = new T.PerspectiveCamera(FOV, aspect, 0.1, 50);
  frame(camera, m.height, aspect);
  return { scene, camera, pivot, meshes, height: m.height };
}

export function frame(camera: THREE_NS.PerspectiveCamera, h: number, aspect: number) {
  const half = (FOV / 2) * (Math.PI / 180);
  // 세로 기준으로 맞추되, 화면이 아주 좁으면 가로(팔 너비)도 들어가게
  const byH = (h * FRAME) / 2 / Math.tan(half);
  const byW = (h * 0.5) / 2 / Math.tan(half) / Math.max(0.1, aspect);
  const d = Math.max(byH, byW);
  camera.aspect = aspect;
  camera.position.set(0, h / 2, d);
  camera.lookAt(0, h / 2, 0);
  camera.updateProjectionMatrix();
}

export function applyMorph(st: Stage, mo: Morph) {
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

/** 렌더러 공통 설정 — 투명 배경 · sRGB · 하이라이트가 하얗게 날아가지 않게 */
export function styleRenderer(T: THREE, r: THREE_NS.WebGLRenderer) {
  r.setClearColor(0x000000, 0);
  r.outputColorSpace = T.SRGBColorSpace;
  r.toneMapping = T.NeutralToneMapping;
  r.toneMappingExposure = 1.05;
}

export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const mixMorph = (a: Morph, b: Morph, e: number): Morph => ({
  fat_up: a.fat_up + (b.fat_up - a.fat_up) * e,
  fat_down: a.fat_down + (b.fat_down - a.fat_down) * e,
  mus_up: a.mus_up + (b.mus_up - a.mus_up) * e,
  mus_down: a.mus_down + (b.mus_down - a.mus_down) * e,
});

/** 처음 나타날 때 살짝 돌며 들어오는 각도 · 시간 */
export const INTRO_FROM = -0.55;
export const INTRO_MS = 1400;
/** 손가락 1px 당 회전(라디안) */
export const DRAG_RAD = 0.012;

// 같은 그룹의 뷰어는 같이 돈다 (비교 화면의 지금 · 목표)
const groups = new Map<string, Set<(y: number, from: object) => void>>();
export function joinYawGroup(name: string | undefined, me: object, onYaw: (y: number) => void) {
  if (!name) return { emit: (_y: number) => {}, leave: () => {} };
  const fn = (y: number, from: object) => {
    if (from !== me) onYaw(y);
  };
  if (!groups.has(name)) groups.set(name, new Set());
  groups.get(name)!.add(fn);
  return {
    emit: (y: number) => groups.get(name)?.forEach((f) => f(y, me)),
    leave: () => groups.get(name)?.delete(fn),
  };
}

// ─── 움직임(모프 전환 · 처음 회전 · 손가락 회전 · 관성) — 웹 · 앱 공통 ─────────────

export interface Driver {
  /** 좌표가 바뀌면 ms 동안 몸이 변한다 (0 이면 바로) */
  setMorph(to: Morph, ms: number): void;
  setYaw(y: number): void;
  grab(): void;
  /** 손가락이 dx px 움직였다 */
  drag(dx: number): void;
  release(): void;
  kick(): void;
  dispose(): void;
}

/** draw 는 매 프레임 그린 뒤 호출된다(앱은 gl.endFrameEXP). 바쁠 때만 프레임을 돌린다 — 가만히 있으면 배터리를 쓰지 않는다 */
export function makeDriver(st: Stage, start: Morph, opts: {
  draw: () => void; yaw?: number; intro?: boolean; onYaw?: (y: number) => void;
}): Driver {
  let cur = start;
  let from = start;
  let to = start;
  let t0 = 0;
  let dur = 0;
  let yaw = opts.yaw ?? 0;
  let vel = 0;
  let dragging = false;
  let raf = 0;
  let dead = false;
  let introUntil = opts.intro ? Date.now() + INTRO_MS : 0;

  const frameFn = () => {
    raf = 0;
    if (dead) return;
    const now = Date.now();
    let busy = false;
    if (dur > 0) {
      const k = Math.min(1, (now - t0) / dur);
      cur = mixMorph(from, to, ease(k));
      if (k >= 1) dur = 0;
      else busy = true;
    }
    if (introUntil) {
      const k = 1 - Math.max(0, (introUntil - now) / INTRO_MS);
      st.pivot.rotation.y = INTRO_FROM + (yaw - INTRO_FROM) * ease(k);
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
    opts.draw();
    if (busy || dragging) raf = requestAnimationFrame(frameFn);
  };
  const kick = () => {
    if (!raf && !dead) raf = requestAnimationFrame(frameFn);
  };
  return {
    setMorph(next, ms) {
      from = cur;
      to = next;
      t0 = Date.now();
      dur = ms;
      if (ms <= 0) {
        cur = next;
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
    grab() {
      dragging = true;
      vel = 0;
      if (introUntil) {
        yaw = st.pivot.rotation.y;
        introUntil = 0;
      }
      kick();
    },
    drag(dx) {
      yaw += dx * DRAG_RAD;
      vel = dx * DRAG_RAD;
      opts.onYaw?.(yaw);
      kick();
    },
    release() {
      dragging = false;
      kick();
    },
    kick,
    dispose() {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
    },
  };
}
