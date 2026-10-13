/**
 * 내 변화 프로젝트 — Firestore 읽기 · 쓰기.
 *
 *  bodyAnalyses  본인이 쓴다(O6 결과, 재분석마다 새 문서). 서버는 여기 계산값을 믿지 않고 input 으로 다시 계산한다.
 *  bodyProjects  서버(projectStart · aiReport)만 쓴다. 앱은 읽기만.
 *  checkins      본인이 쓰고, 판정은 서버(aiReport)가 다시 해서 덮어쓴다.
 *
 * 문서 id 는 stableDocId(uid, createdAt) — 재시도해도 같은 문서를 덮어써 중복이 없다.
 * 쓰기는 withTimeout — 오프라인이면 8초 뒤 queued 로 돌려주고 SDK 큐가 연결되면 올린다.
 */
import {
  collection, doc, getDoc, getDocs, limit as fsLimit, orderBy, query, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { db } from './firebase';
import { SaveTimeout, withTimeout } from './workoutService';
import { stableDocId } from '../utils/merge';
import { stripTracks, type AnalysisCore } from '../utils/bodyAnalysis';
import type { AnalysisDecision, BodyAnalysis, BodyProject, BodyReport, Checkin } from '../types';

/** Firestore 는 undefined 값을 받지 않는다 — 선택 입력(허리 · 인바디)이 비어 있으면 키째 뺀다 */
const clean = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function toAnalysis(uid: string, core: AnalysisCore, createdAt = new Date().toISOString()): BodyAnalysis {
  return clean({
    id: stableDocId(uid, createdAt),
    userId: uid,
    createdAt,
    engineVersion: core.engineVersion,
    input: core.input,
    comp: core.comp,
    coord: core.coord,
    cell: core.cell,
    goal: core.goal,
    gap: core.gap,
    order: core.order,
    track: core.track,
    reachedAt: core.reachedAt,
    projects: stripTracks(core.projects),
    decision: 'pending' as AnalysisDecision,
  });
}

/** 저장 — 서버에 올라갔으면 true, 오프라인 등으로 큐에 남았으면 false (pending 으로 들고 있다가 다시 올린다) */
export async function saveAnalysis(a: BodyAnalysis): Promise<boolean> {
  const { id, pending: _p, ...data } = a;
  try {
    await withTimeout(setDoc(doc(db, 'bodyAnalyses', id), clean(data)));
    return true;
  } catch (e) {
    if (e instanceof SaveTimeout) return false;
    throw e;
  }
}

export async function setAnalysisDecision(id: string, decision: AnalysisDecision): Promise<void> {
  await withTimeout(updateDoc(doc(db, 'bodyAnalyses', id), { decision }));
}

/** 가장 최근 분석 1건 (새 기기 · 재설치) */
export async function fetchLatestAnalysis(uid: string): Promise<BodyAnalysis | null> {
  const snap = await getDocs(query(
    collection(db, 'bodyAnalyses'), where('userId', '==', uid), orderBy('createdAt', 'desc'), fsLimit(1),
  ));
  const d = snap.docs[0];
  return d ? ({ ...(d.data() as Omit<BodyAnalysis, 'id'>), id: d.id }) : null;
}

/** 진행 중(또는 멈춘) 프로젝트 — 가장 최근 시작한 것 */
export async function fetchActiveProject(uid: string): Promise<BodyProject | null> {
  const snap = await getDocs(query(
    collection(db, 'bodyProjects'), where('userId', '==', uid), orderBy('startedAt', 'desc'), fsLimit(3),
  ));
  const hit = snap.docs.find((d) => ['active', 'paused'].includes((d.data() as BodyProject).status));
  return hit ? ({ ...(hit.data() as Omit<BodyProject, 'id'>), id: hit.id }) : null;
}

export async function fetchCheckins(uid: string, projectId: string): Promise<Checkin[]> {
  const snap = await getDocs(query(
    collection(db, 'checkins'), where('userId', '==', uid), orderBy('createdAt', 'desc'), fsLimit(24),
  ));
  return snap.docs
    .map((d) => ({ ...(d.data() as Omit<Checkin, 'id'>), id: d.id }))
    .filter((c) => c.projectId === projectId);
}

/**
 * 체크인 저장 — 판정(aiReport)은 서버에 올라간 문서로 하므로 큐에 남기지 않고 실패를 던진다.
 * merge: 같은 체크인을 다시 올려도 서버가 붙인 reportId 는 건드리지 않는다(규칙이 막는다).
 */
export async function saveCheckin(c: Checkin): Promise<void> {
  const { id, reportId: _r, ...data } = c;
  await withTimeout(setDoc(doc(db, 'checkins', id), clean(data), { merge: true }));
}

/** 체크인 리포트 1건 (서버가 쓴 문서 — 본인 읽기만) */
export async function fetchReport(reportId: string): Promise<BodyReport | null> {
  const snap = await getDoc(doc(db, 'bodyReports', reportId));
  return snap.exists() ? ({ ...(snap.data() as Omit<BodyReport, 'id'>), id: snap.id }) : null;
}
