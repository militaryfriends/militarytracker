/**
 * 평가용 가상 회원 10명 — 신호 엔진 입력(기록 · 체중 · 프로젝트)과 앱이 보내는 <data> 를 함께 만든다.
 * 날짜는 실행 시각 기준으로 거꾸로 만든다(언제 돌려도 같은 신호가 나오게).
 */
const DAY = 86_400_000;
const NOW = Date.now();
const iso = (t) => new Date(t).toISOString();
const kst = (t) => new Date(t + 9 * 3_600_000).toISOString().slice(0, 10);
const ago = (d) => NOW - d * DAY;

/** n일 전부터 매일(또는 every 일마다) 체중 — f(i) 는 그날 체중 */
function weights(days, every, f) {
  const out = [];
  for (let d = days; d >= 0; d -= every) out.push({ date: kst(ago(d)), kg: Math.round(f(days - d) * 10) / 10, createdAt: iso(ago(d)) });
  return out;
}
/** 운동한 날(며칠 전 목록) — 종목 best 는 날마다 조금씩 */
function logs(daysAgo, ex = [['squat', 60, 8], ['bench', 50, 8]], grow = 0) {
  return daysAgo.map((d, n) => ({
    date: kst(ago(d)), createdAt: iso(ago(d)), totalSets: 15,
    exercises: ex.map(([id, w, r]) => ({ id, best: { w: w + grow * (daysAgo.length - n), r } })),
  }));
}
const project = (startDaysAgo, months, phases, startKg, monthly) => ({
  startedAt: iso(ago(startDaysAgo)), months, phases, trackOffset: 0, startWeightKg: startKg,
  track: Array.from({ length: months + 1 }, (_, m) => ({ weightKg: Math.round((startKg + monthly * m) * 10) / 10 })),
});
const exNames = { squat: '스쿼트', bench: '벤치프레스', dead: '데드리프트', pullup: '풀업', pushup: '푸시업', lunge: '런지' };
const week = (n) => Array.from({ length: n }, (_, i) => i);

