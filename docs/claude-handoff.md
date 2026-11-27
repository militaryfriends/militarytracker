# 인계 — `claude/visual-fix` 브랜치 (2026-11-27 저녁 기준)

노트북 Claude Code(Remote Control)가 이 문서 하나로 이어받을 수 있게 쓴다. 규칙은 루트 `CLAUDE.md` 맨 위 "Claude 작업 규칙"이 우선이다.

## 1. 지금 상태 한눈에

| 어디 | 상태 |
|---|---|
| 브랜치 `claude/visual-fix` | 아래 2절 전부 들어 있음. **main 에는 아직 병합 안 함** |
| 웹 미리보기 | https://military-tracker-96bdd--visual-ovw2ri5l.web.app (채널 `visual`, 12/10 만료) — 브랜치 최신(패치 09)까지 반영 |
| 운영 Firestore 규칙 | 11/27 00:18 대표 승인 후 콘솔에서 게시 — 이 브랜치의 `firestore.rules` 와 같다(`projects.size() <= 4` 포함) |
| 운영 서버 함수(Functions) | **옛 엔진 그대로**. 이 브랜치의 엔진 변경은 함수 배포 전까지 '실제로 시작되는 프로젝트'에 안 들어간다 |
| 앱(OTA · 스토어) | 옛 버전. production 채널 마지막 업데이트 d9fbd88 |

미리보기도 **운영 Firestore · Functions 를 쓴다** — 미리보기에서 '프로젝트 시작'을 누르면 진짜 데이터가 생기고, 서버는 옛 엔진으로 계산한다(그래서 카드는 6개월인데 시작된 프로젝트는 3개월).

## 2. 브랜치에 들어간 것 (main 대비)

화면
- 포인트 색 빨강 → 라벤더(`src/theme/palette.json` 의 `red*` 토큰 값만 바꿈 — 이름은 그대로). 탭 아이콘 직접 그린 SVG(`src/components/TabIcons.tsx`). "DAY" → "일차". 온보딩 "STEP n / 13" → "n / 13", "MY ›" → "내 몸 ›".
- 남녀 아바타 교체(남 확정 자세, 여 r59) — `assets/avatar/*`.
- 카드 설명 넘침 수정(`ProjectCard` how 2줄 · reason 3줄), "첫 달 ±Xkg" 줄.
- **다음 몸**(`src/components/body/NextBody.tsx`): 진행 중 프로젝트가 끝난 몸에서 다시 계산한 다음 카드. 끝 몸 칸이 지금과 같으면 칸이 바뀌는 카드를 먼저.
- **내 목표로 정하기**(`src/components/body/TargetPanel.tsx`): 몸무게로 / 기간으로(3 · 6 · 9 · 12개월). 고른 뒤 값을 바꾸면 선택도 따라간다.
- 허리-체중 모순 안내(`waistMismatch`, 막지 않음). 15세 이상(앱 · 서버 함수 `sanitizeInput`).
- 성별이 바뀌면 맞춘 체형(`profile.bodyShape`) 초기화. 내 몸 맞추기를 새로 열 때 저장값 대신 '보통'이 보이던 문제 수정(`app/project/fit.tsx`).
- 결과 화면 '근육' → '근육량'(적은 편 · 보통 · 많은 편 · 많음 · 아주 많음).

엔진(`src/utils/*` = `functions/src/engine/*` 두 벌)
- 감량 카드 = 감량 n개월 + 고정 3개월(체중 고정), 증량 카드 최소 6개월. `planTarget` 도 최소 6개월(짧은 감량은 고정을 늘림, `keepFor`).
- 날짜만 정한 감량은 최대 감량 카드 목표(F2 가운데)에서 멈춤. 날짜가 넉넉하면 근육 유지 감량으로.
- 감량 중 제지방 손실(Forbes 몫 × `LEAN_LOSS_SHARE` 0.5). 여성 근육 칸 +0.9(키 기준 1.65m).
- 칼로리 바닥(기초대사량 · 남 1,500 · 여 1,200)에 걸리면 실제로 낼 수 있는 속도로 그린다(`achievableCutRate`). 최대 감량이 근육 유지 감량과 같아지면 흐림, 뺄 여유가 없으면 린매스업 추천.
- 벌크업 잉여 하한 250(린매스업 150과 같은 칼로리로 보이던 문제). 단백질 기준 체중 = min(체중, BMI 27 체중). 홈 맨몸 빈 날 채움. 체지방 하한 클램프.

