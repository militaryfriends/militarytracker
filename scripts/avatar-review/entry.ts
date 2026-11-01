import * as T from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { prepareModel, buildStage, applyMorph, styleRenderer, texSetup } from '../../src/components/body/avatar3d/stage';
import { morphFor } from '../../src/components/body/avatar3d/morph';
(async () => {
  const q = new URLSearchParams(location.search);
  const sex = (q.get('sex') || 'male') as 'male' | 'female';
  const p = sex === 'male' ? 'm' : 'f';
  const W = +(q.get('w') || 540), H = +(q.get('h') || 960);
  const r = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
  r.setSize(W, H); r.setPixelRatio(1); document.body.style.background = "transparent"; document.body.appendChild(r.domElement);
  styleRenderer(T as any, r, q.get('light') === '1'); r.setClearColor(q.get('light') === '1' ? 0xf4f4f5 : 0x0b0b0c, q.get('bg') === 'none' ? 0 : 1);
  const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder as any);
  const tl = new T.TextureLoader();
  const tx = (f: string | null, c: boolean) => f ? tl.loadAsync(f).then((t) => texSetup(T as any, t, c)).catch(() => null) : Promise.resolve(null);
  const [g, normal, ao, cloth] = await Promise.all([l.loadAsync(`avatar_${p}.glb`), tx(sex === 'male' ? 'm_body_n.jpg' : null, false), tx(`${p}_body_ao.jpg`, false), tx(`${p}_cloth.jpg`, true)]);
  const m = prepareModel(T as any, g.scene, { normal, ao, cloth });
  const st = buildStage(m, W / H);
  const c = { f: +(q.get('f') || 0) || (sex === 'male' ? 1.6 : 2), m: +(q.get('m') || 0) || (sex === 'male' ? 4 : 3) };
  applyMorph(st, morphFor(sex, c));
  st.pivot.rotation.y = q.get('yaw') === null ? 0.4 : +q.get('yaw')!;
  if (q.get('head')) { const h = st.height; st.camera.position.set(0, h * 0.86, h * 0.9); st.camera.lookAt(0, h * 0.86, 0); st.camera.updateProjectionMatrix(); }
  r.render(st.scene, st.camera);
  (window as any).done = true;
})();
