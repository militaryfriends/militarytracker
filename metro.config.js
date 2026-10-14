// Expo 기본 Metro 설정.
// firebase 패키지의 react-native 조건부 export 해석을 위해 package exports 를 켠 상태로 유지한다.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { FileStore } = require('metro-cache');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = true;
// 3D 아바타 모델(assets/avatar/*.glb) — scripts/build-avatar-3d.py 가 만든다
config.resolver.assetExts = [...config.resolver.assetExts, 'glb'];
config.resolver.unstable_conditionNames = ['react-native', 'browser', 'require', 'import'];

// 변환 캐시를 이 프로젝트 안에 둔다. 기본값(맥의 임시 폴더)은 모든 프로젝트가 같이 써서,
// 다른 프로젝트가 다른 버전의 react-native-worklets 로 변환해 둔 같은 경로의 파일을 그대로 가져다 쓴다
// → "[Worklets] Mismatch between JavaScript code version and Worklets Babel plugin version" (2026-10-13).
config.cacheStores = [new FileStore({ root: path.join(__dirname, 'node_modules', '.cache', 'metro') })];

module.exports = config;
