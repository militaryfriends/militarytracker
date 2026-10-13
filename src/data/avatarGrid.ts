// 자동 생성 — 손으로 고치지 말 것. node scripts/avatar-grid.mjs (scripts/AVATARS.md)
import type { ImageSourcePropType } from 'react-native';

export type AvatarSex = 'male' | 'female';

/** 칸 → 프리셋 이미지. 비어 있는 칸은 화면이 실루엣으로 대신 그린다. 이 파일은 scripts/avatar-grid.mjs 가 만든다 */
export const AVATARS: Record<AvatarSex, Partial<Record<string, ImageSourcePropType>>> = {
  male: {},
  female: {},
};

export const AVATAR_COUNT = 0;
