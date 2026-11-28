/**
 * 가진 기구 (2026-11-25 클라이언트 요청 — 없는 기구 종목은 자동 루틴에 절대 넣지 않는다).
 *
 * 종목의 eq 는 '이 중 하나만 있으면 된다'(예: 런지 bw/db). 그 밖에 eq 에 없는 받침 기구 두 가지를 따로 본다:
 *  - bar   : 턱걸이바(매달리기) — 풀업 · 친업 · 행잉 레그레이즈 · 인버티드 로우 …
 *  - bench : 벤치(또는 의자 · 단단한 박스) — 덤벨 벤치 · 인클라인 · 벤치딥스 · 불가리안 · 스텝업 …
 * 헬스장은 bar · bench 가 늘 있다고 본다. 프로필에 equip 이 없으면(예전 사용자) 예전 가정 그대로.
 */
import { exById, type Equip, type Place } from './exercises';
import type { UserProfile } from '../types';

/** 가진 것으로 고를 수 있는 기구 — 맨몸(bw)은 늘 있다 */
export type Kit = Exclude<Equip, 'bw'> | 'bar' | 'bench';

/** 헬스장에서 '작은 헬스장이면 빼기' 로 고를 수 있는 것 */
export const GYM_KIT: Kit[] = ['bb', 'db', 'mc', 'cb', 'sm'];
/** 헬스장 기본(일반 헬스장 — 전부 있음) */
export const GYM_FULL: Kit[] = ['bb', 'db', 'mc', 'cb', 'sm', 'plate', 'band', 'bar', 'bench'];
/** 집에서 고르는 것 — 맨몸만이면 빈 배열 */
export const HOME_KIT: Kit[] = ['db', 'band', 'bar', 'bench'];
/** 기구를 묻기 전(예전 사용자)의 홈트 가정 — 예전 템플릿이 전제하던 덤벨 · 밴드 · 턱걸이바 · 벤치 */
const HOME_LEGACY: Kit[] = ['db', 'band', 'bar', 'bench'];

export const KIT_LABEL: Record<Kit, string> = {
  bb: '바벨', db: '덤벨', mc: '머신', cb: '케이블', sm: '스미스', plate: '원판', band: '밴드',
  bar: '턱걸이바', bench: '벤치(또는 의자)',
};

/** eq 밖에서 더 필요한 받침 기구 */
const NEEDS: Record<string, ('bar' | 'bench')[]> = {
  pullup: ['bar'], chinup: ['bar'], negativepullup: ['bar'], assistedpullup: ['bar'],
  hanginglegraise: ['bar'], hangingwiper: ['bar'], invertedrow: ['bar'],
  dbbench: ['bench'], incdbpress: ['bench'], incdbfly: ['bench'], dbfly: ['bench'], incdbcurl: ['bench'],
  inclinereardelt: ['bench'], benchdip: ['bench'], seateddbpress: ['bench'], hipthrust: ['bench'],
  bulgarian: ['bench'], stepup: ['bench'], boxsquat: ['bench'], lyingext: ['bench'], dragonflag: ['bench'],
  declinepushup: ['bench'], inclinepushup: ['bench'], concentrationcurl: ['bench'],
  hangingkneeraise: ['bar'], declinesitup: ['bench'],
};

/** 이 사람이 가진 기구(맨몸 포함) */
export function kitOf(p: Pick<UserProfile, 'env' | 'equip'>): Set<string> {
  const list = Array.isArray(p.equip)
    ? p.env === 'gym'
      // 헬스장: 고른 것(GYM_KIT 중 남긴 것) + 헬스장이면 늘 있는 것
      ? [...p.equip.filter((k): k is Kit => (GYM_KIT as string[]).includes(k)), 'plate', 'band', 'bar', 'bench']
      : p.equip.filter((k): k is Kit => (HOME_KIT as string[]).includes(k))
    : p.env === 'gym' ? GYM_FULL : HOME_LEGACY;
  return new Set<string>(['bw', ...list]);
}

/** 가진 기구로 이 종목을 할 수 있나 */
export function canDo(id: string, kit: Set<string>): boolean {
  const e = exById(id);
  if (!e) return false;
  if (!e.eq.some((q) => kit.has(q))) return false;
  return (NEEDS[id] ?? []).every((k) => kit.has(k));
}

/** 화면에 보여 줄 한 줄 요약 — '일반 헬스장' · '덤벨 · 밴드' · '맨몸만' */
export function kitSummary(p: Pick<UserProfile, 'env' | 'equip'>): string {
  if (!Array.isArray(p.equip)) return p.env === 'gym' ? '일반 헬스장' : '덤벨 · 밴드 · 턱걸이바 · 벤치';
  if (p.env === 'gym') {
    const missing = GYM_KIT.filter((k) => !p.equip!.includes(k));
    return missing.length ? `${missing.map((k) => KIT_LABEL[k]).join(' · ')} 없음` : '일반 헬스장';
  }
  const has = HOME_KIT.filter((k) => p.equip!.includes(k));
  return has.length ? has.map((k) => KIT_LABEL[k]).join(' · ') : '맨몸만';
}

export type { Place };
