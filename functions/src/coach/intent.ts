/**
 * 질문 의도 분류 — 규칙(키워드)만. AI 로 분류하면 호출이 두 번이 되므로 쓰지 않는다.
 * 애매하면 'general'. 위험 신호(응급 · 부상)는 다른 의도보다 먼저 본다.
 * 빗나간 분류는 coachLog 로 보고 규칙을 더한다.
 */

export type Intent = 'emergency' | 'injury' | 'diet' | 'workout' | 'progress' | 'motivation' | 'app' | 'general';

/** 가슴 · 심장 — 운동 뒤 근육 이야기면 응급이 아니다 ("벤치 후 가슴 근육이 아파") */
const CHEST = /(가슴|흉부|심장).{0,12}(통증|아파|아프|아픔|조여|조이|답답|쥐어짜)|심장.{0,6}(두근|쿵쾅)/;
const MUSCLE_CTX = /근육|근육통|벤치|푸시업|팔굽|딥스|플라이|펌핑/;
const EMERGENCY = [
  /숨(이|을)?\s?(안|못)\s?쉬|숨\s?막혀|호흡\s?곤란/,
  /실신|기절|정신을?\s?잃|쓰러졌/,
  /(소변|오줌).{0,6}(콜라|갈색|검붉|피)/,
  /횡문근/,
  /한쪽.{0,6}(마비|감각이?\s?없)|감각이\s?없|말이\s?어눌/,
  /쓰러질\s?(것|거)|정신이\s?(혼미|흐려)|(어지러|어질).{0,12}(토할|구토|쓰러)|(토할|구토).{0,12}(어지러|어질)/,
];

const INJURY = /돌아갔|꺾였|뚝\s?소리|멍이?\s?들|아파|아프|아픔|통증|다쳤|다침|부상|삐었|삐끗|접질|저려|저림|저리|붓기|부었|부어|찌릿|시큰|쑤셔|쑤시|결려|결림|인대|디스크|탈구|골절|염좌|관절/;
/** 지연성 근육통(DOMS)은 부상이 아니다 — 운동 의도로 답한다 */
const DOMS = /근육통|알\s?배|알이\s?배|뻐근/;
const JOINT = /관절|무릎|허리|어깨|손목|발목|팔꿈치|목이|목\s|고관절|찌릿|날카|붓|부었|부어|삐|저려|저림|저리|디스크/;

const KEYS: Record<'diet' | 'workout' | 'progress' | 'motivation' | 'app', RegExp[]> = {
  progress: [/체중|몸무게|살이|살\s?찌|찌는|쪘/, /안\s?빠|안\s?늘|안\s?줄|정체|그대로|들쑥날쑥/, /언제쯤|언제\s?(빠|되|목표|보일|도달)|목표까지|예상|복근\s?보/,
    /진행|체지방률?|속도|잘하고\s?있|퍼센트|몇\s?%|어디쯤|얼마나\s?왔|인바디|근육량/, /빠졌|빠지|늘었|늘어|줄었|배만\s?나|배가\s?나/, /체크인/],
  diet: [/먹|식단|칼로리|kcal|단백질|탄수|지방|식사|끼니|식욕/, /밥|메뉴|간식|야식|배달|외식|회식|편의점|치팅|약속|삼겹살|고기|국밥|수분|물\s?(하루|얼마|몇)/, /술|음주|맥주|소주/, /치킨|라면|피자|햄버거|과자|빵|떡볶이|탄산|콜라|커피|과일/,
    /보충제|프로틴|쉐이크|닭가슴살|계란|고구마/, /아침|점심|저녁/],
  workout: [/운동|루틴|프로그램|분할/, /세트|반복|횟수|중량|무게|RPE|1RM/i, /자세|폼/, /스쿼트|벤치|데드|풀업|턱걸이|푸시업|팔굽|런지|로우|프레스|컬|딥스|플랭크|랫풀|풀다운|힙\s?쓰러스트|필라테스|요가/,
    /유산소|러닝|달리기|걷기|걸음|사이클|줄넘기|계단|철봉|오늘\s?(뭐|무슨)\s?(해|운동)/, /대체|기구|덤벨|바벨|머신|밴드|맨몸|헬스장|홈트/, /휴식|쉬는\s?날|근육통|알\s?배|스트레칭|워밍업|부위/, /가슴|등\s|어깨|팔|하체|엉덩이|복근|코어/],
  motivation: [/힘들|귀찮|의욕|포기|싫|지쳤|지친|자신\s?없|못\s?하겠|스트레스|게을|게으|작심삼일|동기|우울|짜증|멘탈|재미\s?없|시간이\s?없|폭식|때려치|그만두|피곤|지겹/],
  app: [/앱|어플/, /버튼|화면|메뉴\s?(가|에)/, /구독|결제|환불|해지|알림|설정|로그인|로그아웃|탈퇴|지우는|삭제/],
};
/** 이 말이 있으면 그 의도에 2점 더 — 단어 하나로 결정되는 강한 신호 */
const STRONG: Partial<Record<keyof typeof KEYS, RegExp>> = {
  motivation: /의욕|포기|싫|귀찮|지쳤|지친|자신\s?없|게으|게을|작심삼일|재미\s?없|시간이\s?없|멘탈/,
  diet: /굶|단식|거르|식욕|치팅/,
  app: /어디서|어디\s?있|어디예요|어디에서|어디야|버튼|화면|탭은|탭에서|수정은|수정하려면|바꾸려면|해지|설정/,
};
const ORDER: (keyof typeof KEYS)[] = ['progress', 'diet', 'workout', 'motivation', 'app'];

