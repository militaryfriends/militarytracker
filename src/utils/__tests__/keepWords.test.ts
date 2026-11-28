import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepWords, WJ } from '../keepWords';

const show = (s: string) => s.split(WJ).join('|');

test('한글 단어 안은 잇고, 띄어쓰기에서만 끊긴다', () => {
  assert.equal(show(keepWords('오늘은 레그데이 차례예요.')), '오|늘|은 레|그|데|이 차|례|예|요.');
});

test('숫자 · 영문 · % 와 붙은 한글도 한 단어로', () => {
  assert.equal(show(keepWords('3세트를 했어요')), '3|세|트|를 했|어|요');
  assert.equal(show(keepWords('71.2kg · 39.8%')), '71.2kg · 39.8%');
  assert.equal(show(keepWords('체지방 22%까지')), '체|지|방 22%|까|지');
});

test('한글이 없으면 그대로', () => {
  assert.equal(keepWords('MILITARY TRACKER 2027'), 'MILITARY TRACKER 2027');
});
