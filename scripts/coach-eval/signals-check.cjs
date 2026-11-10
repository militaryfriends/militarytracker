// 신호 엔진이 가상 회원마다 기대한 신호를 켜는지 + 검증기 동작 — API 키 없이: node scripts/coach-eval/signals-check.cjs
const { computeSignals, signalsText } = require('../../functions/lib/coach/signals');
const { checkText, allowedNumbers, stripSentences } = require('../../functions/lib/coach/validate');
const { P } = require('./personas.cjs');
const EXPECT = { P1: ['plateau'], P2: ['pr', 'streak'], P3: ['fast_loss'], P4: ['off_track', 'missed', 'checkin_due'], P5: ['fast_gain'],
  P6: ['no_weight'], P7: ['streak'], P8: ['checkin_due'], P9: [], P10: [] };
const NOT = { P1: ['fast_loss', 'missed'], P2: ['fast_gain', 'plateau'], P9: ['fast_gain', 'missed'], P10: ['plateau', 'fast_loss'] };
let fail = 0;
for (const [k, p] of Object.entries(P)) {
  const r = computeSignals(p.sig);
  const keys = r.signals.map((s) => s.key);
  const miss = (EXPECT[k] ?? []).filter((x) => !keys.includes(x));
  const extra = (NOT[k] ?? []).filter((x) => keys.includes(x));
  const ok = !miss.length && !extra.length;
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${k} ${p.desc}\n   신호: ${keys.join(', ') || '없음'}${miss.length ? `  (빠짐: ${miss})` : ''}${extra.length ? `  (나오면 안 됨: ${extra})` : ''}`);
  if (process.argv.includes('-v')) console.log(signalsText(r).replace(/^/gm, '     '));
}
// 검증기
const allowed = allowedNumbers('하루 목표 2,150kcal (유지 − 500), 단백질 145g', '예상보다 1.2kg');
const t = [
  ['하루 2,150kcal 그대로입니다.', true], ['1,800kcal 로 줄이세요.', false], ['단백질 145g 을 채우세요.', true],
  ['한 달 뒤 5kg 빠집니다.', false], ['3세트 × 10회, 20분 걷기.', true], ['확실히 빠집니다.', false], ['예상보다 1.2kg 덜 빠졌습니다.', true],
];
for (const [s, want] of t) {
  const got = checkText(s, allowed).ok;
  if (got !== want) fail++;
  console.log(`${got === want ? '✓' : '✗'} 검증기 "${s}" → ${got ? '통과' : '걸림'}`);
}
console.log(stripSentences('하루 2,150kcal 입니다. 1,800kcal 로 줄이세요. 걸음 수를 늘리세요.', ['1,800kcal']));
process.exit(fail ? 1 : 0);
