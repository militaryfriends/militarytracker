/**
 * AI 코치 답변 신고 (Google Play 생성형 AI 정책 — 앱 안에서 불쾌 · 위험한 AI 답을 신고할 수 있어야 한다).
 * aiReports 컬렉션에 본인 uid · 답 · 바로 앞 질문 · 이유만 남긴다(관리자만 읽음, 계정 삭제 때 함께 삭제).
 */
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { withTimeout } from './workoutService';
import { stableDocId } from '../utils/merge';

export const REPORT_REASONS = ['부적절하거나 불쾌함', '위험하거나 건강에 해로움', '사실과 다름'] as const;

export async function reportAiReply(reply: string, question: string, reason: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('로그인이 필요합니다.');
  const createdAt = new Date().toISOString();
  await withTimeout(setDoc(doc(db, 'aiReports', stableDocId(uid, createdAt)), {
    userId: uid,
    reply: reply.slice(0, 4000),
    question: question.slice(0, 1000),
    reason: reason.slice(0, 40),
    createdAt,
  }));
}
