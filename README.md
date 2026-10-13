# MILITARYTRACKER

검증된 자세 가이드 위에서 기록하는 트레이닝 앱.
Expo(React Native) + Firebase.

---

## 스택

| 영역 | 기술 |
|---|---|
| 앱 | Expo SDK 57 · React Native 0.86 · expo-router 57 |
| 언어 | TypeScript 6 (strict) |
| 상태 | Zustand 5 |
| 백엔드 | Firebase Auth · Firestore · Cloud Functions v2 (asia-northeast3) |
| AI | Cloud Functions 프록시 경유 (앱에 키 없음) |

## 실행

```bash
npm install
cp .env.example .env      # Firebase 웹 앱 설정값 입력
npm start
```

## 구조

```
app/                    expo-router 라우트
  _layout.tsx           인증·데이터 하이드레이션 + 라우팅 가드
  onboard.tsx           5단계 온보딩 (마지막 단계에서 루틴 선택)
  tabs/                 홈 · 운동 · 자세 · 식단 · MY
  routine/              루틴 목록 → [routineId] → [dayId]
  exercise/[exerciseId] 종목 상세 (영상 + 자세 가이드)
  library/[feedId]      부위별 가이드 시리즈
src/
  data/exercises.ts     운동 180종 DB
  data/routines.ts      루틴 프리셋 7종
  data/media.ts         영상·이미지 레지스트리
  data/formCheck.ts     자세 교정 포인트
  data/feed.ts          라이브러리 콘텐츠
  services/             firebase · auth · workout · ai
  stores/               authStore · appStore
  utils/                planner · stats · body · colors
functions/              Cloud Functions (AI 프록시)
```

## 탐색 흐름

```
온보딩 → 루틴 선택 → 루틴 상세(푸시풀레그) → 데이(푸시데이) → 운동 종목
```

## 운동 DB

총 **180종**. 가슴 30 · 등 30 · 하체 30 · 어깨 30 · 이두 15 · 삼두 15 · 복근 30.

각 종목은 `id / 한글명 / 부위 / 세부타겟 / 장비 / 장소 / 세트 / 반복 / 휴식 / 난이도 / PPL분류` 를 가진다.

### 미디어 추가 방법

영상은 앱에 넣지 않는다. **서울 버킷(`gs://military-tracker-96bdd`, asia-northeast3)** 에 올리고
앱이 실행할 때 버킷의 매니페스트를 읽어 받는다. 영상을 추가·교체해도 **앱 업데이트가 필요 없다.**

1. 원본을 `media/originals/<부위>/` 에 넣는다 — git 에 들어가지 않는다
   - 부위: `chest back legs shoulders biceps triceps abs`
   - 파일명 앞 번호 = `exercises.ts` 에서 그 부위의 순번 (`21.Svend Press.mp4` → 가슴 21번째 = `svend`)
2. 매칭표 확인
   ```bash
   npm run media:upload -- back --dry
   ```
3. 인코딩·업로드
   ```bash
   npm run media:upload -- back
   ```
   최대 1280 정사각형 H.264 (CRF 18) + 512px 썸네일을 올리고 매니페스트를 갱신한다.
   `src/data/mediaManifest.json` 이 바뀌므로 **커밋할 것** (첫 실행·오프라인용 스냅샷).
4. 진행 상황
   ```bash
   npm run media:report            # 부위별 등록 현황
   npm run media:report --missing  # 누락 id 목록
   ```

자세한 구조와 이유는 `media/README.md`.

미등록 종목은 `<ExerciseMedia />` 가 부위 색상 플레이스홀더를 자동으로 렌더한다.

## Firebase

### 보안 규칙

- 본인 데이터만 읽고 쓴다 (`users` / `plans` / `workoutLogs` / `weights`)
- `role == 'admin'` 이거나 커스텀 클레임 `admin: true` 인 계정은 **전체 허용**
- `users.role / sub / usage` 는 서버 전용 — 클라이언트는 추가·수정·삭제 모두 불가 (`diff().affectedKeys()`)
- `users` 문서 삭제는 클라이언트에 없다 — 계정 삭제는 `accountDelete` 콜러블이 한다
- 문서 필드는 타입·크기 화이트리스트로 검증한다 (`validLog` / `validWeight` / `validProfile`)
- 정의되지 않은 컬렉션은 관리자만

```bash
npm run deploy:rules
```

관리자 지정 — 둘 중 하나:

```bash
# (권장) 커스텀 클레임 — 규칙에서 문서 read 비용이 없다
node -e "require('firebase-admin').initializeApp();require('firebase-admin').auth().setCustomUserClaims('<uid>',{admin:true})"

# 또는 Firestore 콘솔에서 users/{uid}.role 을 'admin' 으로 변경
```

### Cloud Functions (AI 프록시)

AI: `aiPlan` · `aiDiet` · `aiCoach` · `bodyCheckinReport` — 구독(`requirePro`) + 사용 한도(플랜·식단 일 5회, 코치 일 10회, 체크인 리포트 월 2회, 트랜잭션 선점) 를 서버가 강제한다.
내 변화 프로젝트: `bodyProjectStart`(= 명세의 projectStart, AI 없음) · `bodyCheckinReport`(= aiReport, 체크인 판정 + 리포트) — 숫자는 `functions/src/engine/`(앱 엔진 복사본, `npm run engine:sync`)이 서버에서 다시 계산한다.
구독·계정: `subStatus` · `subStartTrial`(이메일 인증 필수) · `subRedeemPromo`(하루 10회 시도 제한) · `subGrant`(관리자) · `subApplyReceipt`(미구현) · `accountDelete`.
프로모 코드는 `promoCodes/{CODE}` 문서로 콘솔에서 만든다 — `{ days, maxUses, uses: 0, active: true, validUntil? }`, CODE 는 대문자·숫자·하이픈 6~40자.

```bash
cd functions && npm install && cd ..
firebase functions:secrets:set ANTHROPIC_API_KEY   # 키 입력
npm run deploy:functions
```

> 함수가 배포되지 않은 상태에서도 앱은 동작한다.
> 플랜은 로컬 알고리즘, 식단은 기본 예시로 자동 폴백한다.

## 면책

일반적인 운동·영양 가이드이며 의학적 조언이 아니다. 통증·질환이 있으면 전문가와 상담할 것.
