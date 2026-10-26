/**
 * 3D 아바타 장면 — 웹(engine.web.ts) · 앱(engine.native.ts)이 같이 쓴다. 조명 · 카메라 · 재질 · 모프 적용이 한 벌이라
 * 두 플랫폼의 몸이 똑같이 보인다. three 는 인자로 받는다(여기서 import 하면 웹 메인 번들에 three 가 섞인다).
 */
import type * as THREE_NS from 'three';
import type { Morph, MorphKey } from './morph';

export type THREE = typeof THREE_NS;

/** 광고 렌더(Blender)와 맞춘 클레이 회색 — 조명이 어두운 스튜디오라 예전(#B9B9BB)보다 한 톤 아래 */
export const BODY_COLOR = '#A3A6A8';
/** 옷 텍스처가 없을 때만 쓰는 색 */
export const CLOTH_COLOR = '#2E3033';
/** 화면 높이 대비 몸 높이 — 발 아래 · 머리 위 여백 */
const FRAME = 1.07;
const FOV = 24;

export interface Loaded { T: THREE; scene: THREE_NS.Object3D; height: number }

/** 모델과 같이 구운 텍스처 (scripts/build-avatar-3d.py --hq · build-avatar-female.py --tex) — 없으면 색만 */
export interface ModelTex {
  /** 몸 노멀맵 — 고해상도 조각(복근 · 혈관 결)을 가벼운 메시에 입힌다 */
  normal?: THREE_NS.Texture | null;
  /** 몸 AO — 옷 아래 · 겨드랑이 · 사타구니 그늘 */
  ao?: THREE_NS.Texture | null;
  /** 옷 색(위장무늬) */
  cloth?: THREE_NS.Texture | null;
}

export interface Stage {
  scene: THREE_NS.Scene;
  camera: THREE_NS.PerspectiveCamera;
  pivot: THREE_NS.Group;
  meshes: THREE_NS.Mesh[];
  height: number;
  /** 이 뷰어의 몸 재질(복사본) — 모프에 따라 노멀맵 세기를 바꾼다 */
  bodyMats: THREE_NS.MeshStandardMaterial[];
}

const isCloth = (mesh: THREE_NS.Mesh) => /cloth/i.test(mesh.name) || /cloth/i.test(mesh.geometry.name);

/** 불러온 glTF 장면에 재질을 입히고 키를 잰다 (성별마다 한 번) */
export function prepareModel(T: THREE, scene: THREE_NS.Object3D, tex: ModelTex = {}): Loaded {
  const body = new T.MeshStandardMaterial({ color: BODY_COLOR, roughness: 0.5, metalness: 0 });
  if (tex.normal) body.normalMap = tex.normal;
  if (tex.ao) {
    body.aoMap = tex.ao;
    body.aoMapIntensity = 1;
  }
  const cloth = new T.MeshStandardMaterial({
    color: tex.cloth ? '#FFFFFF' : CLOTH_COLOR, map: tex.cloth ?? null, roughness: 0.92, metalness: 0,
  });
  scene.traverse((o) => {
    const mesh = o as THREE_NS.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = isCloth(mesh) ? cloth : body;
    mesh.frustumCulled = false; // 모프로 커진 몸이 잘리지 않게
  });
  const box = new T.Box3().setFromObject(scene);
  return { T, scene, height: box.max.y - box.min.y };
}

/** 텍스처 공통 설정 — glTF UV(위가 0)라 뒤집지 않는다 */
export function texSetup(T: THREE, t: THREE_NS.Texture, color: boolean): THREE_NS.Texture {
  t.flipY = false;
  t.colorSpace = color ? T.SRGBColorSpace : T.NoColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

export function buildStage(m: Loaded, aspect: number): Stage {
  const { T } = m;
  const scene = new T.Scene();
  // 광고 렌더와 맞춘 스튜디오 조명: 위에서 내리는 스폿(가슴 · 배에 빛, 다리로 갈수록 어두워짐) + 뒤 테두리 빛 둘.
  // 환경맵(HDR)은 쓰지 않는다 — 앱(expo-gl)에서 PMREM 렌더 타깃이 기기마다 안 될 수 있다. 위치는 키(h) 비례.
  const h = m.height;
  scene.add(new T.HemisphereLight(0xffffff, 0x202024, 0.5));
  const spot = new T.SpotLight(0xffffff, 3, 0, 0.55, 0.8, 0);
  spot.position.set(-0.2 * h, 2.1 * h, 1.3 * h);
  spot.target.position.set(0, 0.675 * h, 0);
  const key = new T.DirectionalLight(0xffffff, 0.3);
  key.position.set(-1.5, 3, 3);
  const fill = new T.DirectionalLight(0xffffff, 0.25);
  fill.position.set(2.5, 1.0, 2.0);
  const rim = new T.DirectionalLight(0xffffff, 1.6);
  rim.position.set(0.8, 2.6, -4);
  const rim2 = new T.DirectionalLight(0xffffff, 1.0);
  rim2.position.set(-1.2, 2.0, -3);
  scene.add(spot, spot.target, key, fill, rim, rim2);
  const pivot = new T.Group();
  const model = m.scene.clone(true);
  const meshes: THREE_NS.Mesh[] = [];
  const bodyMats: THREE_NS.MeshStandardMaterial[] = [];
  model.traverse((o) => {
    const mesh = o as THREE_NS.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.morphTargetInfluences) meshes.push(mesh);
    // 몸 재질은 뷰어마다 따로 — 노멀맵 세기를 이 뷰어의 몸에 맞춰 바꾼다
    if (!isCloth(mesh) && (mesh.material as THREE_NS.MeshStandardMaterial).normalMap) {
      const mat = (mesh.material as THREE_NS.MeshStandardMaterial).clone();
      mesh.material = mat;
      bodyMats.push(mat);
    }
  });
  pivot.add(model);
  scene.add(pivot);
  const camera = new T.PerspectiveCamera(FOV, aspect, 0.1, 50);
  frame(camera, m.height, aspect);
  return { scene, camera, pivot, meshes, height: m.height, bodyMats };
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
  // 노멀맵은 기본 몸(복근 선명)의 결이다 — 살이 붙거나 근육이 줄면 결이 묻히게 약하게
  const ns = Math.min(1, Math.max(0.08, 1 - 0.9 * mo.fat_up - 0.6 * mo.mus_down));
  for (const mat of st.bodyMats) mat.normalScale.set(ns, ns);
}

/** 렌더러 공통 설정 — 투명 배경 · sRGB · 하이라이트가 하얗게 날아가지 않게 */
export function styleRenderer(T: THREE, r: THREE_NS.WebGLRenderer) {
  r.setClearColor(0x000000, 0);
  r.outputColorSpace = T.SRGBColorSpace;
  r.toneMapping = T.NeutralToneMapping;
  r.toneMappingExposure = 0.75;
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
