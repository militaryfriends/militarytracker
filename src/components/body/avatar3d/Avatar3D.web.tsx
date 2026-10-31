/**
 * 3D 아바타 (웹) — 정지 이미지(Still)와 손으로 돌리는 뷰어(Live).
 * 모델이 없는 성별 · WebGL 이 안 되는 브라우저 · 불러오기 실패 → fallback(2D 실루엣)을 그대로 보여 준다.
 * 네이티브는 Avatar3D.tsx (지금은 항상 fallback — expo-gl 연결 전).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { Coord, Sex } from '../../../utils/bodyComp';
import { coordKey } from './morph';
import { cachedSnapshot, mountViewer, snapshot, supports3D, type Viewer } from './engine.web';
import { joinYawGroup } from './stage';

export const has3D = (sex: Sex) => supports3D(sex);
/** 앱 전용 진단(Avatar3D.tsx) — 웹은 없음 */
export const avatar3DError = (): string | null => null;

export function Avatar3DStill({ sex, coord, width, height, fallback }: {
  sex: Sex; coord: Coord;
  /** 앱에서만 씀(이 좌표에서 coord 로 변해 감) — 웹은 AvatarView 의 크로스페이드가 대신한다 */
  from?: Coord;
  width: number; height: number; fallback: ReactNode;
}) {
  const w = Math.round(width);
  const h = Math.round(height);
  const key = `${sex}|${coordKey(coord)}|${w}x${h}`;
  const [url, setUrl] = useState<string | undefined>(() => cachedSnapshot(key));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const hit = cachedSnapshot(key);
    if (hit) {
      setUrl(hit);
      return;
    }
    setUrl(undefined);
    snapshot(sex, coord, w, h, key)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
    // key 가 좌표 · 크기를 다 담는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (failed) return <>{fallback}</>;
  if (!url) return <View style={{ width: w, height: h, opacity: 0.35 }}>{fallback}</View>;
  return (
    <Animated.View entering={FadeIn.duration(220)}>
      <Image source={{ uri: url }} style={{ width: w, height: h }} resizeMode="contain" accessibilityIgnoresInvertColors />
    </Animated.View>
  );
}

export function Avatar3DLive({ sex, coord, width, height, morphMs = 700, yawGroup, intro = false, fallback }: {
  sex: Sex; coord: Coord; width: number; height: number;
  /** 좌표가 바뀌면 이 시간 동안 몸이 변한다 */
  morphMs?: number;
  yawGroup?: string;
  /** 처음 나타날 때 살짝 돌며 들어온다(돌려 볼 수 있다는 힌트) */
  intro?: boolean;
  fallback: ReactNode;
}) {
  const host = useRef<View>(null);
  const viewer = useRef<Viewer | null>(null);
  const coordRef = useRef(coord);
  coordRef.current = coord;
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const w = Math.round(width);
  const h = Math.round(height);

  useEffect(() => {
    let alive = true;
    const el = host.current as unknown as HTMLElement | null;
    if (!el) return;
    const group = joinYawGroup(yawGroup, {}, (y) => viewer.current?.setYaw(y));
    mountViewer(el, { sex, coord: coordRef.current, w, h, intro, onYaw: group.emit })
      .then((v) => {
        if (!alive) return v.dispose();
        viewer.current = v;
        v.setCoord(coordRef.current, 0);
        setState('ready');
      })
      .catch(() => alive && setState('failed'));
    return () => {
      alive = false;
      group.leave();
      viewer.current?.dispose();
      viewer.current = null;
    };
    // 성별이 바뀔 때만 새로 만든다 — 좌표 · 크기는 아래에서 바꾼다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sex]);

  useEffect(() => {
    viewer.current?.setCoord(coord, morphMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coord.f, coord.m]);

  useEffect(() => {
    viewer.current?.resize(w, h);
  }, [w, h]);

  return (
    <View style={{ width: w, height: h }}>
      {state !== 'ready' ? <View style={[StyleSheet.absoluteFill, state === 'loading' && { opacity: 0.35 }]}>{fallback}</View> : null}
      {state !== 'failed' ? <View ref={host} style={StyleSheet.absoluteFill} /> : null}
    </View>
  );
}
