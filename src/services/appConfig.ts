/**
 * 앱 설정 문서 appConfig/main (밀리터리트래커 Firebase military-tracker-96bdd — SMIS CAMP 의 appConfig 와 다른 프로젝트 · 다른 문서).
 * 지금은 '필수 코드푸시 시각' 하나만 둔다. 누구나 읽고, 관리자만 쓴다(firestore.rules).
 */
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { withTimeout } from './workoutService';

export const APP_CONFIG_PATH = ['appConfig', 'main'] as const;

/**
 * 방금 올린 코드푸시를 모두에게 바로 적용 (관리자) — otaRequiredAfter 를 지금으로.
 * 앱(OtaUpdater)은 이 시각보다 오래된 코드로 돌고 있으면 새 코드푸시를 받아 저절로 다시 켠다.
 */
export async function requireLatestOtaNow(uid: string): Promise<void> {
  await withTimeout(setDoc(doc(db, ...APP_CONFIG_PATH), {
    otaRequiredAfter: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  }, { merge: true }));
}
