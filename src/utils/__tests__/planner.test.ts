/**
 * 자동 루틴 원칙 (2026-11-25 클라이언트 요청)
 *  1. 자동 루틴(정석 템플릿 · 자동 재구성 · AI 맞춤)에는 템플릿 슬롯 후보(+ 신경 쓰이는 부위 보조 종목) 밖의 종목이 들어가지 않는다
 *     — 리버스그립 벤치프레스 같은 보여주기용 변형은 라이브러리 · 자세 가이드에만.
 *  2. 가진 기구로 할 수 없는 종목은 절대 들어가지 않는다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLocalPlan, conformToTemplates, planFromAI, FOCUS_EXTRA } from '../planner';
import { allSlotIds, DANGER } from '../../data/planTemplates';
import { canDo, kitOf } from '../../data/equipment';
import { exById } from '../../data/exercises';
import type { Plan, UserProfile } from '../../types';

const base: UserProfile = {
  sex: 'male', age: '28', height: '175', weight: '72', goal: 'muscle', env: 'gym', days: 4, level: 2,
  food: 'self', allergy: '',
};
const KITS: Record<'gym' | 'home', (string[] | undefined)[]> = {
  gym: [undefined, ['bb', 'db', 'mc', 'cb', 'sm'], ['db', 'mc', 'cb'], ['db'], []],
  home: [undefined, [], ['db'], ['band'], ['bar'], ['bench'], ['db', 'bench'], ['db', 'band', 'bar', 'bench']],
};
const FOCUS = ['chest', 'back', 'shoulders', 'arms', 'abs', 'legs'] as const;

function allowedFor(env: 'gym' | 'home'): Set<string> {
  const s = new Set(allSlotIds(env));
  for (const f of FOCUS) for (const id of FOCUS_EXTRA[f][env]) s.add(id);
  return s;
}

function* profiles(): Generator<UserProfile> {
  for (const env of ['gym', 'home'] as const)
    for (const equip of KITS[env])
      for (const days of [2, 3, 4, 5, 6] as const)
        for (const level of [1, 2, 3] as const)
          for (const goal of ['muscle', 'habit'] as const)
            yield { ...base, env, equip, days, level, goal, focus: [...FOCUS] };
}

function check(plan: Plan, p: UserProfile, what: string) {
  const allowed = allowedFor(p.env);
  const kit = kitOf(p);
  for (const d of plan.days) {
    assert.ok(d.ids.length > 0, `${what}: 빈 데이`);
    assert.equal(new Set(d.ids).size, d.ids.length, `${what}: 같은 날 중복`);
    for (const id of d.ids) {
      const e = exById(id);
      assert.ok(e, `${what}: 없는 종목 ${id}`);
      assert.ok(allowed.has(id), `${what}: 슬롯 밖 종목 ${id}`);
      assert.ok(!DANGER.has(id), `${what}: 위험 종목 ${id}`);
      assert.ok(e!.pl.includes(p.env), `${what}: 장소 밖 ${id}`);
      assert.ok(canDo(id, kit), `${what}: 기구 없음 ${id} (${JSON.stringify(p.equip)})`);
    }
  }
}

test('정석 · 자동 재구성 루틴에 슬롯 밖 종목 · 없는 기구 종목이 없다', () => {
  for (const p of profiles()) {
    const tag = `${p.env} ${JSON.stringify(p.equip)} 주${p.days} Lv${p.level} ${p.goal}`;
    check(buildLocalPlan(p), p, tag);
    for (const seed of [1, 7, 42]) check(buildLocalPlan(p, seed), p, `${tag} seed${seed}`);
  }
});

test('AI 루틴이 슬롯 밖 · 변형 · 없는 기구 종목을 골라도 conformToTemplates 가 되돌린다', () => {
  const sneaky = ['revbench', 'archerpushup', 'plyopushup', 'guillotine', 'behindneckpress', 'dbbench', 'pullup', 'bench'];
  for (const p of profiles()) {
    const ai: Plan = {
      routineId: null, planSrc: 'AI', planReason: '',
      days: buildLocalPlan(p).days.map((d) => ({ ...d, ids: [...sneaky, ...d.ids] })),
    };
    check(conformToTemplates(ai, p), p, `AI ${p.env} ${JSON.stringify(p.equip)} 주${p.days}`);
  }
});

test('AI 응답 검증도 가진 기구 밖 종목을 버린다', () => {
  const p: UserProfile = { ...base, env: 'home', equip: [] };
  const plan = planFromAI({ days: [{ id: 'd1', name: 'A', ids: ['dbbench', 'pushup', 'pullup', 'bwsquat'] }] }, p)!;
  assert.deepEqual(plan.days[0].ids, ['pushup', 'bwsquat']);
});

test('맨몸만인 홈트 — 덤벨 · 턱걸이바 · 벤치 종목이 하나도 없다', () => {
  const p: UserProfile = { ...base, env: 'home', equip: [], days: 3 };
  const ids = buildLocalPlan(p).days.flatMap((d) => d.ids);
  assert.ok(ids.length > 0);
  for (const id of ids) assert.deepEqual(exById(id)!.eq.includes('bw'), true, id);
  assert.ok(!ids.includes('pullup') && !ids.includes('chinup') && !ids.includes('benchdip'));
});

test('기구를 묻기 전 사용자(equip 없음)는 예전과 같은 루틴', () => {
  const gym = buildLocalPlan({ ...base, env: 'gym', days: 5 });
  assert.equal(gym.days[0].ids[0], 'bench');
  const home = buildLocalPlan({ ...base, env: 'home', days: 3 });
  assert.equal(home.days.length, 3);
});
