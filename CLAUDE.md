# MilitaryTracker — 작업 메모

Expo SDK 57 · React Native 0.86 · expo-router · TypeScript(strict) · Zustand · Firebase

## 검증

```bash
npx tsc --noEmit                  # 앱
npm run check:theme               # 두 모드 색 대비 (palette.json 을 바꾸면)
cd functions && npm run build     # Cloud Functions
npm test                          # 엔진(체형 예측) 예시 A~E + 서버 복사본 동기 확인
npx expo export --platform web    # 번들 스모크 테스트
npm run deploy:rules              # firestore + storage 규칙, 인덱스
npm run deploy:functions
npm run deploy:hosting            # 웹 export + hosting
```

## UI 규칙 (다크 · 라이트 · 모션)

- **색은 `src/theme` 의 `colors.*` 로만, 렌더 중에 읽는다.** 값은 `src/theme/palette.json` 한 곳(두 모드).
  파일 맨 위에서 값으로 저장하지 않는다(`const X = colors.ink` → 그 순간 모드에 묶임). 새 색이 필요하면 palette.json 에
  두 모드 모두 넣고 `npm run check:theme`.
- **스타일은 `const s = themed(() => StyleSheet.create({ … }))`.** 모드마다 한 번 만든다.
- **색을 읽는 컴포넌트는 맨 위에서 `useThemeMode()`** 를 한 번 부른다(모드가 바뀌면 그 자리에서 다시 그려진다 — 화면을
  새로 띄우지 않는다). `renderItem` 안에서 색을 읽는 FlatList · SectionList 는 `extraData` 에 모드를 넣는다.
- 모노: 강조색 = 글자색(`accent` = `ink`), 그 위 글자 = `onAccent`(= `bg`). 주 버튼은 다크에서 흰 판 · 라이트에서 검은 판.
- **사진 · 영상 위 글자와 막은 모드와 상관없다** — `onMedia` · `onMediaSub` · `mediaDim` · `mediaBadge` 토큰을 쓴다(`ink` 금지).
- 모드 전환은 `toggleTheme()`(홈 토글) · `chooseTheme()`(MY › 화면). 옛 바탕 막이 240ms 동안 걷힌다(ThemeProvider).
  앱 전체를 한 번에 다시 그리므로, 언젠가 토글이 굼떠지면 smiscamp `ThemeLane` 처럼 안 보이는 화면을 뒤로 미룬다.
- 상태 표시줄은 ThemeProvider 가 맡는다. 루트 레이아웃에서 모드를 구독하는 것을 늘리지 않는다.
- **로그인 · 회원가입은 테마와 상관없이 항상 다크** — `colors` 대신 `src/components/auth/palette.ts` 의 `D`(다크 팔레트 고정),
  화면에서 `<StatusBar style="light" />`. 로고 모션은 `src/components/brand/`(BrandMark · intro.ts 시간표 · geometry.ts 고리 위치).
  바탕은 단색 `D.bg` — 노이즈 · 그레인을 깔지 않는다(먼지처럼 보여 뺐다).
- 로고 이미지 · 앱 아이콘 · 스플래시 · 파비콘은 `python3 scripts/brand-assets.py` 가 원본 2개(`media/brand/`)에서 만든다.
  직접 그리지 말 것. 로고를 바꾸면 스크립트를 다시 돌리고, 출력된 고리 위치를 `geometry.ts` 에 맞춘다. 아이콘 · 스플래시는 새 빌드부터 바뀐다.
- **스플래시 → 첫 화면은 한 장면으로 잇는다** (`src/components/brand/splash.ts`). 스플래시는 테마와 상관없이 검정 + 흰 로고 한 벌,
  로고 자리 · 크기는 `geometry.ts` 의 `SPLASH_FRAME`(= app.json `imageWidth`, 안드로이드 192dp 원 안). 스플래시를 걷는 쪽은 다음 화면이다 —
  로그아웃이면 로그인 화면이 같은 장면을 그린 뒤 걷고 `HANDOFF` 시간표로 인트로를 잇는다, 로그인 상태면 루트의 `BootCurtain` 이
  걷고 로고가 커지며 사라져 홈이 드러난다. **루트에서 `hideAsync` 를 바로 부르지 말 것** — 로고가 사라졌다 다시 나온다(2초 안전장치만 있다).
