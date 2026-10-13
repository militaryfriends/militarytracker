/**
 * 회색 실루엣 — 프리셋 아바타(50장)가 아직 없는 칸을 대신 그린다(명세 9장: 화면 작업은 실루엣 자리표시로 먼저).
 *
 * 체지방(f)·근육(m) 연속 좌표(1~5)로 몸통 · 팔 · 다리 폭만 바꾼다. 키 · 발 위치 · 머리 위 여백은 모든 칸이 같다
 * (프리셋 렌더 규칙과 같다 — 체형만 비교). 오른쪽(체지방↑)으로 갈수록 무조건 더 뚱뚱해 보이고,
 * 위(근육↑)로 갈수록 무조건 더 근육질로 보이게(단조성) 폭을 단조 증가로 잡았다.
 * viewBox 200×300 (프리셋 1080×1620 과 같은 2:3).
 */
import { memo } from 'react';
import Svg, { Ellipse, Path } from 'react-native-svg';
import { colors, useThemeMode } from '../../theme';
import type { Sex } from '../../utils/bodyComp';
import { silhouetteShapes } from './silhouetteShapes';

export const Silhouette = memo(function Silhouette({ sex, f, m, width, height }: {
  sex: Sex; f: number; m: number; width: number; height: number;
}) {
  useThemeMode();
  const s = silhouetteShapes(sex, f, m);
  const body = colors.clay;
  return (
    <Svg width={width} height={height} viewBox="0 0 200 300">
      <Ellipse cx={100} cy={27} rx={s.headRx} ry={18.5} fill={body} />
      <Path d={s.armL} fill={body} />
      <Path d={s.armR} fill={body} />
      <Path d={s.legL} fill={body} />
      <Path d={s.legR} fill={body} />
      <Path d={s.torso} fill={body} />
      <Path d={s.shorts} fill={colors.clayShade} />
      {s.bra ? <Path d={s.bra} fill={colors.clayShade} /> : null}
    </Svg>
  );
});
