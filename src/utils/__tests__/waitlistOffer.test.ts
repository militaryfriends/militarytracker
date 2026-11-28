/**
 * 대기자 혜택(2026-11-28 — 결제 수단을 등록해야 무료 기간 시작) — 앱 · 서버 사본이 같은 답을 내는지,
 * 구독 값 정리(normalizeSub)가 새 자격(eligible · waitlistDays)을 지키는지.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offerOf, parseOfferCodes, waitlistOffer, OFFER_LABEL, OFFER_TAG } from '../waitlistOffer';
import * as server from '../../../functions/src/offerPure';
import { normalizeSub } from '../subscription';

test('명단 일수 → 혜택: 90 = 3개월, 30 = 1개월, 모르면 3개월', () => {
  assert.equal(offerOf(90), 'm3');
  assert.equal(offerOf(30), 'm1');
  assert.equal(offerOf(60), 'm3');
  assert.equal(offerOf(59), 'm1');
  assert.equal(offerOf(undefined), 'm3');
  assert.equal(OFFER_LABEL[offerOf(30)], '1개월');
  assert.equal(OFFER_TAG.m3, 'waitlist-3m');
});

test('앱 · 서버 offerOf 가 같은 답', () => {
  for (const d of [undefined, null, 0, 1, 7, 29, 30, 31, 59, 60, 61, 90, 120, 400]) {
    assert.equal(offerOf(d), server.offerOf(d), `days=${d}`);
  }
});

test('오퍼 코드 목록 읽기 — 머리글 · 중복 · 짧은 낱말은 빠진다', () => {
  const csv = 'Offer Code,Reference\nAB12CD34EF56GH78,waitlist\nAB12CD34EF56GH78,waitlist\n"ZXCV9876ASDF5432"\nshort,SHORT1\nlower12345678';
  const want = ['AB12CD34EF56GH78', 'ZXCV9876ASDF5432'];
  assert.deepEqual(parseOfferCodes(csv), want);
  assert.deepEqual(server.parseOfferCodes(csv), want);
  assert.deepEqual(server.parseOfferCodes(['AB12CD34EF56GH78', 'QWER1234TYUI5678']), ['AB12CD34EF56GH78', 'QWER1234TYUI5678']);
});

test('App Store 코드 사용 주소 — 앱 id 와 코드가 들어간다', () => {
  const u = server.redeemUrl('AB12CD34EF56GH78');
  assert.equal(u, 'https://apps.apple.com/redeem?ctx=offercodes&id=6827046995&code=AB12CD34EF56GH78');
});

test('normalizeSub 가 무료 자격을 지킨다 · 깨진 값은 버린다', () => {
  const ok = normalizeSub({ tier: 'free', status: 'none', waitlist: 'eligible', waitlistDays: 30 });
  assert.equal(ok.waitlist, 'eligible');
  assert.equal(ok.waitlistDays, 30);
  assert.equal(waitlistOffer(ok), 'm1');
  const bad = normalizeSub({ waitlist: 'yes', waitlistDays: -3 });
  assert.equal(bad.waitlist, undefined);
  assert.equal(bad.waitlistDays, undefined);
  assert.equal(normalizeSub({ waitlistDays: '90' }).waitlistDays, undefined);
  assert.equal(normalizeSub({ waitlistDays: Number.NaN }).waitlistDays, undefined);
});

test('무료 자격은 eligible 일 때만 — 이미 시작했거나 명단에 없으면 없음', () => {
  assert.equal(waitlistOffer(normalizeSub({ waitlist: 'eligible' })), 'm3');
  assert.equal(waitlistOffer(normalizeSub({ waitlist: 'claimed', waitlistDays: 90 })), null);
  assert.equal(waitlistOffer(normalizeSub({ waitlist: 'none' })), null);
  assert.equal(waitlistOffer(null), null);
});
