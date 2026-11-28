import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subNotices } from '../subNotice';
import { lockScreenLines } from '../nudge';
import type { Subscription } from '../../types';

const base: Subscription = {
  tier: 'pro', status: 'trial', expiresAt: null, source: 'ios', productId: 'pro_monthly', trialUsed: true, updatedAt: '',
};
const now = new Date(2026, 10, 28, 21, 0, 0).getTime(); // 11/28 밤 9시
const at = (m: number, d: number, h = 21) => new Date(2026, m, d, h, 0, 0).toISOString();

test('구독 알림: 무료 체험은 끝나기 7 · 2 · 1일 전 낮 12시, 지난 건 뺀다', () => {
  const long = subNotices({ ...base, expiresAt: at(11, 20) }, now); // 12/20 끝
  assert.deepEqual(long.map((n) => n.key), ['trial-7', 'trial-2', 'trial-1']);
  assert.equal(long[0].at.getDate(), 13);
  assert.equal(long[0].at.getHours(), 12);
  assert.equal(long[2].title, '무료 체험이 내일 끝나요');
  assert.ok(long[0].body.startsWith('12월 20일부터 구독이 이어지고 결제돼요.'));
  // 이틀 남음(11/30 밤 끝) → 7일 전은 이미 지났고, 2일 전(11/28 낮 12시)도 지났다 → 1일 전만
  assert.deepEqual(subNotices({ ...base, expiresAt: at(10, 30) }, now).map((n) => n.key), ['trial-1']);
});

test('구독 알림: 해지 예약은 3 · 1일 전, 결제 말은 하지 않는다', () => {
  const c = subNotices({ ...base, status: 'canceled', expiresAt: at(11, 20) }, now);
  assert.deepEqual(c.map((n) => n.key), ['canceled-3', 'canceled-1']);
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

test('구독 알림: 금액을 쓰지 않고, 작은 폰 잠금화면 3줄 안', () => {
  for (const status of ['trial', 'canceled'] as const) {
    for (const n of subNotices({ ...base, status, expiresAt: at(11, 20) }, now)) {
      assert.ok(!/원|\d+,\d{3}/.test(n.body.replace(/원하지/g, '')), n.body);
      assert.ok(lockScreenLines(n.body) <= 3, `${lockScreenLines(n.body)}줄: ${n.body}`);
      assert.ok(lockScreenLines(n.title) <= 1, n.title);
    }
  }
});
