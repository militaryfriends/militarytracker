/**
 * 3D 아바타 (iOS · Android) — expo-gl GLView 위에 three.js. 웹은 Avatar3D.web.tsx (두 파일의 내보내기 모양은 같다).
 *  · Still: 손으로 돌리지 않는 아바타. 한 번 그리고 멈췄다가 좌표가 바뀌면 그 몸으로 서서히 변한다.
 *  · Live: 좌우로 밀어 돌리기(세로로 밀면 화면 스크롤) · 관성 · 같은 그룹끼리 같이 돌기.
 *  · GL 이 안 되거나(expo-gl 이 없는 옛 빌드 포함) 그리다 오류가 나면 fallback(2D)으로 — 그 뒤로는 계속 2D.
 */
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import type { ExpoWebGLRenderingContext, GLView as GLViewType } from 'expo-gl';
import type { Coord, Sex } from '../../../utils/bodyComp';
import { attach, markBroken, native3D, type NativeView } from './engine.native';
import { joinYawGroup } from './stage';

let GLView: typeof GLViewType | null = null;
try {
  GLView = (require('expo-gl') as typeof import('expo-gl')).GLView;
} catch (e) {
  markBroken(e);
}

export const has3D = (sex: Sex) => !!GLView && native3D(sex);

class Guard extends Component<{ fallback: ReactNode; children: ReactNode }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() {
    return { err: true };
  }
  componentDidCatch(e: unknown) {
    markBroken(e);
  }
  render() {
    return this.state.err ? this.props.fallback : this.props.children;
  }
}

function GLBody({
  sex, coord, from, width, height, morphMs, yawGroup, intro, interactive, fallback,
}: {
  sex: Sex; coord: Coord; from?: Coord; width: number; height: number; morphMs: number;
  yawGroup?: string; intro?: boolean; interactive: boolean; fallback: ReactNode;
}) {
  const w = Math.round(width);
  const h = Math.round(height);
  const view = useRef<NativeView | null>(null);
  const coordRef = useRef(coord);
  coordRef.current = coord;
  const alive = useRef(true);
  const group = useRef<ReturnType<typeof joinYawGroup> | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      group.current?.leave();
      view.current?.dispose();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    view.current?.setCoord(coord, morphMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coord.f, coord.m]);

  const onContextCreate = async (gl: ExpoWebGLRenderingContext) => {
    try {
      group.current = joinYawGroup(yawGroup, {}, (y) => view.current?.setYaw(y));
      const v = await attach(gl, { sex, coord: from ?? coordRef.current, intro, onYaw: group.current.emit });
      if (!alive.current) return v.dispose();
      view.current = v;
      // 이전 칸에서 시작하면(프로젝트 카드 선택) 지금 좌표로 변해 간다
      v.setCoord(coordRef.current, from ? 600 : 0);
      setState('ready');
    } catch (e) {
      markBroken(e);
      if (alive.current) setState('failed');
    }
  };

  const pan = useMemo(() => {
    let last = 0;
    return PanResponder.create({
      // 가로로 더 움직일 때만 가져간다 — 세로는 화면 스크롤
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
      onPanResponderGrant: () => {
        last = 0;
        view.current?.grab();
      },
      onPanResponderMove: (_e, g) => {
        view.current?.drag(g.dx - last);
        last = g.dx;
      },
      onPanResponderRelease: () => view.current?.release(),
      onPanResponderTerminate: () => view.current?.release(),
      onPanResponderTerminationRequest: () => false,
    });
  }, []);

  if (state === 'failed' || !GLView) return <>{fallback}</>;
  const GL = GLView;
  return (
    <View style={{ width: w, height: h }} {...(interactive ? pan.panHandlers : null)}>
      {state !== 'ready' ? <View style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} pointerEvents="none">{fallback}</View> : null}
      <GL key={`${w}x${h}`} style={{ width: w, height: h, backgroundColor: 'transparent' }} onContextCreate={onContextCreate} msaaSamples={4} />
    </View>
  );
}

export function Avatar3DStill({ sex, coord, from, width, height, fallback }: {
  sex: Sex; coord: Coord; from?: Coord; width: number; height: number; fallback: ReactNode;
}) {
  if (!has3D(sex)) return <>{fallback}</>;
  return (
    <Guard fallback={fallback}>
      <GLBody sex={sex} coord={coord} from={from} width={width} height={height} morphMs={600} interactive={false} fallback={fallback} />
    </Guard>
  );
}

export function Avatar3DLive({ sex, coord, width, height, morphMs = 700, yawGroup, intro = false, fallback }: {
  sex: Sex; coord: Coord; width: number; height: number; morphMs?: number; yawGroup?: string; intro?: boolean; fallback: ReactNode;
}) {
  if (!has3D(sex)) return <>{fallback}</>;
  return (
    <Guard fallback={fallback}>
      <GLBody sex={sex} coord={coord} width={width} height={height} morphMs={morphMs} yawGroup={yawGroup}
        intro={intro} interactive fallback={fallback} />
    </Guard>
  );
}
