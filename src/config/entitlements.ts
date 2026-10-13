/**
 * 구독 경계선 — 무엇이 유료인지는 전부 이 파일에서 정한다.
 *
 * 여기는 "화면에 자물쇠를 어디에 그릴지"만 정하는 곳이고,
 * 실제 차단은 서버(functions/src/entitlement.ts)가 한다.
 * 클라이언트 게이트는 우회할 수 있으므로 절대 이것만 믿으면 안 된다.
 * 두 파일의 Feature 키는 항상 같은 값을 유지할 것.
 */

export type Feature =
  /** 온보딩·플랜 탭의 AI 개인화 플랜 생성 */
  | 'ai_plan'
  /** 내 정보 탭의 AI 코치 대화 */
  | 'ai_coach'
  /** 식단 탭의 하루 식단 구성 */
  | 'ai_diet'
  /** 내 조건에 맞는 루틴 자동 추천 */
  | 'routine_reco'
  /** 내 변화 프로젝트 — 목표 체형까지의 맞춤 루틴·단계별 식단·4주 체크인 리포트 */
  | 'body_project';

/**
 * 유료 기능 목록. 여기서 빼면 즉시 무료가 된다(서버도 같이 고칠 것).
 *
 * 무료로 남겨 둔 것: 루틴 라이브러리 직접 선택, 자동 구성 플랜(buildLocalPlan),
 * 운동 세션·기록·개인 기록, 자세 체크 180종과 영상, 체중 기록,
 * 기본 신체 지표(BMI·TDEE·매크로).
 * → 구독하지 않아도 앱으로 운동을 시작하고 끝까지 기록할 수 있어야 한다.
 */
export const PRO_FEATURES: readonly Feature[] = [
  'ai_plan',
  'ai_coach',
  'ai_diet',
  'routine_reco',
  'body_project',
];

export const isProFeature = (f: Feature): boolean => PRO_FEATURES.includes(f);

export const FEATURE_LABEL: Record<Feature, string> = {
  ai_plan: 'AI 개인화 플랜',
  ai_coach: 'AI 코치',
  ai_diet: 'AI 식단',
  routine_reco: '루틴 추천',
  body_project: '내 변화 프로젝트',
};

export const FEATURE_DESC: Record<Feature, string> = {
  ai_plan: '신체 정보·목표·환경을 반영해 분할과 종목을 직접 구성합니다.',
  ai_coach: '내 기록을 읽고 답하는 코치에게 하루 10회까지 물어봅니다.',
  ai_diet: '목표 칼로리와 식사 환경에 맞춘 하루 식단을 구성합니다.',
  routine_reco: '7개 루틴 중 지금 조건에 가장 맞는 것을 골라 줍니다.',
  body_project: '목표 몸까지의 맞춤 루틴·단계별 식단·4주 체크인을 진행합니다.',
};

/** 잠금 화면에서 "무료로도 됩니다" 를 보여 주기 위한 목록 */
export const FREE_HIGHLIGHTS: readonly string[] = [
  '루틴 라이브러리 7종 전체 사용',
  '운동 세션·세트 기록·개인 기록(PR)',
  '자세 체크 180종목 · 실수/교정 포인트',
  '체중 기록과 추세, 기본 신체 지표',
];

// ─── 스토어 상품 ───────────────────────────────────────────────────────────
// ⚠️ 여기 id·가격은 App Store Connect / Play Console 에 등록한 값과
//    반드시 글자 그대로 일치해야 한다. 가격은 스토어에서 받아온 값이 있으면
//    그쪽이 우선이고, 이 값은 로딩 전에 잠깐 보여 주는 기본값이다.
export interface SubProduct {
  id: string;
  label: string;
  price: string;
  period: string;
  note?: string;
  best?: boolean;
}

export const PRODUCTS: readonly SubProduct[] = [
  { id: 'mt_pro_monthly', label: '월간', price: '₩4,900', period: '/월' },
  {
    id: 'mt_pro_yearly',
    label: '연간',
    price: '₩39,000',
    period: '/년',
    note: '월 3,250원 꼴 · 33% 저렴',
    best: true,
  },
];

/** 무료 체험 일수. 0 이면 체험 없음 */
export const TRIAL_DAYS = 7;

export const PRO_NAME = 'MILITARYTRACKER PRO';

// ─── 법적 고지 링크 ─────────────────────────────────────────────────────────
// 자동갱신 구독은 심사에서 이용약관(EULA)·개인정보처리방침 링크가 필수다(Apple 3.1.2).
// 회원가입의 동의 절차도 같은 페이지를 가리킨다. 페이지는 public/ 의 정적 HTML 로
// Firebase Hosting 에 함께 배포된다.
export const LEGAL = {
  terms: 'https://military-tracker-96bdd.web.app/terms',
  privacy: 'https://military-tracker-96bdd.web.app/privacy',
  /** 문의·지원 — 스토어 양식의 지원 URL/이메일과 같은 값으로 둘 것 */
  support: 'mailto:smiscamp@gmail.com',
} as const;
