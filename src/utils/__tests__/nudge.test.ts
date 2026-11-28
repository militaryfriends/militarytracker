import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NUDGE_DAYS, NUDGE_HOURS, lockScreenLines, nudgePlan, nudgeTimes } from '../nudge';

test('결석 알림: 끔이면 하나도 없고, 순한맛 · 매운맛은 6단계', () => {
  assert.equal(nudgePlan('off').length, 0);
  assert.equal(nudgePlan('mild').length, NUDGE_DAYS.length);
  assert.equal(nudgePlan('hot').length, NUDGE_DAYS.length);
  assert.deepEqual(nudgePlan('hot').map((n) => n.days), [...NUDGE_DAYS]);
});

test('결석 알림: 문구에 금지어 · 숫자 약속이 없고 한마디가 붙는다', () => {
  for (const level of ['mild', 'hot'] as const) {
    for (const n of nudgePlan(level, '홈 레그')) {
      const all = `${n.title} ${n.body}`;
      assert.ok(!/분석|스캔|근손실|kcal|%/.test(all), all);
      assert.ok(n.body.includes('“') && n.body.includes('”'), n.body);
      assert.ok(n.title.length <= 20, n.title);
    }
  }
  assert.ok(nudgePlan('mild', '홈 레그')[0].body.startsWith('오늘 차례는 홈 레그예요.'));
  assert.ok(nudgePlan('mild', '등')[0].body.startsWith('오늘 차례는 등이에요.'));
  assert.ok(nudgePlan('hot', '레그데이')[0].body.startsWith('오늘 차례는 레그데이입니다.'));
  assert.ok(!nudgePlan('mild')[0].body.startsWith('오늘 차례는'));
  // 순한맛은 해요체 문장으로 끝난다(끊긴 명사형 금지)
  for (const n of nudgePlan('mild', '레그데이')) {
    assert.ok(/요\.$/.test(n.body.split('\n')[0]), n.body);
  }
  // "오늘"이 한 문장에 두 번 나오지 않는다
  for (const n of [...nudgePlan('mild', '레그데이'), ...nudgePlan('hot', '레그데이')]) {
    assert.ok((n.body.match(/오늘/g) ?? []).length <= 1, n.body);
  }
});

test('결석 알림: 작은 폰 잠금화면(한 줄 18자)에서도 본문이 3줄 안 — 4줄째에서 잘리지 않게', () => {
  for (const level of ['mild', 'hot'] as const) {
    for (const day of [undefined, '레그데이', '하체 · 코어 A']) {
      for (const n of nudgePlan(level, day)) {
        assert.ok(lockScreenLines(n.body) <= 3, `${lockScreenLines(n.body)}줄: ${n.body}`);
        assert.ok(lockScreenLines(n.title) <= 1, n.title);
      }
    }
  }
  assert.equal(lockScreenLines('가'.repeat(18)), 1);
  assert.equal(lockScreenLines('가'.repeat(10) + ' ' + '가'.repeat(10)), 2);
});

test('결석 알림: 3일째부터 고른 시각에, 지난 시각은 빼고, 14일째가 마지막', () => {
  const last = new Date(2026, 10, 27, 21, 30, 0).toISOString(); // 11/27 밤 9시 반
  const now = new Date(2026, 10, 27, 22, 0, 0).getTime();
  const times = nudgeTimes(last, 18, now);
  assert.equal(times.length, 6);
  assert.equal(times[0].at.getDate(), 30);
  assert.equal(times[0].at.getHours(), 18);
  assert.equal(times[5].days, 14);
  // 6일 지난 뒤 다시 계산하면 7 · 10 · 14일째만 남는다
  const later = new Date(2026, 11, 3, 12, 0, 0).getTime();
  assert.deepEqual(nudgeTimes(last, 18, later).map((x) => x.days), [7, 10, 14]);
  // 잘못된 시각 문자열
  assert.equal(nudgeTimes('없음', 18, now).length, 0);
});

test('결석 알림: 고를 수 있는 시간은 아침 7시 ~ 저녁 8시 사이', () => {
  for (const h of NUDGE_HOURS) assert.ok(h >= 7 && h <= 20);
});
