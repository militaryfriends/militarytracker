/** 홈에서 "내 몸 다시 분석하기" — 온보딩 입력 단계를 저장된 프로필로 채워서 다시 연다(습관 경로 없음) */
import { OnboardFlow } from '../../src/components/onboard/OnboardFlow';

export default function ProjectNewScreen() {
  return <OnboardFlow mode="redo" />;
}
