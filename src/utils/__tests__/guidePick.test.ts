import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayNumber, pickGuide } from '../guidePick';

const L = [
  { id: 'bench', tags: ['가슴'] },
  { id: 'squat', tags: ['하체'] },
  { id: 'calf', tags: ['하체', '맨몸'] },
  { id: 'memory', tags: ['상식'] },
];

test('오늘의 가이드: 오늘 부위와 맞는 편에서 고른다', () => {
  for (let i = 0; i < 10; i++) {
    const g = pickGuide(L, '하체 · 코어', new Date(2026, 10, 20 + i));
    assert.ok(g && ['squat', 'calf'].includes(g.id), g?.id);
  }
});

test('오늘의 가이드: 맞는 편이 없으면 전체에서, 같은 날은 같은 편, 다음 날은 바뀐다', () => {
  const a = pickGuide(L, '어깨', new Date(2026, 10, 28, 8));
  const b = pickGuide(L, '어깨', new Date(2026, 10, 28, 23));
  const c = pickGuide(L, '어깨', new Date(2026, 10, 29, 8));
  assert.equal(a?.id, b?.id);
  assert.notEqual(a?.id, c?.id);
  assert.equal(pickGuide([], '하체'), null);
  assert.equal(dayNumber(new Date(2026, 10, 29)) - dayNumber(new Date(2026, 10, 28)), 1);
});
