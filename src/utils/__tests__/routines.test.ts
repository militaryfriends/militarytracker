import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOCUS_GROUPS, FOCUS_ROUTINES, ROUTINES, SPLIT_ROUTINES } from '../../data/routines';
import { exById } from '../../data/exercises';
import { searchRoutines } from '../routineSearch';
import { suggestDay } from '../planAddons';
import type { Plan } from '../../types';

test('루틴: 모든 종목이 종목 사전에 있고, id 가 겹치지 않는다', () => {
  const ids = new Set<string>();
  for (const r of ROUTINES) {
    assert.ok(!ids.has(r.id), `중복 ${r.id}`);
    ids.add(r.id);
    for (const d of r.days) for (const x of d.exIds) assert.ok(exById(x), `${r.id}/${d.id}: 없는 종목 ${x}`);
  }
});

test('루틴: 분할은 메인(5분할 · 푸시풀레그 · 상하체 · 3분할 · 4분할 포함), 부위 집중은 묶음 · 붙일 부위가 있다', () => {
  const splitIds = SPLIT_ROUTINES.map((r) => r.id);
  for (const id of ['ppl', 'ppl6', 'upperlower', 'ul2', 'bro5', 'fullbody', 'home3', 'split3', 'split4']) assert.ok(splitIds.includes(id), id);
  assert.ok(FOCUS_ROUTINES.length >= 30);
  for (const r of FOCUS_ROUTINES) {
    assert.ok(r.group && FOCUS_GROUPS.includes(r.group), `${r.id} 묶음`);
    assert.ok(r.attach && r.attach.length > 0, `${r.id} attach`);
    for (const d of r.days) assert.ok(d.exIds.length >= 2 && d.exIds.length <= 5, `${r.id} 종목 수 ${d.exIds.length}`);
    // 효과를 약속하는 말 금지
    assert.ok(!/커집니다|터지|만들어 드|보장|확실히|빠집니다/.test(`${r.name} ${r.desc}`), `${r.id}: ${r.desc}`);
  }
  for (const g of FOCUS_GROUPS) assert.ok(FOCUS_ROUTINES.some((r) => r.group === g), `빈 묶음 ${g}`);
});

test('검색: 부위 · 종목 이름 · 여러 낱말 · 띄어쓰기 무시', () => {
  const ids = (q: string) => searchRoutines(ROUTINES, q).map((r) => r.id);
  assert.ok(ids('삼두').includes('f-triceps'));
  assert.ok(ids('리버스그립 푸시다운').includes('f-triceps'));
  assert.ok(ids('턱걸이').includes('f-lat-width'));
  assert.ok(ids('초보').length > 0);
  // '팔'이 설명의 '팔꿈치'에 걸리지 않는다
  assert.ok(!ids('팔').includes('f-side-delt'));
  // 효과를 암시하는 꼬리표 금지
  for (const r of ROUTINES) assert.ok(!r.tags.some((t) => ['뱃살', '식스팩', '역삼각형'].includes(t)), r.id);
  assert.ok(ids('등 덤벨').includes('f-db-back'));
  assert.ok(!ids('등 덤벨').includes('f-triceps'));
  assert.ok(ids('5분할').includes('bro5'));
  assert.ok(ids('푸시풀레그').includes('ppl'));
  assert.ok(ids('홈트').includes('f-home-back'));
  assert.equal(ids('').length, ROUTINES.length);
  assert.equal(ids('없는낱말xyz').length, 0);
  // 분할은 얕게(이름 · 부제 · 꼬리표) — 삼두가 들어 있는 분할이 다 걸리지 않는다
  const shallow = searchRoutines(SPLIT_ROUTINES, '삼두', false).map((r) => r.id);
  assert.ok(!shallow.includes('ppl'));
  assert.ok(shallow.includes('split3'));
});

test('붙이기 요일: 푸시풀레그 플랜에서 삼두 → 푸시, 종아리 → 레그, 승모 → 풀', () => {
  const ppl = ROUTINES.find((r) => r.id === 'ppl')!;
  const plan: Plan = { planSrc: 'PRESET', planReason: '', routineId: 'ppl', days: ppl.days.map((d) => ({ id: d.id, name: d.name, focus: d.focus, ids: d.exIds })) };
  const by = (id: string) => suggestDay(plan, FOCUS_ROUTINES.find((r) => r.id === id)! as { attach: string[] });
  assert.equal(by('f-triceps'), 0);
  assert.equal(by('f-calves'), 2);
  assert.equal(by('f-traps'), 1);
  assert.equal(by('f-upper-chest'), 0);
  assert.equal(by('f-biceps'), 1); // 이두 → 풀데이(예전엔 푸시데이로 갔다)
  assert.equal(by('f-forearm'), 1);
});

test('붙이기 요일: 5분할은 팔 날 · 하체 날, 3분할은 등·이두', () => {
  const mk = (id: string): Plan => {
    const r = ROUTINES.find((x) => x.id === id)!;
    return { planSrc: 'PRESET', planReason: '', routineId: id, days: r.days.map((d) => ({ id: d.id, name: d.name, focus: d.focus, ids: d.exIds })) };
  };
  const at = (planId: string, rid: string) => {
    const p = mk(planId);
    return p.days[suggestDay(p, FOCUS_ROUTINES.find((r) => r.id === rid)! as { attach: string[] })].name;
  };
  assert.equal(at('bro5', 'f-triceps'), '팔');
  assert.equal(at('bro5', 'f-biceps'), '팔');
  assert.equal(at('bro5', 'f-arms-all'), '팔');
  assert.equal(at('bro5', 'core'), '하체');
  assert.equal(at('split3', 'f-biceps'), '등·이두');
  assert.equal(at('split4', 'f-arms-all'), '어깨·팔');
});
