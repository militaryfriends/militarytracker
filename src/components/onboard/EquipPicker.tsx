/**
 * 가진 기구 고르기 (2026-11-25 클라이언트 요청) — 온보딩 '운동 장소' 다음 한 화면과 MY › 내 정보에서 같이 쓴다.
 *  헬스장: "일반 헬스장이에요"(기본 · 누르면 바로 다음) / "작은 헬스장이에요" → 없는 기구를 끈다
 *  홈트  : 맨몸만 · 덤벨 · 밴드 · 턱걸이바 · 벤치(또는 의자) 체크
 * 저장값은 늘 배열이다(헬스장 기본 = GYM_KIT 전부) — 프로필은 merge 로 저장돼 undefined 로는 예전 값이 안 지워진다.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '../Text';
import { useThemeMode } from '../../theme';
import { GYM_KIT, HOME_KIT, KIT_LABEL, type Kit } from '../../data/equipment';
import { Opt } from './basicSteps';
import { o } from './styles';
import { PressableScale } from '../../ui';

/** 이 장소에 맞는 기구 목록인가(장소를 바꾸면 예전 목록은 버린다) */
export function equipFits(env: 'gym' | 'home', equip: string[] | undefined): equip is string[] {
  if (!Array.isArray(equip)) return false;
  const pool = (env === 'gym' ? GYM_KIT : HOME_KIT) as string[];
  return equip.every((k) => pool.includes(k));
}

export function defaultEquip(env: 'gym' | 'home'): string[] | undefined {
  return env === 'gym' ? [...GYM_KIT] : undefined;
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <PressableScale haptic="select" style={[o.chip, on && o.chipOn]} onPress={onPress}
      accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
      <Text style={[o.chipTxt, on && o.chipOnTxt]}>{label}</Text>
    </PressableScale>
  );
}

export function EquipPicker({ env, equip, onChange, onGeneralGym }: {
  env: 'gym' | 'home';
  equip: string[] | undefined;
  onChange: (next: string[]) => void;
  /** 헬스장 "일반 헬스장이에요"를 눌렀을 때(온보딩은 바로 다음 화면으로) */
  onGeneralGym?: () => void;
}) {
  useThemeMode();
  const fits = equipFits(env, equip);
  const list = fits ? equip : env === 'gym' ? [...GYM_KIT] : [];
  const has = new Set(list);
  const gymMissing = GYM_KIT.filter((k) => !has.has(k));
  const [small, setSmall] = useState(env === 'gym' && fits && gymMissing.length > 0);

  const toggle = (k: Kit) => {
    const next = new Set(list);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    onChange([...next]);
  };

  if (env === 'gym') {
    return (
      <View>
        <Opt label="일반 헬스장이에요" sub="바벨 · 덤벨 · 머신 · 케이블 · 스미스가 다 있어요" on={!small}
          onPress={() => { setSmall(false); onChange([...GYM_KIT]); onGeneralGym?.(); }} />
        <Opt label="작은 헬스장이에요" sub="없는 기구를 빼 주세요" on={small} onPress={() => setSmall(true)} />
        {small ? (
          <>
            <Text style={[o.desc, { marginTop: 10, marginBottom: 10 }]}>있는 기구만 켜 두세요. 꺼진 기구가 필요한 운동은 루틴에 넣지 않아요.</Text>
            <View style={o.chipRow}>
              {GYM_KIT.map((k) => <Chip key={k} label={KIT_LABEL[k]} on={has.has(k)} onPress={() => toggle(k)} />)}
            </View>
          </>
        ) : null}
      </View>
    );
  }

  const bodyOnly = fits && list.length === 0;
  return (
    <View>
      <View style={o.chipRow}>
        <Chip label="맨몸만" on={bodyOnly} onPress={() => onChange([])} />
        {HOME_KIT.map((k) => <Chip key={k} label={KIT_LABEL[k]} on={has.has(k)} onPress={() => toggle(k)} />)}
      </View>
      <Text style={[o.desc, { marginTop: 10 }]}>여러 개 고를 수 있어요. 없는 기구가 필요한 운동은 루틴에 넣지 않아요.</Text>
    </View>
  );
}
