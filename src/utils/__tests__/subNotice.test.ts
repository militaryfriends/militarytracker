import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deadlineLabel, subNotices } from '../subNotice';
import { lockScreenLines } from '../nudge';
import type { Subscription } from '../../types';

const base: Subscription = {
  tier: 'pro', status: 'trial', expiresAt: null, source: 'ios', productId: 'pro_monthly', trialUsed: true, updatedAt: '',
};
const now = new Date(2026, 10, 28, 21, 0, 0).getTime(); // 11/28 밤 9시
const at = (m: number, d: number, h = 21) => new Date(2026, m, d, h, 0, 0).toISOString();

test('구독 알림: 무료 체험은 해지 마감(끝나기 24시간 전) 기준 — 7일 전 · 이틀 전 낮 12시 · 마감 3시간 전', () => {
  const n = subNotices({ ...base, expiresAt: at(11, 20, 21) }, now); // 12/20 밤 9시 끝 → 마감 12/19 밤 9시
  assert.deepEqual(n.map((x) => x.key), ['trial-7', 'trial-2', 'trial-last']);
  assert.equal(n[0].at.getDate(), 12);
  assert.equal(n[1].at.getDate(), 17);
  assert.equal(n[1].at.getHours(), 12);
  // 마감 3시간 전 = 12/19 오후 6시
  assert.equal(n[2].at.getDate(), 19);
  assert.equal(n[2].at.getHours(), 18);
  assert.equal(n[2].title, '오늘이 무료 체험 해지 마감이에요');
  assert.ok(n[0].body.startsWith('12월 19일 오후 9시까지 해지하지 않으면'), n[0].body);
  // 모든 알림은 마감 전에 울린다
  const deadline = Date.parse(at(11, 20, 21)) - 24 * 3_600_000;
  for (const x of n) assert.ok(x.at.getTime() < deadline, x.key);
});

test('구독 알림: 마감이 이른 아침이면 마지막 알림은 전날 저녁 8시, 제목은 "내일이"', () => {
  const n = subNotices({ ...base, expiresAt: at(11, 20, 9) }, now); // 마감 12/19 오전 9시 → 3시간 전 = 새벽 6시
  const last = n.find((x) => x.key === 'trial-last')!;
  assert.equal(last.at.getDate(), 18);
  assert.equal(last.at.getHours(), 20);
  assert.equal(last.title, '내일이 무료 체험 해지 마감이에요');
});

test('구독 알림: 7일 체험(남은 기간 9일 이하)은 일주일 전 알림을 빼고, 지난 시각도 뺀다', () => {
  const n = subNotices({ ...base, expiresAt: at(11, 5, 21) }, now); // 7일 남짓 남음
  assert.ok(!n.some((x) => x.key === 'trial-7'));
  assert.ok(n.some((x) => x.key === 'trial-last'));
});

test('구독 알림: 해지 예약은 3 · 1일 전, 결제 말은 하지 않고 "사흘 뒤"로 쓴다', () => {
  const c = subNotices({ ...base, status: 'canceled', expiresAt: at(11, 20) }, now);
  assert.deepEqual(c.map((n) => n.key), ['canceled-3', 'canceled-1']);
  assert.equal(c[0].title, '구독이 사흘 뒤 끝나요');
  for (const n of c) assert.ok(!/결제/.test(n.body), n.body);
});

test('구독 알림: 구독 중 · 관리자 · 프로모 · 무기한 · 이미 끝남은 부르지 않는다', () => {
  assert.equal(subNotices({ ...base, status: 'active', expiresAt: at(11, 20) }, now).length, 0);
  assert.equal(subNotices({ ...base, status: 'grace', expiresAt: at(11, 20) }, now).length, 0);
  assert.equal(subNotices({ ...base, source: 'admin', expiresAt: at(11, 20) }, now).length, 0);
  assert.equal(subNotices({ ...base, source: 'promo', expiresAt: at(11, 20) }, now).length, 0);
  assert.equal(subNotices({ ...base, expiresAt: null }, now).length, 0);
  assert.equal(subNotices({ ...base, expiresAt: at(10, 1) }, now).length, 0);
  assert.equal(subNotices(null, now).length, 0);
});

test('구독 알림: 금액 없음, 작은 폰 잠금화면 3줄 안, 마감 시각 표기', () => {
  assert.equal(deadlineLabel(new Date(2026, 11, 19, 21, 0)), '12월 19일 오후 9시');
  assert.equal(deadlineLabel(new Date(2026, 11, 19, 0, 30)), '12월 19일 오전 12시 30분');
  for (const status of ['trial', 'canceled'] as const) {
    for (const n of subNotices({ ...base, status, expiresAt: at(11, 20) }, now)) {
      assert.ok(!/\d+원|\d+,\d{3}/.test(n.body), n.body);
      assert.ok(lockScreenLines(n.body) <= 3, `${lockScreenLines(n.body)}줄: ${n.body}`);
      assert.ok(lockScreenLines(n.title) <= 1, n.title);
    }
  }
});
