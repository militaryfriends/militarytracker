/**
 * 지금 몸 체지방이 몸으로 보기 어려운 값(남 8% · 여 15% 미만)이면 허리를 다시 재 보라고 한다(2026-11-25 검수 1-2).
 * 예전에 허리를 작게 넣고 시작한 사람(프로젝트 시작값이 그대로 남는다)도 여기서 고칠 길을 연다 → 내 몸 다시 계산의 허리 단계.
 */
import { StyleSheet } from 'react-native';
import { Text } from '../Text';
import { useRouter } from 'expo-router';
import { colors, themed, useThemeMode } from '../../theme';
import { PressableScale } from '../../ui';
import { useOnboardDraft } from '../../stores/onboardDraft';
import { belowFloor } from '../../utils/bodyAnalysis';
import { pct1 } from './format';
import { useNowBody } from './nowBody';

export function RemeasureNote() {
  useThemeMode();
  const router = useRouter();
  const now = useNowBody();
  if (!now || !belowFloor(now.sex, now.bfPct)) return null;
  const go = () => {
    useOnboardDraft.getState().patch({ resume: 'body' });
    router.push('/project/new');
  };
  return (
    <PressableScale onPress={go} style={s.box} accessibilityRole="button" accessibilityLabel="허리둘레 다시 넣기">
      <Text style={s.title}>체지방 {pct1(now.bfPct)}%는 대회 직전 보디빌더 수준이에요</Text>
      <Text style={s.sub}>허리를 작게 넣으면 이렇게 나와요. 배꼽 높이에서 다시 재 보세요 ›</Text>
    </PressableScale>
  );
}

const s = themed(() => StyleSheet.create({
  box: { borderWidth: 1, borderColor: colors.line2, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 14 },
  title: { fontSize: 13.5, fontWeight: '700', color: colors.ink },
  sub: { fontSize: 12, color: colors.mid, marginTop: 4, lineHeight: 17 },
}));
