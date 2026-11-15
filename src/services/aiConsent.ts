/**
 * AI 기능 데이터 전송 동의 (Apple 5.1.2(i) — 외부 AI 로 개인 데이터를 보내기 전 명시적 동의).
 * AI 플랜 · 식단 · 코치 · 체크인 리포트를 처음 쓰는 순간 한 번 묻고, 계정별로 이 기기에 기억한다.
 * 거절하면 AI 를 부르지 않는다(플랜 · 식단은 기본 구성, 체크인은 템플릿 리포트, 코치는 안내 문장).
 * 거절은 기억하지 않는다 — 같은 흐름에서 거듭 묻지 않도록 1분만 기억하고, 그 뒤에 AI 를 다시 쓰면 또 묻는다.
 * 문구 · 전송 항목은 개인정보처리방침 3절(Anthropic 위탁)과 맞춘다.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from './firebase';
import { showAlert } from '../utils/alert';

const KEY = (uid: string) => `mt-ai-consent:${uid}`;
const memo = new Map<string, boolean>();
let declinedAt = 0;
let pending: Promise<boolean> | null = null;

export const AI_CONSENT_TEXT =
  'AI 플랜 · 식단 · 코치 · 체크인 리포트를 만들 때 아래 정보가 Anthropic(미국, AI 서비스 제공사)으로 전송됩니다.\n\n' +
  '· 성별 · 나이 · 키 · 체중 · 체지방(추정) · 목표\n' +
  '· 운동 기록 요약 · 식사 환경 · 알레르기\n' +
  '· 코치에게 보낸 질문과 대화\n\n' +
  '이메일 · 닉네임은 보내지 않으며, 전송된 정보는 답을 만드는 데에만 쓰입니다. 동의하지 않으면 AI 없이 기본 구성으로 이용할 수 있습니다.';

/** 이미 동의했는지(묻지 않고) */
export async function hasAiConsent(): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid) return false;
  if (memo.has(uid)) return memo.get(uid)!;
  const v = (await AsyncStorage.getItem(KEY(uid)).catch(() => null)) === 'yes';
  if (v) memo.set(uid, true);
  return v;
}

/** 동의했으면 true. 아직이면 안내를 띄우고 답을 기다린다 */
export async function askAiConsent(): Promise<boolean> {
  if (await hasAiConsent()) return true;
  if (Date.now() - declinedAt < 60_000) return false;
  if (pending) return pending;
  const uid = auth.currentUser?.uid;
  if (!uid) return false;
  pending = new Promise<boolean>((resolve) => {
    showAlert('AI 기능 데이터 전송 동의', AI_CONSENT_TEXT, [
      { text: '동의하지 않음', style: 'cancel', onPress: () => { declinedAt = Date.now(); resolve(false); } },
      {
        text: '동의',
        onPress: () => {
          memo.set(uid, true);
          AsyncStorage.setItem(KEY(uid), 'yes').catch(() => {});
          resolve(true);
        },
      },
    ]);
  }).finally(() => { pending = null; });
  return pending;
}

/** 동의 철회 — MY › AI 데이터 전송 동의 */
export async function revokeAiConsent(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  memo.set(uid, false);
  await AsyncStorage.removeItem(KEY(uid)).catch(() => {});
  memo.delete(uid);
}