/** 아픈 부위를 빼고 운동을 짜 달라는 말 — 고정 안내 대신 운동 답(부상 부위 제외)으로 */
const AROUND = /빼고|말고|피해서|피하는|제외|대신|안\s?쓰는|없이\s?할/;

export interface Routed {
  intent: Intent;
  /** 아픈 곳을 말했다 — 답에서 그 부위를 쓰는 운동을 빼야 한다 */
  injury: boolean;
}

export function classify(text: string): Intent {
  return route(text).intent;
}

export function route(text: string): Routed {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return { intent: 'general', injury: false };
  if (EMERGENCY.some((r) => r.test(t)) || (CHEST.test(t) && !MUSCLE_CTX.test(t))) return { intent: 'emergency', injury: true };
  const hurt = INJURY.test(t) && !(DOMS.test(t) && !JOINT.test(t));
  if (hurt && !AROUND.test(t)) return { intent: 'injury', injury: true };
  return { intent: scoreIntent(t), injury: hurt };
}

function scoreIntent(t: string): Intent {
  let best: keyof typeof KEYS | null = null;
  let score = 0;
  for (const k of ORDER) {
    const s = KEYS[k].reduce((n, r) => n + (r.test(t) ? 1 : 0), 0) + (STRONG[k]?.test(t) ? 2 : 0);
    if (s > score) {
      best = k;
      score = s;
    }
  }
  return best ?? 'general';
}

/** 응급 · 부상 — AI 를 부르지 않고 이 문장으로 답한다 (진단 · 처방 금지, 진료 안내) */
export const SAFETY_REPLY: Record<'emergency' | 'injury', { text: string; warning: string }> = {
  emergency: {
    text: '말씀하신 증상은 운동 문제가 아니라 바로 확인이 필요한 증상일 수 있습니다. 지금 운동을 멈추고 앉아서 쉬세요. '
      + '증상이 계속되거나 심해지면 119에 전화하거나 가까운 응급실로 가세요. 혼자 있다면 주변 사람에게 먼저 알리세요.',
    warning: '가슴 통증 · 호흡 곤란 · 실신 · 콜라색 소변은 참고 운동할 증상이 아닙니다. 바로 진료를 받으세요.',
  },
  injury: {
    text: '통증이 있는 부위는 오늘 운동에서 빼세요. 아픈 동작을 참고 반복하면 회복이 길어집니다. '
      + '붓기 · 멍 · 찌릿한 저림이 있거나, 이틀이 지나도 그대로이거나, 밤에도 아프면 정형외과나 재활의학과 진료를 받아 보세요. '
      + '아프지 않은 부위 운동은 해도 됩니다 — 어느 부위인지 알려 주시면 그 부위를 뺀 오늘 운동을 짜 드릴게요.',
    warning: '저는 통증의 원인을 판단할 수 없습니다. 아픈데 참고 무게를 올리는 건 절대 안 됩니다.',
  },
};
