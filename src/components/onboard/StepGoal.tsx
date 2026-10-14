/**
 * O2 원하는 체형 — 성별 카드 5장(2열, 마지막 한 장은 가로 전체). 카드 = 그 칸의 프리셋 아바타 + 이름 + 한 줄 + 체지방률.
 * 탭 = 선택(테두리 + 체크), 선택된 카드를 다시 탭 = 크게 보기.
 * 아래 텍스트 버튼: "잘 모르겠어요, 추천해주세요"(목표 미정 → 엔진이 정한다) · "체형보다 운동 습관이 먼저예요"(습관 경로).
 */
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, themed, useThemeMode } from '../../theme';
import { PressableScale, haptic } from '../../ui';
import { archetypesFor, type Archetype } from '../../data/archetypes';
import { has3D } from '../body/avatar3d/Avatar3D';
import type { GoalPick } from '../../utils/bodyAnalysis';
import type { Sex } from '../../utils/bodyComp';
import { AvatarView } from '../body/AvatarView';
import { StepHead } from './basicSteps';
import { o } from './styles';

export function StepGoal({
  sex, pick, num, total, onPick, onAuto, onHabit,
}: {
  sex: Sex;
  pick: GoalPick | null;
  num: number;
  total: number;
  onPick: (id: string) => void;
  onAuto: () => void;
  /** 없으면 습관 경로 버튼을 숨긴다(홈에서 다시 분석할 때) */
  onHabit?: () => void;
}) {
  useThemeMode();
  const { width } = useWindowDimensions();
  const [preview, setPreview] = useState<Archetype | null>(null);
  const cards = archetypesFor(sex);
  const colW = (Math.min(width, 480) - 44 - 10) / 2;

  const tap = (a: Archetype) => {
    if (pick?.mode === 'pick' && pick.archetypeId === a.id) {
      haptic.select();
      setPreview(a);
      return;
    }
    onPick(a.id);
  };

  return (
    <View>
      <StepHead num={num} total={total} q="어떤 몸이 되고 싶으세요?" desc="지금 몸과 비교해서 도달 가능한 길을 계산해드릴게요" />
      <View style={s.grid}>
        {cards.map((a, i) => {
          const on = pick?.mode === 'pick' && pick.archetypeId === a.id;
          const wide = i === cards.length - 1;
          return (
            <PressableScale
              key={a.id}
              haptic="select"
              scaleTo={0.98}
              onPress={() => tap(a)}
              style={[s.card, wide ? s.cardWide : { width: colW }, on && s.cardOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${a.name}, ${a.line}, 체지방률 약 ${a.bfPct}%`}
              accessibilityHint={on ? '한 번 더 누르면 크게 봅니다' : undefined}
            >
              <AvatarView sex={sex} cell={a.cell} width={wide ? 48 : Math.min(76, colW * 0.5)} style={wide ? undefined : s.avatar} />
              <View style={wide ? s.wideTxt : s.txt}>
                <Text style={s.name}>{a.name}</Text>
                <Text style={s.line} numberOfLines={2}>{a.line}</Text>
                <Text style={s.bf}>체지방률 약 {a.bfPct}%</Text>
              </View>
              {on ? (
                <View style={s.check}>
                  <Ionicons name="checkmark" size={14} color={colors.bg} />
                </View>
              ) : null}
            </PressableScale>
          );
        })}
      </View>

      <TouchableOpacity style={o.textBtn} onPress={onAuto} accessibilityRole="button">
        <Text style={o.textBtnTxt}>잘 모르겠어요, 추천해주세요</Text>
      </TouchableOpacity>
      {onHabit ? (
        <TouchableOpacity style={o.textBtn} onPress={onHabit} accessibilityRole="button">
          <Text style={o.textBtnTxt}>체형보다 운동 습관이 먼저예요</Text>
        </TouchableOpacity>
      ) : null}

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable style={s.scrim} onPress={() => setPreview(null)} accessibilityRole="button" accessibilityLabel="닫기">
          {preview ? (
            <View style={s.sheet}>
              {/* 3D 를 돌리는 손가락이 바깥(닫기)으로 새지 않게 아바타가 터치를 가져간다 */}
              <View onStartShouldSetResponder={() => true}>
                <AvatarView sex={sex} cell={preview.cell} width={Math.min(260, width - 80)} badge="목표" live intro />
              </View>
              <Text style={s.sheetName}>{preview.name}</Text>
              <Text style={s.sheetLine}>{preview.line} · 체지방률 약 {preview.bfPct}%</Text>
              <Text style={s.sheetHint}>{has3D(sex) ? '좌우로 밀어 돌려 보기 · 바깥을 누르면 닫혀요' : '눌러서 닫기'}</Text>
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
  card: {
    backgroundColor: colors.panel, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line,
    padding: 12, alignItems: 'center',
  },
  cardWide: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 14 },
  cardOn: { borderColor: colors.ink, backgroundColor: colors.panel2 },
  avatar: { marginBottom: 6 },
  txt: { alignItems: 'center' },
  wideTxt: { flex: 1 },
  name: { fontSize: 15, fontWeight: '800', color: colors.ink },
  line: { fontSize: 11.5, color: colors.muted, marginTop: 3, lineHeight: 16 },
  bf: { fontSize: 11, color: colors.mid, marginTop: 5, fontWeight: '600' },
  check: {
    position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center',
  },
  scrim: { flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: {
    backgroundColor: colors.panel, borderRadius: 22, padding: 22, alignItems: 'center',
    borderWidth: 1, borderColor: colors.line2,
  },
  sheetName: { fontSize: 19, fontWeight: '800', color: colors.ink, marginTop: 12 },
  sheetLine: { fontSize: 13, color: colors.muted, marginTop: 4 },
  sheetHint: { fontSize: 11, color: colors.placeholder, marginTop: 14 },
}));
