/**
 * 온보딩 — 입력 5단계(O1~O5)는 OnboardFlow, 분석(O6) · 비교(O7) · 프로젝트 제안(O8)은 /project/*.
 * O6~O8 을 /project 아래에 두는 이유: 홈의 "내 변화 프로젝트" 카드에서 온보딩이 끝난 뒤에도 같은 화면을 다시 연다
 * (라우팅 가드는 온보딩이 끝난 사용자를 /onboard 에서 홈으로 돌려보낸다).
 */
import { OnboardFlow } from '../src/components/onboard/OnboardFlow';

export default function OnboardScreen() {
  return <OnboardFlow mode="first" />;
}