- **누르는 것은 `src/ui` 의 `PressableScale`**(0.96 + 스프링 + 진동). 진동은 `haptic.select/tap/set/success/warn/error` 뜻으로만
  부른다(`src/ui/haptics.ts` 표). 스프링 · 시간 값은 `src/ui/motion.ts` 에서 가져다 쓴다.
- 장식으로 계속 도는 애니메이션은 `useReducedMotion()` 이면 멈춘다. 휴식 고리처럼 정보인 것은 움직인다.
- 숫자 글꼴은 `FONT.num`(Barlow Condensed). 본문은 시스템 글꼴.
- 웹: 정적 HTML 은 다크로 미리 그려진다. 라이트인 사람은 `app/+html.tsx` 스크립트가 화면을 가려 뒀다가 루트 레이아웃이 연다.
  `Font.loadAsync` 같은 클라이언트 전용 호출을 파일 맨 위에 두면 웹 정적 렌더링이 깨진다 — effect 안에서.

## Firebase 읽기 · 쓰기 (`src/services/session.ts`)

- **앱 시작은 기기 캐시(appStore persist)로 연다.** 서버 응답을 스플래시 앞에 두지 않는다.
  RN 의 Firestore 는 디스크 캐시가 없고 메모리뿐이라, 재시작 뒤 화면은 appStore 캐시가 맡는다.
- **`users/{uid}` 는 세션이 `onSnapshot` 으로 구독한다.** 화면에서 getDoc 으로 다시 읽지 말고 `useAuthStore` 의 user 를 쓴다.
  users 문서를 쓰면 구독이 새 값을 넣어 준다(`patchUser` 는 즉시 반영용). 쓸 때마다 구독에 읽기 1건이 붙으니
  자주 바뀌는 값을 users 문서에 넣지 않는다(lastLoginAt 도 12시간에 한 번).
- **기록 · 체중은 `createdAt >` 증분**(새 것이 없어도 쿼리당 읽기 1건) + 사흘마다 전체(`syncMarks`).
  새 컬렉션을 붙일 때도 같은 방식으로. 합치기는 `src/utils/merge.ts`.
- **사용자가 만드는 문서 id 는 `stableDocId(uid, createdAt)`.** 재시도해도 같은 문서를 덮어써 중복이 없다 — addDoc(무작위 id) 금지.
  쓰기는 `withTimeout` 으로 감싼다(오프라인에서 SDK 의 쓰기 Promise 는 끝나지 않는다).
- **로그아웃 · 계정 삭제는 `logoutUser` · `deleteUserAccount`.** 구독을 먼저 끊어야 권한 오류가 안 나고,
  서버가 지운 users 문서를 "없음"으로 보고 다시 만들지 않는다.
- 구독(PRO) 판정은 문서의 `sub` + `isProSub`. `subStatus` 콜러블은 만료됐는데 문서가 아직 pro 일 때만 부른다.

## 내 변화 프로젝트 (체형 예측 → 결제)

명세: "아바타 체형 변화 예측 기능 — 개발 인수인계 명세 v1". 흐름: 온보딩 O1 기본 → O2 원하는 체형 → O3 현재 체형
(허리 권장 · 인바디 선택 · 정확도 미터) → O4 환경 → O5 식사 → O6 분석 `/project/analysis` → O7 "분석이 완료되었습니다"
`/project/compare` → O8 프로젝트 2개 `/project` → 결제 `/subscribe?f=body_project&project=p1|p2` → `/project/start` →
홈 카드 · 4주 체크인 `/project/checkin`. 습관 경로(O2 "체형보다 운동 습관이 먼저예요")는 O3 · O6~O8 없이 예전 루틴 선택.
O6~O8 은 `/project` 아래라 온보딩이 끝난 뒤에도 홈에서 다시 연다(라우팅 가드가 온보딩 중에도 `/project` 를 허용).

- **숫자는 엔진만 만든다** — `src/utils/bodyComp.ts` · `projection.ts` · `bodyAnalysis.ts` · `src/data/archetypes.ts`(결정론적,
  `ENGINE_VERSION` 기록). 서버 복사본 `functions/src/engine/` — 고치면 `npm run engine:sync` 후 `npm test`
  (명세 3-6 예시 A~E 가 소수 1자리까지 같아야 한다). 표시 반올림은 `roundTo`(검산표와 같은 "딱 절반이면 짝수 쪽").
