/**
 * 3D 아바타 (iOS · Android) — 아직 네이티브 3D(expo-gl) 를 연결하지 않아 2D(fallback)를 그대로 그린다.
 * 웹은 Avatar3D.web.tsx. 두 파일의 내보내기 모양은 같아야 한다.
 */
import type { ReactNode } from 'react';
import type { Coord, Sex } from '../../../utils/bodyComp';

export const has3D = (_sex: Sex) => false;

export function Avatar3DStill({ fallback }: { sex: Sex; coord: Coord; width: number; height: number; fallback: ReactNode }) {
  return <>{fallback}</>;
}

export function Avatar3DLive({ fallback }: {
  sex: Sex; coord: Coord; width: number; height: number; morphMs?: number; yawGroup?: string; intro?: boolean; fallback: ReactNode;
}) {
  return <>{fallback}</>;
}