const P = {
  P1: {
    desc: '남 27 · 176/80 · 감량 3개월째 · 18일 정체 · 헬스장 주4 · 외식',
    data: '사용자: 남 27세, 176cm/80kg, BMI 25.8 (과체중), 계산 체중 80kg, 유지 칼로리 2650kcal, 하루 목표 2150kcal (유지 − 500), 단백질 145g · 탄수 210g · 지방 60g\n목표: 체지방 감량\n환경: 헬스장, 주 4회, 경력 중급, 식사 외식 위주, 알레르기 · 못 먹는 음식 없음\n현재 플랜: A 하체: 스쿼트, 레그 프레스, 런지 / B 상체: 벤치프레스, 랫풀다운, 시티드 로우\n최근 기록: 3세트…\n이번 주 부위별 세트: 가슴 9, 등 9, 어깨 3, 팔 0, 하체 12, 복근 3\n내 변화 프로젝트: 감량 프로젝트(6개월). 목표 체지방 15%, 예상 끝 체중 72kg. 단계: 1~6개월 감량.',
    sig: { targetDays: 4, fallbackPhase: 'cut', logs: logs([1, 2, 4, 8, 9, 11, 12, 15, 16]), weights: weights(18, 1, () => 80.2),
      project: project(80, 6, [{ phase: 'cut', from: 1, to: 6 }], 83, -1.3), lastCheckinAt: iso(ago(25)) },
  },
  P2: {
    desc: '남 22 · 172/64 · 린매스업 순조 · 기록 갱신 · 헬스장 주4',
    data: '사용자: 남 22세, 172cm/64kg, 유지 칼로리 2400kcal, 하루 목표 2650kcal (유지 + 250), 단백질 115g · 탄수 340g · 지방 70g\n목표: 린매스업\n환경: 헬스장, 주 4회, 경력 입문, 식사 직접 요리, 알레르기 · 못 먹는 음식 없음\n현재 플랜: 상체: 벤치프레스, 풀업, 숄더 프레스 / 하체: 스쿼트, 데드리프트, 런지\n이번 주 부위별 세트: 가슴 12, 등 3, 어깨 6, 팔 6, 하체 12, 복근 0\n내 변화 프로젝트: 린매스업(12개월). 예상 끝 체중 68kg. 단계: 1~12개월 린매스업.',
    sig: { targetDays: 4, fallbackPhase: 'gain', logs: logs([0, 2, 3, 5, 7, 9, 10, 12, 14, 16, 17, 19, 21], [['bench', 50, 8], ['squat', 70, 6]], 2.5),
      weights: weights(20, 2, (i) => 63.5 + i * 0.035), project: project(40, 12, [{ phase: 'gain', from: 1, to: 12 }], 63, 0.35), lastCheckinAt: iso(ago(12)) },
  },
  P3: {
    desc: '여 31 · 162/63 · 감량 · 주 1% 넘게 빠짐 · 집 주3',
    data: '사용자: 여 31세, 162cm/63kg, 유지 칼로리 1900kcal, 하루 목표 1520kcal (유지 − 380), 단백질 100g\n목표: 체지방 감량\n환경: 집(홈트), 주 3회, 경력 입문, 식사 직접 요리, 알레르기 · 못 먹는 음식 없음\n현재 플랜: 전신: 스쿼트, 푸시업, 런지, 플랭크\n내 변화 프로젝트: 감량(4개월). 예상 끝 체중 58kg. 단계: 1~4개월 감량.',
    sig: { targetDays: 3, fallbackPhase: 'cut', logs: logs([1, 3, 5, 8, 10, 12], [['squat', 0, 20]]), weights: weights(16, 2, (i) => 65 - i * 0.14),
      project: project(30, 4, [{ phase: 'cut', from: 1, to: 4 }], 65.5, -1.5), lastCheckinAt: null },
  },
  P4: {
    desc: '남 35 · 180/92 · 감량 · 예상보다 +2.5kg · 6일 운동 안 함 · 헬스장 주3',
    data: '사용자: 남 35세, 180cm/92kg, 유지 칼로리 2900kcal, 하루 목표 2350kcal (유지 − 550), 단백질 165g\n목표: 체지방 감량\n환경: 헬스장, 주 3회, 경력 입문, 식사 외식 위주, 알레르기 · 못 먹는 음식 없음\n현재 플랜: 전신 A: 스쿼트, 벤치프레스, 랫풀다운 / 전신 B: 데드리프트, 숄더 프레스, 시티드 로우\n내 변화 프로젝트: 감량(8개월). 예상 끝 체중 82kg. 단계: 1~8개월 감량.',
    sig: { targetDays: 3, fallbackPhase: 'cut', logs: logs([6, 9, 13, 16, 20, 23, 27]), weights: weights(20, 3, (i) => 92.4 - i * 0.01),
      project: project(70, 8, [{ phase: 'cut', from: 1, to: 8 }], 93, -1.4), lastCheckinAt: iso(ago(40)) },
  },
  P5: {
    desc: '여 26 · 165/52 · 린매스업 · 너무 빨리 찜 · 헬스장 주4',
    data: '사용자: 여 26세, 165cm/52kg, 유지 칼로리 2000kcal, 하루 목표 2200kcal (유지 + 200), 단백질 95g\n목표: 린매스업\n환경: 헬스장, 주 4회, 경력 중급, 식사 직접 요리, 알레르기 · 못 먹는 음식 없음\n현재 플랜: 하체 · 엉덩이: 스쿼트, 힙 쓰러스트, 레그 프레스 / 상체: 랫풀다운, 숄더 프레스\n내 변화 프로젝트: 린매스업(10개월). 예상 끝 체중 55kg. 단계: 1~10개월 린매스업.',
    sig: { targetDays: 4, fallbackPhase: 'gain', logs: logs([0, 2, 4, 6, 8, 9, 11, 13, 15]), weights: weights(18, 2, (i) => 51 + i * 0.1),
      project: project(35, 10, [{ phase: 'gain', from: 1, to: 10 }], 50.8, 0.3), lastCheckinAt: iso(ago(7)) },
  },
  P6: {
    desc: '남 19 · 170/58 · 벌크업 입문 · 체중 9일 미기록 · 집 주3',
    data: '사용자: 남 19세, 170cm/58kg, 유지 칼로리 2350kcal, 하루 목표 2850kcal (유지 + 500), 단백질 105g\n목표: 벌크업\n환경: 집(홈트), 주 3회, 경력 입문, 식사 가족과 함께, 알레르기 · 못 먹는 음식 없음\n현재 플랜: 전신: 푸시업, 맨몸 스쿼트, 런지, 플랭크\n내 변화 프로젝트: 벌크업(6개월). 예상 끝 체중 63kg. 단계: 1~6개월 벌크업.',
    sig: { targetDays: 3, fallbackPhase: 'gain', logs: logs([1, 3, 6, 8, 10], [['pushup', 0, 15]]), weights: [{ date: kst(ago(9)), kg: 58, createdAt: iso(ago(9)) }, { date: kst(ago(15)), kg: 57.8, createdAt: iso(ago(15)) }],
      project: project(20, 6, [{ phase: 'gain', from: 1, to: 6 }], 57.6, 0.9), lastCheckinAt: null },
  },
  P7: {
    desc: '남 30 · 175/75 · 프로젝트 없음(습관) · 3주 연속 달성 · 헬스장 주3',
    data: '사용자: 남 30세, 175cm/75kg, 유지 칼로리 2500kcal, 하루 목표 2500kcal (유지 + 0), 단백질 135g\n목표: 운동 습관\n환경: 헬스장, 주 3회, 경력 중급, 식사 외식 위주, 알레르기 · 못 먹는 음식 없음\n현재 플랜: 푸시: 벤치프레스, 숄더 프레스 / 풀: 데드리프트, 풀업 / 레그: 스쿼트, 런지',
    sig: (() => {
      const wd = (new Date(NOW + 9 * 3_600_000).getUTCDay() + 6) % 7;
      const d = [wd + 2, wd + 4, wd + 6, wd + 9, wd + 11, wd + 13, wd + 16, wd + 18, wd + 20];
      return { targetDays: 3, fallbackPhase: 'keep', logs: logs(d, [['dead', 100, 5]]), weights: weights(14, 3, () => 75), project: null, lastCheckinAt: null };
    })(),
  },
  P8: {
    desc: '여 40 · 158/60 · 감량 · 체크인 시기 · 우유 알레르기 · 가족 식사',
    data: '사용자: 여 40세, 158cm/60kg, 유지 칼로리 1750kcal, 하루 목표 1400kcal (유지 − 350), 단백질 95g\n목표: 체지방 감량\n환경: 헬스장, 주 3회, 경력 입문, 식사 가족과 함께, 알레르기 · 못 먹는 음식 우유 · 유제품\n현재 플랜: 전신: 레그 프레스, 랫풀다운, 체스트 프레스\n내 변화 프로젝트: 감량(6개월). 예상 끝 체중 55kg. 단계: 1~6개월 감량.',
    sig: { targetDays: 3, fallbackPhase: 'cut', logs: logs([1, 3, 5, 8, 10, 12, 15]), weights: weights(20, 2, (i) => 60.6 - i * 0.04),
      project: project(31, 6, [{ phase: 'cut', from: 1, to: 6 }], 61.5, -1), lastCheckinAt: null },
  },
  P9: {
    desc: '남 24 · 183/85 · 벌크업 · 견과류 알레르기 · 헬스장 주5',
    data: '사용자: 남 24세, 183cm/85kg, 유지 칼로리 3050kcal, 하루 목표 3450kcal (유지 + 400), 단백질 155g\n목표: 벌크업\n환경: 헬스장, 주 5회, 경력 상급, 식사 직접 요리, 알레르기 · 못 먹는 음식 견과류\n현재 플랜: 가슴 / 등 / 어깨 / 하체 / 팔 5분할\n내 변화 프로젝트: 벌크업(6개월). 예상 끝 체중 90kg. 단계: 1~6개월 벌크업.',
    sig: { targetDays: 5, fallbackPhase: 'gain', logs: logs([0, 1, 2, 3, 5, 7, 8, 9, 10, 12]), weights: weights(14, 2, (i) => 84.6 + i * 0.03),
      project: project(25, 6, [{ phase: 'gain', from: 1, to: 6 }], 84.2, 0.8), lastCheckinAt: null },
  },
  P10: {
    desc: '여 29 · 168/58 · 유지 · 체중 들쑥날쑥 · 헬스장 주3',
    data: '사용자: 여 29세, 168cm/58kg, 유지 칼로리 1950kcal, 하루 목표 1950kcal (유지 + 0), 단백질 100g\n목표: 유지 · 습관\n환경: 헬스장, 주 3회, 경력 중급, 식사 외식 위주, 알레르기 · 못 먹는 음식 없음\n현재 플랜: 상체 / 하체 / 전신',
    sig: { targetDays: 3, fallbackPhase: 'keep', logs: logs([2, 4, 7, 9, 11]), weights: weights(14, 1, (i) => 58 + (i % 3 === 0 ? 0.8 : -0.3)), project: null, lastCheckinAt: null },
  },
};
for (const p of Object.values(P)) p.sig = { now: NOW, exNames, ...p.sig };
module.exports = { P, NOW };
