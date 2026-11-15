/**
 * 체형 축(그리기 전용) — 저장값이 좌표에 따라 어떻게 입혀지는지. 숫자 엔진과는 무관하다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { morphFor, shapeAt, xlFor } from '../../components/body/avatar3d/morph';

test('체형을 안 고르면 예전 그림 그대로(undefined)', () => {
  assert.equal(shapeAt('male', undefined, { f: 3, m: 3 }), undefined);
  assert.equal(shapeAt('male', { belly: 0, lower: 0 }, { f: 3, m: 3 }, 20), undefined);
  const a = morphFor('male', { f: 3, m: 3 });
  for (const k of ['belly', 'lower', 'mus_bias', 'shoulder', 'pelvis', 'fat_xl'] as const) assert.equal(a[k], 0);
});

test('뱃살 · 하체 살은 살이 빠지면 같이 줄고, 뼈대 · 근육 분포는 그대로', () => {
  const st = { belly: 1, lower: 0.5, shoulder: 0.8, pelvis: -0.8, musBias: 0.8 };
  const now = shapeAt('male', st, { f: 3.4, m: 2 })!;
  const goal = shapeAt('male', st, { f: 1.8, m: 3 })!;
  assert.equal(now.belly, 1);
  assert.ok(goal.belly! < 0.5 && goal.belly! > 0);
  assert.ok(goal.lower! < now.lower!);
  assert.equal(goal.shoulder, 0.8);
  assert.equal(goal.pelvis, -0.8);
  assert.equal(goal.musBias, 0.8);
  assert.equal(shapeAt('male', { belly: 1 }, { f: 1, m: 3 }), undefined);
});

test('지도 끝을 넘는 체지방은 저장값 없이 체지방률에서 나온다', () => {
  assert.equal(xlFor('male', 28), 0);
  assert.equal(xlFor('male', 33), 0.5);
  assert.equal(xlFor('female', 48), 1);
  assert.equal(shapeAt('male', undefined, { f: 5, m: 2 }, 33)!.xl, 0.5);
  assert.equal(shapeAt('male', undefined, { f: 4, m: 2 }, 24), undefined);
  // 좌표가 끝(5)이 아니면 그리지 않는다
  assert.equal(morphFor('male', { f: 4.5, m: 2 }, { xl: 1 }).fat_xl, 0);
  assert.equal(morphFor('male', { f: 5, m: 2 }, { xl: 0.5 }).fat_xl, 0.5);
});
