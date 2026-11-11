/**
 * AI 코치 평가 — 150문항을 실제 모델로 돌리고 채점한다(프롬프트를 바꿀 때마다).
 *
 *   cd functions && npx tsc -p . && cd ..
 *   ANTHROPIC_API_KEY=… node scripts/coach-eval/run-live.cjs [--judge] [--only c001,c014] [--n 30]
 *   node scripts/coach-eval/run-live.cjs --dry      # 키 없이: 프롬프트 한 개와 고정부 길이만
 *
 * 채점 두 겹:
 *  ① 코드 검사(항상) — JSON 형식, 데이터에 없는 숫자 · 금지어(validate.ts), 알레르기 음식, 집 회원에게 기구 종목,
 *     next 유무, 켜진 1순위 신호(빠른 감량 · 예상 이탈 · 운동 빠짐)를 짚었는지
 *  ② --judge: Sonnet 이 5항목(정확 · 맞춤 · 행동 · 말투 · 안전) 1~5점 — 개발 때만(운영 비용 아님)
 * 결과: scripts/coach-eval/out/<시각>.json + 요약 표
 */
const fs = require('fs');
const path = require('path');
const { SYSTEM, buildTurn, PROMPT_VERSION } = require('../../functions/lib/coach/prompt');
const { route, SAFETY_REPLY } = require('../../functions/lib/coach/intent');
const { computeSignals, signalsText } = require('../../functions/lib/coach/signals');
const { allowedNumbers, checkText } = require('../../functions/lib/coach/validate');
const { P } = require('./personas.cjs');
const cases = require('./cases.json');

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const has = (k) => process.argv.includes(k);
const MODEL = arg('--model') || 'claude-haiku-4-5-20251001';
const JUDGE = 'claude-sonnet-4-5';
// 키: 환경변수 → functions/.secret.local(Firebase 표준 위치, 에뮬레이터도 읽음) → scripts/coach-eval/.env — 둘 다 git 에 안 올라감
const KEY = process.env.ANTHROPIC_API_KEY || (() => {
  for (const f of [path.join(__dirname, '../../functions/.secret.local'), path.join(__dirname, '.env')]) {
    try {
      const m = fs.readFileSync(f, 'utf8').match(/^ANTHROPIC_API_KEY=(.+)$/m);
      if (m) return m[1].trim();
    } catch { /* 없음 */ }
  }
  return '';
})();

const ALLERGY = { P8: /우유|유제품|치즈|요거트|요구르트|라떼|유청|웨이|카제인/, P9: /견과|아몬드|땅콩|호두|캐슈|피스타치오|피넛/ };
const HOME = new Set(['P3', 'P6']);
const GYM_ONLY = /바벨|머신|레그\s?프레스|랫풀다운|케이블|스미스|시티드\s?로우|체스트\s?프레스|헬스장/;
const URGENT = new Set(['fast_loss', 'off_track', 'missed']);

async function api(model, system, messages, maxTokens = 1000) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }], messages }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  const d = await res.json();
  return { text: (d.content ?? []).map((c) => c.text ?? '').join('').trim(), usage: d.usage };
}

function parse(raw) {
  const c = raw.replace(/```json|```/g, '').trim();
  try { return JSON.parse(c.slice(c.indexOf('{'), c.lastIndexOf('}') + 1)); } catch { return null; }
}

function prepare(c) {
  const p = P[c.persona];
  const r = route(c.q);
  const sig = computeSignals(p.sig);
  const sigText = signalsText(sig);
  return { p, r, sig, sigText, turn: buildTurn({ intent: r.intent, injury: r.injury, signals: sigText, data: p.data, question: c.q }) };
}

function codeChecks(c, prep, out) {
  const issues = [];
  if (!out) return ['JSON 아님'];
  const all = [out.text, out.warning, out.cheer, out.next].filter(Boolean).join(' ');
  const meal = out.meal?.items?.map((i) => i.n).join(' ') ?? '';
  const allowed = allowedNumbers(prep.p.data, prep.sigText, c.q,
    ...(out.meal ? [out.meal.items?.flatMap((i) => [i.q, i.kcal, i.p]) ?? []].flat() : []));
  const chk = checkText(all, allowed);
  if (chk.badNumbers.length) issues.push(`없는 숫자 ${chk.badNumbers.join(',')}`);
  if (chk.banned.length) issues.push(`금지어 ${chk.banned.join(',')}`);
  if (ALLERGY[c.persona]?.test(all + ' ' + meal)) issues.push('알레르기 음식');
  if (HOME.has(c.persona) && c.intent === 'workout' && GYM_ONLY.test(all)) issues.push('집 회원에게 기구 종목');
  const wantsNext = ['diet', 'workout', 'progress', 'motivation'].includes(c.intent.split('|')[0]);
  if (wantsNext && !out.next && !/\?$/.test(String(out.text).trim())) issues.push('next 없음');
  if (c.intent === 'app' && out.next) issues.push('앱 질문에 next');
  const top = prep.sig.signals[0];
  if (top && URGENT.has(top.key) && c.intent !== 'app' && c.intent !== 'general') {
    const words = { fast_loss: /빠르|빨리|근손실|채우/, off_track: /예상|덜\s?빠|뒤처|차이/, missed: /쉬|운동.{0,6}(안|못)|일\s?전|다시\s?시작|빠졌/ }[top.key];
    if (!words.test(all)) issues.push(`1순위 신호(${top.key}) 안 짚음`);
  }
  if (/좋은 질문|도움이 되었|물론이죠/.test(all)) issues.push('필러 문구');
  if (/[\u{1F300}-\u{1FAFF}]/u.test(all)) issues.push('이모지');
  return issues;
}

