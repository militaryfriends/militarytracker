/**
 * three.js 묶음 — engine.web.ts 가 처음 3D 를 그릴 때 한 번에 불러온다(별도 청크).
 * three 를 여기서만 정적으로 가져와야 메인 번들 · 공통 청크에 안 섞인다(웹 첫 로딩이 무거워지지 않게).
 */
import * as T from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export { T, GLTFLoader, MeshoptDecoder };
