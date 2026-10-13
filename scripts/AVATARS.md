# 프리셋 아바타 50장 만들기 (체지방 5 × 근육 5 × 남녀)

베이스 바디 `.blend` 1개(성별당) → 셰이프 키 값만 바꿔 25칸 렌더 → 컨택트 시트로 승인 → WebP 를 앱에 넣는다.

| 파일 | 하는 일 |
|---|---|
| `scripts/render-avatars.py` | .blend → `avatar_{m\|f}_F{1-5}M{1-5}.png`(1080×1620 투명) + `.webp`(720×1080) |
| `scripts/avatar-sheet.py` | 출력 폴더 → `contact_{m\|f}.png` (5×5, 확인 · 승인용) |
| `scripts/avatar-grid.mjs` | `assets/avatars/*.webp` → `src/data/avatarGrid.ts` (정적 require 표) |

## 1. .blend 에 넣을 것 (모델러)

- **몸 메시에 셰이프 키 2개: `fat`, `muscle`** (이름 대소문자 무관, 값 0~1).
  - 기본값: F1~F5 = fat 0 · 0.25 · 0.5 · 0.75 · 1, M1~M5 = muscle 같은 값. **Basis = F1M1(가장 마르고 근육 적은 몸).**
    Basis 를 보통 체형으로 두고 싶으면 키 범위를 -1~1 로 만들고 `--levels -1,-0.5,0,0.5,1`.
  - T포즈(레스트 포즈)에서 조각한다. 셰이프 키는 아마추어보다 먼저 적용된다.
  - 두 키는 더해진다 — **F5M5(둘 다 1)가 깨지지 않는지** 꼭 본다. 필요하면 보정 키를 따로.
  - **키가 바뀌어도 키(height) · 발 위치는 그대로.** 스크립트가 칸마다 발 · 머리 픽셀을 찍는다(`render-log.json`).
- **옷**(남: 무지 반바지 / 여: 스포츠 브라 + 반바지)은 같은 리그에 붙인다. 몸이 커지면 옷도 커져야 하므로
  옷 메시에 **같은 이름의 `fat` · `muscle` 키**를 두면 스크립트가 같은 값으로 같이 움직인다
  (아니면 옷에 Surface Deform 모디파이어로 몸을 따라가게).
- 성별마다 .blend 를 따로 둔다(몸 = Armature 모디파이어가 있는 메시 중 정점이 가장 많은 것. 다르면 `--body`).
- 리그는 Rigify 권장 — A-포즈를 스크립트가 FK 로 잡는다. 얼굴 디테일 없음.
- 카메라 · 조명 · 재질 · 바닥은 신경 쓰지 않아도 된다. 스크립트가 전부 덮어쓰고, **.blend 는 저장하지 않는다**.

## 2. 실행

```bash
# bpy 모듈 (Python 3.13): python3.13 -m venv ~/.venv-bpy && ~/.venv-bpy/bin/pip install bpy pillow
PY=~/.venv-bpy/bin/python

# ① 미리보기 — 360×540 · 8샘플, 25칸 30초 남짓. 프레이밍 · 포즈 · 키 방향 확인
$PY scripts/render-avatars.py -- --blend body_m.blend --sex m --out ~/avatar-renders/m --preview
python3 scripts/avatar-sheet.py ~/avatar-renders/m                 # → ~/avatar-renders/m/contact_m.png

# ② 본 렌더 — 1080×1620 · 64샘플 (CPU 2코어 기준 장당 약 1분). 맥 GPU 면 --gpu
$PY scripts/render-avatars.py -- --blend body_m.blend --sex m --out ~/avatar-renders/m
python3 scripts/avatar-sheet.py ~/avatar-renders/m                 # 승인용 시트 (라이트 바탕: --bg '#F4F4F5')

# ③ 앱에 넣기 (WebP 만. 출력 폴더 · PNG 마스터는 저장소 밖에 둔다 — assets/ 에 두면 git 에 들어간다)
mkdir -p assets/avatars && cp ~/avatar-renders/m/*.webp ~/avatar-renders/f/*.webp assets/avatars/
node scripts/avatar-grid.mjs                          # → src/data/avatarGrid.ts
```

Blender 앱으로도 된다: `/Applications/Blender.app/Contents/MacOS/Blender -b body_m.blend -P scripts/render-avatars.py -- --sex m --out ~/avatar-renders/m`
(앱 파이썬엔 Pillow 가 없어 WebP 는 Blender 저장으로 만든다 — 축소가 조금 거칠다. bpy 모듈 쪽을 권장)

일부 칸만 다시: `--cells F2M4,F3M3` · 끊긴 렌더 이어 하기: `--skip-existing`

## 3. 규칙 (스펙 §4-1)

