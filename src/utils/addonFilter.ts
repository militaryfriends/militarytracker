/**
 * 붙이기 거르기(11/28 검수) — 플랜을 짤 때 쓰는 규칙을 붙이기에도 똑같이 쓴다.
 *  · 내 장소 · 기구로 못 하는 종목은 붙이지 않는다(집 플랜에 케이블 종목 X).
 *  · 허리 부하 종목(LUMBAR)은 하루 1개 — 그날 이미 있으면 붙이지 않는다.
 * 같은 동작 거르기는 utils/planAddons(hasSimilar)가 따로 한다.
 */
import { canDo, kitOf } from '../data/equipment';
import { LUMBAR } from '../data/planTemplates';
import type { UserProfile } from '../types';

export function addonSkip(profile: Pick<UserProfile, 'env' | 'equip'> | null | undefined) {
  const kit = profile ? kitOf(profile) : null;
  return (id: string, dayIds: readonly string[]): boolean => {
    if (kit && !canDo(id, kit)) return true;
    if (LUMBAR.has(id) && dayIds.some((x) => LUMBAR.has(x))) return true;
    return false;
  };
}
