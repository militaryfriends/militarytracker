/** 숫자가 이전 값에서 목표까지 올라온다 (요약 통계 · 이번 주 숫자). 동작 줄이기면 바로 목표 값 */
import { useEffect, useRef, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { DURATION } from './motion';

export function useCountUp(target: number, duration: number = DURATION.count): number {
  const reduce = useReducedMotion();
  const [v, setV] = useState(reduce ? target : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduce || !Number.isFinite(target)) {
      from.current = target;
      setV(target);
      return;
    }
    const a = from.current;
    const start = Date.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / duration);
      const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setV(Math.round(a + (target - a) * e));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduce]);
  return v;
}

export function CountUpText({
  value, format = String, style,
}: { value: number; format?: (v: number) => string; style?: StyleProp<TextStyle> }) {
  const v = useCountUp(value);
  return <Text style={style}>{format(v)}</Text>;
}
