import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachAddon, attachedDay, detachAddon, suggestDay } from '../planAddons';
import type { Plan } from '../../types';

const plan: Plan = {
  routineId: 'ppl',
  planSrc: 'PRESET',
  planReason: '',
  days: [
    { id: 'push', name: '푸시데이', focus: '가슴 · 어깨 · 삼두', ids: ['bench', 'incdbpress', 'pushdown'] },
    { id: 'pull', name: '풀데이', focus: '등 · 이두', ids: ['pullup', 'bbrow'] },
    { id: 'legs', name: '레그데이', focus: '하체 · 코어', ids: ['backsquat', 'legpress', 'calfraise', 'plank'] },
  ],
};
const tri = { rid: 'f-tri', name: '삼두 집중', ids: ['ohropeext', 'pushdown', 'skullcrusher'], attach: ['삼두'] };
const calf = { rid: 'f-calf', name: '종아리', ids: ['calfraise', 'seatedcalf'], attach: ['하체'] };

test('붙이기: 맞는 요일을 고른다(삼두 → 푸시데이, 종아리 → 레그데이, 승모 → 풀데이)', () => {
  assert.equal(suggestDay(plan, tri), 0);
  assert.equal(suggestDay(plan, calf), 2);
  assert.equal(suggestDay(plan, { attach: ['등'] }), 1);
  // 맞는 요일이 없으면 종목이 가장 적은 요일
  assert.equal(suggestDay(plan, { attach: ['전완'] }), 1);
});

test('붙이기: 그날 끝에 더하고, 이미 있는 종목은 다시 넣지 않고, 플랜의 다른 요일 · 요일 수는 그대로', () => {
  const p = attachAddon(plan, 0, tri);
  assert.deepEqual(p.days[0].ids, ['bench', 'incdbpress', 'pushdown', 'ohropeext', 'skullcrusher']);
  assert.deepEqual(p.days[0].addons, [{ rid: 'f-tri', name: '삼두 집중', ids: ['ohropeext', 'skullcrusher'] }]);
  assert.equal(p.days.length, 3);
  assert.deepEqual(p.days[1], plan.days[1]);
  assert.equal(attachedDay(p, 'f-tri'), 0);
  // 같은 묶음을 두 번 붙이면 그대로
  assert.equal(attachAddon(p, 0, tri), p);
  // 원래 플랜은 바뀌지 않는다
  assert.equal(plan.days[0].ids.length, 3);
});

test('떼기: 그 묶음이 더한 종목만 빠지고 원래 종목(pushdown)은 남는다', () => {
  const p = detachAddon(attachAddon(plan, 0, tri), 0, 'f-tri');
  assert.deepEqual(p.days[0].ids, ['bench', 'incdbpress', 'pushdown']);
  assert.equal(p.days[0].addons, undefined);
  assert.equal(attachedDay(p, 'f-tri'), -1);
  // 다 이미 있는 종목뿐이면 붙일 게 없다
  const only = attachAddon(plan, 2, { ...calf, ids: ['calfraise'] });
  assert.equal(only, plan);
});
