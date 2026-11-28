import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayNumber, partsOf, pickGuide } from '../guidePick';

const L = [
  { id: 'bench', tags: ['가슴', '삼두'] },
  { id: 'squat', tags: ['하체'] },
  { id: 'tib', tags: ['하체', '맨몸'] },
  { id: 'pull', tags: ['등', '이두'] },
  { id: 'memory', tags: ['상식'] },
];

test('오늘의 가이드: 요일 이름 · 종목 이름에서도 부위를 읽는다', () => {
  assert.deepEqual(partsOf('레그데이 스쿼트 · 레그프레스 · 힌지'), ['하체']);
  assert.deepEqual(partsOf('풀데이 로우 · 랫풀다운 · 케이블'), ['등', '이두']);
  assert.deepEqual(partsOf('푸시데이 벤치 · 인클라인 · 플라이'), ['가슴', '삼두']);
  assert.deepEqual(partsOf('대퇴사두 중심'), ['하체']);
  assert.deepEqual(partsOf('홈 풀'), ['등', '이두', '맨몸']);
  assert.deepEqual(partsOf('풀바디'), ['전신']);
  assert.deepEqual(partsOf('팔굽혀펴기'), ['맨몸']);
  assert.deepEqual(partsOf(undefined), []);
});

test('오늘의 가이드: 하체 날에는 하체 편만, 머리글용 부위를 같이 준다', () => {
  for (let i = 0; i < 10; i++) {
    const p = pickGuide(L, '레그데이 스쿼트 · 레그프레스 · 힌지', new Date(2026, 10, 20 + i));
    assert.ok(p && ['squat', 'tib'].includes(p.guide.id), p?.guide.id);
    assert.equal(p?.part, '하체');
  }
});

test('오늘의 가이드: 맞는 편이 1편뿐이면 매일 같은 영상이 되지 않는다', () => {
  const ids = new Set<string>();
  for (let i = 0; i < 6; i++) ids.add(pickGuide(L, '풀데이 로우', new Date(2026, 10, 20 + i))!.guide.id);
  assert.ok(ids.has('pull'));
  assert.ok(ids.size >= 3, [...ids].join(','));
});

test('오늘의 가이드: 같은 날은 같은 편, 다음 날은 바뀐다, 맞는 부위가 없으면 part 없음', () => {
  const a = pickGuide(L, '스트레칭', new Date(2026, 10, 28, 8));
  const b = pickGuide(L, '스트레칭', new Date(2026, 10, 28, 23));
  const c = pickGuide(L, '스트레칭', new Date(2026, 10, 29, 8));
  assert.equal(a?.guide.id, b?.guide.id);
  assert.notEqual(a?.guide.id, c?.guide.id);
  assert.equal(a?.part, undefined);
  assert.equal(pickGuide([], '하체'), null);
  assert.equal(dayNumber(new Date(2026, 10, 29)) - dayNumber(new Date(2026, 10, 28)), 1);
});