- **AI 는 숫자를 못 바꾼다** — 온보딩(O1~O8)에서는 AI 호출 0회. `projectStart` 는 AI 없이 저장된 입력으로 서버가 다시 계산,
  `aiPlan`/`aiDiet` 에 projectId 를 주면 서버가 숫자를 정하고 식단 끼니별 kcal 은 서버가 덮어쓴다. 프롬프트 공통 규칙 `GUARD`.
- 결제 전에도 예상 몸 · 숫자는 전부 보인다(블러 금지, `예상` 배지, 고지 문구). 18개월 안에 못 가면 "목표의 N% 지점".
- 저장: `bodyAnalyses`(본인) · `checkins`(본인, 판정은 `aiReport` 가 다시) · `bodyProjects` · `bodyReports`(서버만).
  기기 캐시가 원본처럼 쓰이고 서버에서는 사흘마다 · 새 기기에서만 받는다(`session.ts` syncBody). 계정 삭제가 네 컬렉션을 지운다.
- 진행 중인 프로젝트가 있으면 `calcBodyStats(p, weights, project)` 의 칼로리 · 단백질은 지금 단계(감량/린벌크/유지) 값.
- 아바타: 남성은 **3D**(`src/components/body/avatar3d/`, 모델 + 모프 4개, 만드는 법 `scripts/AVATARS.md`).
  웹 = three.js(`engine.web.ts`, 모델 `avatar_m.glb` meshopt), 앱 = expo-gl GLView + three.js(`engine.native.ts`, 모델 `avatar_m_native.glb`
  — meshopt 해제기가 WebAssembly 라 Hermes 에서 못 씀). 장면 · 조명 · 움직임은 `stage.ts` 한 벌. 앱에서 GL 초기화가 한 번이라도 실패하면
  그 뒤로는 2D(`markBroken`). expo-gl 은 네이티브 모듈 — 앱에 반영하려면 새 빌드.
  `AvatarView` 에 `coord`(엔진 연속 좌표)를 주면 그 몸, `live` 면 손으로 돌리는 뷰어(좌표가 바뀌면 몸이 서서히 변함).
  three.js 는 `avatar3d/kit.web.ts` 하나로만 가져온다 — 다른 곳에서 three 를 import 하면 메인 번들에 섞여 웹 첫 로딩이 무거워진다.
  3D 가 없으면(네이티브 · 여성 · WebGL 불가) 칸 프리셋 `src/data/avatarGrid.ts` → 회색 실루엣(`Silhouette`) 순서.
- 프로 혜택 문구(O8 "이 몸을 만드는 도구": 코치 하루 10회)는 서버 한도(`functions/src/quota.ts`)와 같아야 한다.
- 콜러블 배포 이름은 `bodyProjectStart`(명세의 projectStart) · `bodyCheckinReport`(aiReport). **콜러블의 공개 호출 설정은
  처음 만들 때만 적용된다** — 첫 생성에서 실패하면 재배포로 고쳐지지 않고 403 이 남는다.
  지금 배포 계정(MCP · CLI)으로는 새 콜러블 생성 때 이 설정이 매번 실패한다 → 새 콜러블을 추가하면 프로젝트 소유자가
  Cloud Run 콘솔에서 그 서비스의 보안 탭 → "공개 액세스 허용" 을 한 번 켜야 한다(기존 함수 업데이트는 영향 없음).
  배포 뒤 `curl -X POST …/함수 -d '{"data":{}}'` 가 401(로그인 필요)인지 확인할 것 — 403 이면 그 상태다.

## git push (Claude 세션용)

맥의 키체인은 Claude 가 도는 리눅스 VM에서 보이지 않는다.
대신 이 저장소 전용 **배포 키**를 `.git/claude_deploy_key` 에 두었다
(`.git` 내부라 커밋되지 않는다). push 는 이 명령으로 한다:

```bash
GIT_SSH_COMMAND="ssh -i $PWD/.git/claude_deploy_key -o IdentitiesOnly=yes" \
  git push git@github.com:militaryfriends/militarytracker.git main
git fetch origin        # origin/main 추적 참조 동기화 (위 push 는 갱신하지 않음)
```