점검
- `scripts/overnight-check.ts` — 몸 23,328조합 × 카드 · 내 목표 · 다음 몸 · 루틴 540개를 규칙으로 검사. `npm run check:overnight` / `npm run check:overnight:real`(BMI 18.5 이상만).
- 현재 결과: 현실 범위 19,440조합 중 **15건**(15세 · 145~152cm · BMI 25 여성이 근육 M5) — 알고 있는 남은 것. 이 숫자가 늘면 회귀다.

## 3. 다음 할 일 (대표 결정이 필요한 순서)

1. **서버 함수 배포 + OTA 를 같은 날** — 함수만 먼저 바꾸면 옛 앱 사용자는 카드엔 3개월이 보이는데 6개월이 시작되는 반대 문제가 생긴다.
   순서: (규칙은 이미 됨) → `npm run deploy:functions` → OTA preview 채널에서 확인 → production. **전부 대표 OK 후.**
2. main 병합 — PR 을 만들어 선웅이형이 본다(엔진 · 규칙 · functions 가 바뀌었으니 리뷰 필수).
3. 선웅이형 전달: main `firestore.rules` 도 `<= 4`(병합하면 해결), 엔진 보정 3가지(제지방 손실 · 여성 칸 · 칼로리 바닥).
4. 남은 일: 여자 아바타 모델 자체(허리-골반 비율 · 자세 · 조명 — 블렌더 작업), 첫 방문 3D 지연(정지 이미지), 홈 카드 배치, 프로 잠금 UI, 위 15건.

## 4. 검증 루틴 (엔진이나 카드 화면을 건드렸으면 매번)

```bash
npm run engine:sync           # src/utils → functions/src/engine 복사
npm test                      # 동기 확인 + 예시 A~E + 단위 테스트
npm run check:overnight:real  # 전수 점검(현실 범위) — 15건이 기준
npx tsc --noEmit              # 앱 타입
npm --prefix functions run build   # 서버 함수 타입
```

## 5. 미리보기 배포

- 브랜치에 push → GitHub Actions "웹 미리보기 배포" 를 branch `claude/visual-fix`, channel `visual` 로 실행.
  `gh` 가 있으면 `gh workflow run preview.yml --ref claude/visual-fix -f channel=visual`.
- 페이지가 브라우저에 **1시간 캐시**된다. 확인할 땐 주소 뒤에 `?v=숫자`.
- 워크플로의 `patches/*.b64` 적용 단계는 클라우드(git push 불가) 우회용이었다. 노트북에서는 그냥 push 하면 된다(단계는 남겨둬도 무해).

## 6. 주의

- Windows 에서 `firebase deploy --only functions` 의 predeploy(`npm --prefix "$RESOURCE_DIR" run build`)가 CMD/PowerShell 에서 `$RESOURCE_DIR` 를 못 풀어 실패할 수 있다 → Git Bash 에서 실행하거나, `npm --prefix functions run build` 를 먼저 돌린 뒤 배포.
- 비밀번호 · 키 · 토큰은 Claude 가 입력하지 않는다. 로그인(gh · firebase · eas)은 대표가 직접. 서비스 계정 키 내용은 출력하지 않는다.
- 대표 계정 프로필은 테스트용(여 · 176cm · 68kg · 허리 70). 남자 때 맞춘 체형 값이 남아 있으면 '내 몸 맞추기 › 전부 보통으로 › 저장'.
- 진행 중 테스트 프로젝트(근육 유지 감량 3개월)는 옛 서버 엔진으로 시작된 것.

## 7. 파일 지도

- 엔진: `src/utils/{bodyComp,projection,bodyAnalysis,planner,body}.ts` → `functions/src/engine/*`(복사본)
- 서버 프로젝트 시작: `functions/src/index.ts`(bodyProjectStart · planTarget 호출) · `functions/src/bodyProject.ts`(sanitizeInput)
- 카드 · 결과 화면: `app/project/{index,compare,analysis,fit,start}.tsx`
- 몸 컴포넌트: `src/components/body/{ProjectCard,TargetPanel,NextBody,MyBodyCard,AvatarView,format}.tsx`, 3D 모프 `avatar3d/morph.ts`
- 온보딩: `src/components/onboard/*`
- 기록(claude.ai 프로젝트 문서): 63 브랜치 작업기록, 64 전수 점검 보고(11/27 저녁 추가분 포함)
