/**
 * 탭 아이콘 한 세트 — 24 격자, 선 굵기 하나(꺼짐 1.6 · 켜짐 2), 둥근 끝.
 * 기본 아이콘 묶음(Ionicons) 대신 직접 그린다: 다섯 개가 같은 굵기 · 같은 모서리라 한 벌로 보인다.
 * 켜진 탭은 채우지 않고 선만 굵어진다(꽉 찬 아이콘은 무겁고 싸 보인다).
 * react-native-svg 는 이미 앱에 들어 있어 새 네이티브 빌드가 필요 없다.
 */
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type TabIconName = 'home' | 'plan' | 'coach' | 'diet' | 'my';

export function TabGlyph({ name, color, on, size = 22 }: { name: TabIconName; color: string; on: boolean; size?: number }) {
  const p = { stroke: color, strokeWidth: on ? 2 : 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'home' ? (
        // 오늘 — 달력 한 장 + 오늘 점
        <>
          <Rect x={4} y={5.5} width={16} height={14.5} rx={3.5} {...p} />
          <Path d="M4 10h16M8.5 3.5v3.5M15.5 3.5v3.5" {...p} />
          <Circle cx={12} cy={15} r={1.6} fill={color} />
        </>
      ) : name === 'plan' ? (
        // 운동 — 덤벨
        <>
          <Rect x={2.5} y={9} width={3} height={6} rx={1.2} {...p} />
          <Rect x={18.5} y={9} width={3} height={6} rx={1.2} {...p} />
          <Rect x={5.5} y={7} width={3} height={10} rx={1.2} {...p} />
          <Rect x={15.5} y={7} width={3} height={10} rx={1.2} {...p} />
          <Path d="M8.5 12h7" {...p} />
        </>
      ) : name === 'coach' ? (
        // 코치 — 말칸 + 두 줄
        <>
          <Path d="M5.5 4.5h13a2.5 2.5 0 0 1 2.5 2.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3v-3H5.5A2.5 2.5 0 0 1 3 15V7a2.5 2.5 0 0 1 2.5-2.5Z" {...p} />
          <Path d="M7.5 9.5h9M7.5 13h5.5" {...p} />
        </>
      ) : name === 'diet' ? (
        // 식단 — 그릇
        <>
          <Path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0Z" {...p} />
          <Path d="M9 20h6M9 8c0-1.2 1-1.5 1-3M13.5 8c0-1.2 1-1.5 1-3" {...p} />
        </>
      ) : (
        // 내 몸 — 얼굴 없는 아바타 상반신
        <>
          <Circle cx={12} cy={6.5} r={3} {...p} />
          <Path d="M5 20.5v-3.2C5 14.4 7.2 12 10 12h4c2.8 0 5 2.4 5 5.3v3.2" {...p} />
        </>
      )}
    </Svg>
  );
}