원격 URL 은 일부러 HTTPS 그대로 두었다 — 맥에서 쓰던 `git push` 방식을 바꾸지 않기 위해서다.
키 폐기는 GitHub 저장소 Settings → Deploy keys 에서 삭제.

커밋 작성자는 **`Sunwoong Shin <pobredward@gmail.com>`** (GitHub 에 밀프 개발자로 등록된 계정, 2026-10-15 부터).
VM 에는 git 사용자 설정이 없으니 `git -c user.name="Sunwoong Shin" -c user.email="pobredward@gmail.com" commit …` 로 한다.
VM 은 연결 폴더에서 파일을 지울 수 없어 git 이 `.lock` 파일을 남길 수 있다 — 끝나고 `find .git -name '*.lock'` 로 확인해
`.git/stale-…` 로 mv 해 둔다(남겨 두면 맥에서 git 이 "File exists" 로 멈춘다).

## 웹 배포 (Claude 세션용)

- 맥 `node_modules` 는 macOS용이라 리눅스 VM 에서 `expo export` 가 안 된다 → 클라우드 컨테이너에서 같은 커밋으로
  `npx expo export --platform web` → `dist` 를 tgz 로 맥에 보내 `dist/` 에 푼다(옛 dist 는 `.cache/` 로 mv — 삭제 권한 없음).
- 배포는 맥의 Firebase MCP(`firebase_deploy only=hosting`, 로그인 pobredward@gmail.com). **먼저 project_dir 을 이 저장소로,
  active project 를 `military-tracker-96bdd` 로 바꾼다** — 기본값이 smis-mentor 라 그대로 두면 다른 프로젝트에 배포된다.
  끝나면 project_dir 을 `/Users/sunwoongshin/Dev/smis-mentor` 로 되돌리고, **따로 한 번 더** active project 를 `smis-mentor`
  로 맞춘 뒤 `firebase_get_environment` 로 확인한다(두 값을 한 호출에 바꾸면 smis-mentor 폴더에 이 프로젝트가 남은 적이 있다).
- `firebase.json` hosting 의 `site` 는 지우지 말 것 — 없으면 MCP 배포가 "no site name" 으로 실패한다.

## 앱 코드 푸시 (EAS Update, 1.2.0 빌드부터)

스토어 심사 없이 JS · 화면 · 문구 · 이미지 같은 **JS 번들 안의 변경**을 이미 깔린 앱에 보낸다. 사용자는 다음에 앱을 켤 때 받는다
(`updates.checkAutomatically: ON_LOAD`, 기다리지 않음 → 그다음 실행부터 새 코드).

```bash
eas update --channel production --message "무엇을 바꿨는지"     # 맥에서 (Expo 로그인 필요)
```

- 빌드 채널: production · preview · development (`eas.json`). 스토어 빌드는 production 채널을 본다.
- `runtimeVersion` 정책은 `appVersion` — **같은 앱 버전(app.json `version`)의 빌드에만** 업데이트가 간다.
- **네이티브가 바뀌면 코드 푸시로 못 보낸다**: 네이티브 모듈 추가 · 업그레이드(npx expo install 로 새 패키지), Expo SDK 올림,
  app.json 의 아이콘 · 스플래시 · 권한 · 플러그인. 이때는 `version` 을 올리고 스토어 빌드 → 옛 버전 앱에는 그 업데이트가 안 간다.
  버전을 안 올리고 네이티브가 필요한 JS 를 보내면 옛 앱이 그 모듈을 못 찾아 깨진다.
- 1.1.0 이하 빌드에는 expo-updates 가 없어 코드 푸시를 받지 못한다.
- 웹은 지금처럼 Firebase Hosting 배포(코드 푸시와 별개).

## 운동 영상 (media/README.md)

영상은 앱에 넣지 않는다. 버킷에 올리고 앱은 실행 시 `exercise/manifest.json` 을 읽는다 —
영상 추가에 앱 업데이트가 필요 없다. **저장소는 Cloudflare R2(`militarytracker`)** — 옛 GCS 버킷은 옛 빌드용으로 남겨 둔다.
공개 주소는 `src/data/media.ts` 의 `MEDIA_BASE` 한 줄. 지금은 r2.dev(개발용 · 속도 제한) — **출시 전에 커스텀 도메인으로**
(media/README.md "R2 버킷" 6).