스크립트가 고정하는 것 — 50장 모두 같다:
- 정면 직교 카메라(`--lens 50` 이면 원근), 발바닥 = 아래 4%, 머리 꼭대기 = 위 6% (키와 상관없이 같은 높이).
  카메라 · 조명은 **중립 몸(키 0)으로 한 번만** 정한다 — 칸마다 바뀌지 않는다.
- A-포즈: 팔과 몸통 15°, 팔꿈치 폄, 손바닥은 허벅지 쪽(엄지 앞). 근육이 많아도 힘주지 않은 같은 포즈.
- 회색 클레이(몸 `#B9B9BB`, 옷 한 톤 어둡게 `#8A8A8D`), 고정 3점 조명(키 · 필 · 림), 투명 배경.

모델러가 지킬 것:
- **단조**: 오른쪽으로 가면 항상 더 지방이 많아 보이고, 위로 가면 항상 더 근육질로 보인다. 거꾸로 보이는 칸이 없게.
- **이웃 칸이 폰 크기(약 120×180pt)에서 구분**된다. 시트를 폰 화면 크기로 줄여 확인.
- **과장 금지** — 조명 · 재질로 근육을 강조하지 않는다(조명은 고정). 형태는 키로만.
- 파일 이름 `avatar_{m|f}_F{1-5}M{1-5}` — F = 체지방(1 가장 마름), M = 근육(1 가장 적음).

## 4. 플래그

| 플래그 | 기본 | 설명 |
|---|---|---|
| `--blend` | — | .blend (Blender `-b <file>` 로 열었으면 생략) |
| `--sex m\|f` · `--out` | 필수 | 파일 이름의 성별 · 출력 폴더 |
| `--fat-key` · `--muscle-key` | `fat` · `muscle` | 키 이름. 없으면 있는 키 목록과 함께 멈춘다 |
| `--levels` | `0,0.25,0.5,0.75,1` | 단계 1~5 의 키 값. 따로: `--fat-levels` · `--muscle-levels` |
| `--allow-missing-keys` | | 키 없이 진행(파이프라인 점검용, 25칸이 같은 몸) |
| `--cells` · `--skip-existing` | 25칸 전부 | 일부 칸만 · 있는 PNG 건너뜀 |
| `--preview` | | 360×540 · 8샘플 · WebP 생략 |
| `--res` · `--samples` | `1080x1620` · 64 | 마스터 해상도 · Cycles 샘플 (디노이즈 켬) |
| `--engine` | `cycles` | `eevee` · `workbench` 도 된다(헤드리스에선 cycles 가 빠르고 깨끗) |
| `--gpu` | | Cycles GPU (Metal/OptiX/CUDA/HIP) |
| `--arm-angle` · `--palms` · `--no-pose` | 15 · `in` | A-포즈 각도 · 손바닥 방향(`keep` = 그대로) · 포즈 안 건드림 |
| `--lens` | 0 | 0 = 직교, 숫자 = 원근 초점거리 mm (가슴 높이 + 시프트) |
| `--margin-top` · `--margin-bottom` | 0.06 · 0.04 | 프레임 높이 대비 여백 |
| `--body-color` · `--cloth-color` · `--sss` · `--exposure` | | 클레이 색 · 서브서피스 · 노출(stop) |
| `--body` · `--clothes` · `--hide` | 자동 | 몸 · 옷 메시 지정, 더 숨길 오브젝트 |
| `--keep-scene-lights` | | .blend 조명 유지(기본: 끄고 3점 조명) |
| `--webp-res` · `--webp-kb` · `--no-webp` | `720x1080` · `60-90` | 상한 KB 이하에서 가장 높은 품질 |

숨기는 것: 몸 리그에 붙지 않은 메시 전부(바닥 · 로고 · 배경판 · `WGT-*`), 기존 카메라 · 조명 · 월드.
`render-log.json`: 칸별 키 값 · 렌더 초 · 발/머리 픽셀 · WebP 품질/용량, 카메라 · 포즈 결과.

## 5. 지금 모델(`Miltary_Friend_Model.blend`) 상태

- 남성만 있다. 셰이프 키 `Key 1`~`Key 15` 는 1~5cm 국소 수정이라 fat/muscle 축이 아니다 → **`fat` · `muscle` 키를 새로 만들어야 한다**.
  그전까지는 `--allow-missing-keys` 로 파이프라인만 점검(또는 `--fat-key "Key 5" --muscle-key "Key 9"` 같은 대역).
- 반바지가 카고 반바지 + 버클 로고라 스펙의 "무지 반바지"와 다르다 — 바꿀지 결정 필요.
- Rigify 리그(`rig.001`): `IK_FK` 를 FK 로 바꾸고 `upper_arm_fk` · `forearm_fk` 를 돌려 A-포즈가 된다(확인됨).
- 1080×1620 · 64샘플 렌더는 CPU 2코어에서 장당 50~60초. WebP 는 품질 100 에서도 약 57KB(상한 90KB 미만이라 품질 100 그대로).
