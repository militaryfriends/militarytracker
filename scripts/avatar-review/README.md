# 3D 아바타 검수 시트 (P5 — 출시 전 · 모델을 바꿀 때마다)

앱과 같은 장면(`src/components/body/avatar3d/stage.ts` · `morph.ts`)으로 25칸(F1~F5 × M1~M5)과 정면 · 옆 · 뒤(M3)를 찍는다.

```bash
cd scripts/avatar-review
npx esbuild entry.ts --bundle --format=esm --outfile=web/app.js
cp ../../assets/avatar/*.glb ../../assets/avatar/*.jpg web/
echo '<!doctype html><body style="margin:0"><script type="module" src="app.js"></script>' > web/app.html
(cd web && python3 -m http.server 8766 &)
node shots.cjs web out/m male            # out/m_F1M1.png … (주소 쿼리: sex · f · m · yaw · light=1 · head=1)
python3 sheet.py out/m out/sheet_m       # out/sheet_m_grid.png · out/sheet_m_views.png
```

합격 기준(11/1 대표 피드백): 겨드랑이 · 목 · 허리선 찢어짐 · 검은 띠 · 겹침 없음 / F4 · F5 에서 복근 칸 없이 배가 한 덩어리 /
F1 · F5, M1 · M5 를 썸네일로 나란히 놓아도 실루엣으로 구분 / 번들거림 없는 무광 클레이 / 과한 근육 · 과한 선명도 금지.