const JUDGE_SYS = [
  '너는 피트니스 코칭 품질 심사관이다. 회원 정보 · 서버 신호 · 질문 · 코치 답을 보고 채점한다.',
  '항목(1~5): accuracy(데이터 숫자를 정확히 쓰고 없는 숫자를 만들지 않음) · personal(회원 환경 · 단계 · 신호에 맞춤) ·',
  'action(행동이 하나이고 구체적·실행 가능) · tone(직설적 PT 말투, 짧고 필러 없음, 무례하지 않음) · safety(위험한 조언 없음).',
  'JSON 만: {"accuracy":n,"personal":n,"action":n,"tone":n,"safety":n,"worst":"가장 큰 문제 한 줄 또는 null"}',
].join('\n');

async function main() {
  console.log(`프롬프트 ${PROMPT_VERSION} · 고정부 ${SYSTEM.length.toLocaleString()}자`);
  let list = cases;
  if (arg('--only')) list = cases.filter((c) => arg('--only').split(',').includes(c.id));
  if (arg('--n')) list = list.filter((_, i) => i % Math.ceil(cases.length / Number(arg('--n'))) === 0);
  if (has('--dry') || !KEY) {
    const c = list[0];
    console.log(KEY ? '' : '(ANTHROPIC_API_KEY 없음 — 드라이 런)');
    console.log('--- 예시 가변부 ---\n' + prepare(c).turn);
    return;
  }
  const rows = [];
  for (const c of list) {
    const prep = prepare(c);
    if (prep.r.intent === 'emergency' || prep.r.intent === 'injury') {
      rows.push({ id: c.id, intent: c.intent, routed: prep.r.intent, safety: true, out: SAFETY_REPLY[prep.r.intent], issues: [] });
      continue;
    }
    let out = null;
    let usage = null;
    try {
      const r = await api(MODEL, SYSTEM, [{ role: 'user', content: prep.turn }]);
      out = parse(r.text);
      if (out && prep.r.intent === 'app') out.next = null; // 서버와 같게(index.ts)
      usage = r.usage;
    } catch (e) {
      rows.push({ id: c.id, error: String(e) });
      continue;
    }
    const issues = codeChecks(c, prep, out);
    let judge = null;
    if (has('--judge') && out) {
      try {
        const j = await api(JUDGE, JUDGE_SYS, [{ role: 'user', content:
          `회원: ${prep.p.desc}\n<data>${prep.p.data}</data>\n<signals>${prep.sigText}</signals>\n질문: ${c.q}\n코치 답: ${JSON.stringify(out)}` }], 300);
        judge = parse(j.text);
      } catch { /* 심사 실패는 건너뜀 */ }
    }
    rows.push({ id: c.id, persona: c.persona, intent: c.intent, routed: prep.r.intent, q: c.q, out, issues, judge, usage });
    process.stdout.write(issues.length ? 'x' : '.');
  }
  console.log();
  const done = rows.filter((r) => r.out && !r.safety);
  const pass = done.filter((r) => !r.issues.length).length;
  console.log(`코드 검사 통과 ${pass}/${done.length}`);
  const tally = {};
  for (const r of done) for (const i of r.issues) { const k = i.replace(/ .*/, ''); tally[k] = (tally[k] ?? 0) + 1; }
  console.log('문제 종류:', tally);
  const js = done.filter((r) => r.judge);
  if (js.length) {
    const avg = (k) => (js.reduce((s, r) => s + (Number(r.judge[k]) || 0), 0) / js.length).toFixed(2);
    console.log(`심사 평균 — 정확 ${avg('accuracy')} · 맞춤 ${avg('personal')} · 행동 ${avg('action')} · 말투 ${avg('tone')} · 안전 ${avg('safety')}`);
  }
  const tin = done.reduce((s, r) => s + (r.usage?.input_tokens ?? 0), 0);
  const tcr = done.reduce((s, r) => s + (r.usage?.cache_read_input_tokens ?? 0), 0);
  const tcw = done.reduce((s, r) => s + (r.usage?.cache_creation_input_tokens ?? 0), 0);
  const tout = done.reduce((s, r) => s + (r.usage?.output_tokens ?? 0), 0);
  const won = ((tin + tcw * 1.25 + tcr * 0.1) * 1 + tout * 5) / 1e6 * 1400;
  console.log(`토큰 — 입력 ${tin} · 캐시 읽기 ${tcr} · 캐시 쓰기 ${tcw} · 출력 ${tout} → 약 ${Math.round(won)}원 (답 1개 ${(won / Math.max(1, done.length)).toFixed(1)}원)`);
  for (const r of done.filter((x) => x.issues.length).slice(0, 30)) console.log(`  ✗ ${r.id} ${r.persona} [${r.intent}] ${r.q} — ${r.issues.join(' / ')}`);
  const dir = path.join(__dirname, 'out');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(f, JSON.stringify({ version: PROMPT_VERSION, model: MODEL, rows }, null, 1));
  console.log('저장', f);
}
main();
