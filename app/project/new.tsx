/**
 * 가입한 사용자가 온보딩 입력을 다시 연다.
 *  · 홈 "내 몸 분석하기"            → /project/new            (redo: 저장된 프로필 · 목표로 채움)
 *  · 마이 "온보딩 처음부터 다시 하기" → /project/new?restart=1  (restart: 목표부터 새로, 습관 경로 포함)
 */
import { useLocalSearchParams } from 'expo-router';
import { OnboardFlow } from '../../src/components/onboard/OnboardFlow';

export default function ProjectNewScreen() {
  const { restart } = useLocalSearchParams<{ restart?: string }>();
  return <OnboardFlow mode={restart ? 'restart' : 'redo'} />;
}
