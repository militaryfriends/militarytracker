import { initializeApp, getApps, getApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import { getFirestore, initializeFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Auth } from 'firebase/auth';
import { FIREBASE_PUBLIC_CONFIG } from '../config/firebasePublic';

// .env 의 EXPO_PUBLIC_FIREBASE_* 가 있으면 우선, 없으면 커밋된 공개 설정.
// (.env 는 gitignore 라 EAS 빌드에는 실리지 않는다 — firebasePublic.ts 주석 참조)
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || FIREBASE_PUBLIC_CONFIG.apiKey,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || FIREBASE_PUBLIC_CONFIG.authDomain,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || FIREBASE_PUBLIC_CONFIG.projectId,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || FIREBASE_PUBLIC_CONFIG.storageBucket,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || FIREBASE_PUBLIC_CONFIG.messagingSenderId,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || FIREBASE_PUBLIC_CONFIG.appId,
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  // 빌드 설정 사고를 첫 화면에서 바로 드러낸다 — 조용히 로그인 실패로 보이면 안 된다
  throw new Error('[firebase] 설정이 비어 있습니다. src/config/firebasePublic.ts 를 확인하세요.');
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

/**
 * React Native 에서는 기본 getAuth() 가 메모리 persistence 로 동작해
 * 앱을 껐다 켜면 로그인이 풀린다. AsyncStorage persistence 로 초기화한다.
 * (getReactNativePersistence 는 RN 전용 export 라 웹 타입 정의에 노출되지 않음)
 */
function createAuth(): Auth {
  const rnPersistence = (FirebaseAuth as unknown as {
    getReactNativePersistence?: (storage: unknown) => unknown;
  }).getReactNativePersistence;

  if (rnPersistence) {
    try {
      return FirebaseAuth.initializeAuth(app, {
        persistence: rnPersistence(AsyncStorage) as never,
      });
    } catch {
      // Fast Refresh 등으로 이미 초기화된 경우
      return FirebaseAuth.getAuth(app);
    }
  }
  return FirebaseAuth.getAuth(app);
}

/**
 * ignoreUndefinedProperties — 선택 필드가 undefined 로 남아도 쓰기가 통째로 거절되지 않게(smiscamp 와 같은 설정).
 * RN 에서는 Firestore 의 기기 저장 캐시(IndexedDB)가 없어 메모리 캐시뿐이다 — 재시작 뒤 화면은
 * appStore(persist)의 캐시가 채우고, 서버에서는 바뀐 것만 받는다 (src/services/session.ts).
 */
function createDb(): Firestore {
  try {
    return initializeFirestore(app, { ignoreUndefinedProperties: true });
  } catch {
    // Fast Refresh 등으로 이미 초기화된 경우
    return getFirestore(app);
  }
}

export const auth = createAuth();
export const db = createDb();
/** Cloud Functions — AI 프록시가 배포된 서울 리전 */
export const functions = getFunctions(app, 'asia-northeast3');
export default app;