```bash
npm run media:upload -- <부위> --dry   # 매칭표 먼저
npm run media:upload -- <부위>         # 인코딩(최대 1280, CRF 18) · R2 업로드 · 매니페스트
npm run media:r2 -- check              # R2 키 · 공개 주소 · CORS 확인
```

- 원본은 `media/originals/<부위>/` (gitignored). **`assets/` 에 두면 git 에 들어간다.**
- 업로드 후 바뀐 `src/data/mediaManifest.json` 은 커밋한다 (오프라인 스냅샷).
- R2 키는 `media/r2.env`(gitignored)에만 — 앱 코드 · `EXPO_PUBLIC_*` 에 넣지 않는다. 앱은 공개 주소(`MEDIA_BASE`)로 읽기만 한다.
- 버킷 CORS(`media/r2-cors.json`)가 없으면 웹이 매니페스트를 못 읽는다. 버킷을 새로 만들면 재적용.

## 주의할 것

- **가로 스크롤러에 `flexGrow: 0` 만 쓰지 말 것.** RN·RN-Web 의 `ScrollView`
  기본 스타일이 `{ flexGrow: 1, flexShrink: 1 }` 이라 `flexShrink: 1` 이 남고,
  같은 컬럼의 세로 리스트에 눌려 잘린다. 반드시 `flexShrink: 0` 을 함께 준다.
- **구독 경계선은 `src/config/entitlements.ts` 의 `PRO_FEATURES` 한 곳**에서 정한다.
  바꿀 때 `functions/src/entitlement.ts` 의 `Feature` 키도 같이 맞춘다.
  판정 로직도 `src/utils/subscription.ts` 와 `functions/src/entitlement.ts` 두 벌이다.
- **`users/{uid}.sub`·`usage`·`role` 은 Cloud Functions 만 쓴다.** 규칙은 이 필드의 추가·수정·**삭제**를
  전부 막는다(`diff().affectedKeys()`). `!('sub' in request.resource.data)` 식 검사는 `deleteField()` 를
  통과시키므로 쓰지 말 것. `users` 문서 삭제도 클라이언트에 없다 — 지우고 다시 만들면 같은 우회가 된다.
  AI 콜러블은 `requirePro` → `consumeQuota` 순서를 지킨다. 화면 잠금은 보조 수단일 뿐이다.
- **`functions/src/index.ts` 에서 `setGlobalOptions` 는 `export … from './subscription'` 보다 위에** 있어야
  sub*/accountDelete 도 리전·maxInstances 를 받는다(CommonJS `require` 는 소스 순서대로 실행된다).
  `subscription.ts` 는 순서에 기대지 않도록 `region`/`maxInstances` 를 따로 명시해 두었다.
- 배포는 **규칙 먼저, 함수 나중**. 순서를 바꾸면 그 사이에 클라이언트가 `sub` 를 쓸 수 있다.
- **Firebase 웹 설정은 `src/config/firebasePublic.ts` 에 커밋돼 있다.** 공개 값이다. `.env` 는 gitignore 라
  EAS 빌드에 실리지 않고, Expo 대시보드 환경변수도 비어 있어 프로덕션 빌드가 죽었었다.
- **`firebase.json` hosting `ignore` 에 `**/node_modules/**` 를 넣지 말 것.** Expo 웹 export 는 벡터 아이콘 폰트를
  `dist/assets/node_modules/...` 에 두는데 그 패턴에 걸려 배포에서 빠지고 탭 아이콘이 전부 깨진다.
- **secret 버전은 배포 시점에 함수에 고정된다.** 최신 버전을 쓸 거라고 가정하지 말 것.
  `functions:secrets:destroy KEY@N` 을 `--force` 없이 먼저 돌려 어떤 함수가 그 버전을
  쓰는지 경고를 읽고, 사용 중이면 함수를 먼저 재배포해 새 버전에 묶은 뒤 지운다.
  `functions:secrets:prune` 는 버전 단위로 정리해 주지 않는다.
  재배포는 소스 해시가 같으면 통째로 건너뛴다("No changes detected") — 바인딩만
  바꾸려면 소스를 한 줄이라도 바꿔야 한다.
