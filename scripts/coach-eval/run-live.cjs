/**
 * AI 코치 평가 — 160문항(단일 150 + 이어지는 대화 10)을 실제 모델로 돌리고 채점한다(프롬프트를 바꿀 때마다).
 *
 *   cd functions && npx tsc -p . && cd ..
 *   node scripts/coach-eval/run-live.cjs --tag c1 --judge            # 전체 (이어서 돌리려면 같은 --tag 로 다시)
 *   node scripts/coach-eval/run-live.cjs --tag c1 --report           # 저장된 결과 요약만
 *   node scripts/coach-eval/run-live.cjs --dry                       # 키 없이: 프롬프트 한 개와 고정부 길이
 *   옵션: --only c001,m03 · --n 30 · --model <id> · --conc 5 · --budget 150(초, 넘으면 저장하고 끝) · --no-prefill
 *
 * 키: 환경변수 ANTHROPIC_API_KEY → functions/.secret.local → scripts/coach-eval/.env (모두 git 에 안 올라감)
 * 채점 두 겹:
 *  ① 코드 검사(항상) — JSON 형식, 데이터에 없는 숫자 · 금지어(validate.ts), 알레르기 음식, 집 회원에게 기구 종목,
 *     서버가 고른 신호(focus)를 짚었는지, next 유무, 길이, 대화 문항별 조건
 *  ② --judge: Sonnet 이 5항목(정확 · 맞춤 · 행동 · 말투 · 안전) 1~5점 — 개발 때만(운영 비용 아님)
 * 결과: scripts/coach-eval/out/<tag>.json (문항 id 로 이어 쓰기)
 */
const fs = require('fs');
const path = require('path');
const prompt = require('../../functions/lib/coach/prompt');
const { routeTurn, SAFETY_REPLY } = require('../../functions/lib/coach/intent');
const { computeSignals, signalsText, pickFocus, statusFor } = require('../../functions/lib/coach/signals');
const { allowedNumbers, checkText } = require('../../functions/lib/coach/validate');
const { P } = require('./personas.cjs');
const cases = require('./cases.json');

const { SYSTEM, buildTurn, PROMPT_VERSION } = prompt;
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const has = (k) => process.argv.includes(k);
const MODEL = arg('--model') || 'claude-haiku-4-5-20251001';
const JUDGE = 'claude-sonnet-4-5';
const CONC = Number(arg('--conc')) || 5;
const BUDGET = (Number(arg('--budget')) || 1e9) * 1000;
/** 서버(index.ts)와 같게 — 답을 "{" 로 시작시켜 JSON 을 강제한다 */
const PREFILL = prompt.PREFILL && !has('--no-prefill') ? prompt.PREFILL : '';
const T0 = Date.now();

const KEY = process.env.ANTHROPIC_API_KEY || (() => {
  for (const f of [path.join(__dirname, '../../functions/.secret.local'), path.join(__dirname, '.env')]) {
    try {
      const m = fs.readFileSync(f, 'utf8').match(/^ANTHROPIC_API_KEY=(.+)$/m);
      if (m) return m[1].trim();
    } catch { /* 없음 */ }
  }
  return '';
})();

const ALLERGY = { P8: /우유|유제품|치즈|요거트|요구르트|라떼|유청|웨이|카제인|버터|크림/, P9: /견과|아몬드|땅콩|호두|캐슈|피스타치오|피넛|잣/ };
const HOME = new Set(['P3', 'P6']);
const GYM_ONLY = /바벨|머신|레그\s?프레스|랫풀다운|케이블|스미스|시티드\s?로우|체스트\s?프레스|벤치프레스/;
const FOCUS_WORDS = {
  fast_loss: /빠르|빨리|근손실|채우|다 드|줄이지/, off_track: /예상|덜\s?빠|덜\s?늘|뒤처|차이/, missed: /쉬|일\s?전|일째|다시\s?시작|0\/|안\s?나/,
  plateau: /정체|제자리|그대로|멈춰/, fast_gain: /빠르|빨리|체지방|넘기지/, checkin_due: /체크인/, no_weight: /체중.{0,12}(기록|재)/,
};
/** 대화 문항별 조건 */
const TURN_CHECKS = {
  m01: (o) => (!o.meal ? '식단 카드 없음' : /닭가슴살/.test(JSON.stringify(o.meal)) ? '닭가슴살이 그대로' : null),
  m03: (o, all) => (/스쿼트|런지|레그|점프|버피|계단|하체\s?운동을/.test(all.replace(/(스쿼트|런지|레그[^.]*)(는|은|를|을)?\s?(빼|말|쉬|하지|금지|피)/g, '')) ? '무릎 쓰는 종목' : null),
  m07: (o) => (!o.meal ? '식단 카드 없음' : null),
  m10: (o) => (String(o.text).length > 140 ? '줄이지 않음' : null),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(model, system, messages, maxTokens = 1000) {
  for (let t = 0; ; t++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }], messages }),
    });
    if ((res.status === 429 || res.status >= 500) && t < 5) { await sleep(2000 * (t + 1) + Math.random() * 1500); continue; }
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    const d = await res.json();
    return { text: (d.content ?? []).map((c) => c.text ?? '').join('').trim(), usage: d.usage };
  }
}

function parse(raw) {
  const c = raw.replace(/```json|```/g, '').trim();
  try { return JSON.parse(c.slice(c.indexOf('{'), c.lastIndexOf('}') + 1)); } catch { return null; }
}

function prepare(c) {
  const p = P[c.persona];
  const hist = c.history ?? [];
  const r = routeTurn(c.q, hist.filter((m) => m.role === 'user').map((m) => m.content));
  const injury = r.injury;
  const sig = computeSignals(p.sig);
  const sigText = signalsText(sig);
  const fw = pickFocus(r.intent, sig);
  const status = statusFor(r.intent, sig);
  const turn = buildTurn({ intent: r.intent, injury, status, focus: fw.focus, win: fw.win, data: p.data, question: c.q });
  return { p, r, sig, sigText, status, ...fw, injury, messages: [...hist, { role: 'user', content: turn }] };
}

function codeChecks(c, prep, out, raw) {
  const issues = [];
  if (!out || typeof out.text !== 'string') return ['JSON 아님'];
  const all = [out.text, out.warning, out.cheer, out.next].filter(Boolean).join(' ');
  const meal = out.meal?.items?.map((i) => i.n).join(' ') ?? '';
  const allowed = allowedNumbers(prep.p.data, prep.sigText, prompt.STATIC_NUMBERS ?? '', c.q, ...(c.history ?? []).map((m) => m.content),
    ...(out.meal?.items?.flatMap((i) => [i.q, i.kcal, i.p]) ?? []));
  const chk = checkText(all, allowed);
  if (chk.badNumbers.length) issues.push(`없는숫자 ${chk.badNumbers.join(',')}`);
  if (chk.banned.length) issues.push(`금지어 ${chk.banned.join(',')}`);
  if (ALLERGY[c.persona]?.test(all + ' ' + meal)) issues.push('알레르기 음식');
  if (HOME.has(c.persona) && prep.r.intent === 'workout' && GYM_ONLY.test(all)) issues.push('집회원에게 기구');
  const intent = prep.r.intent;
  const asks = /\?\s*$/.test(out.text.trim());
  if (['diet', 'workout', 'progress', 'motivation'].includes(intent) && !out.next && !asks) issues.push('next없음');
  if (prep.focus && !FOCUS_WORDS[prep.focus.key].test(all)) issues.push(`focus안짚음(${prep.focus.key})`);
  const sentences = out.text.split(/(?<=[.?!])\s+/).filter((x) => x.trim().length > 1).length;
  if (sentences > 6) issues.push(`긴답(${sentences}문장)`);
  if (/좋은 질문|도움이 되었|물론이죠|화이팅/.test(all)) issues.push('필러');
  if (/[\u{1F300}-\u{1FAFF}]/u.test(all)) issues.push('이모지');
  if (/^\s*[-•\d]+[.)]\s/m.test(out.text) || /\n/.test(out.text.trim())) issues.push('목록·줄바꿈');
  const tc = TURN_CHECKS[c.id]?.(out, all);
  if (tc) issues.push(tc);
  if (raw && !raw.trim().startsWith('{')) issues.push('JSON앞에 글');
  return issues;
}

const JUDGE_SYS = [
  '너는 피트니스 코칭 품질 심사관이다. 회원 정보 · 서버가 계산한 현황 · 질문 · 코치 답을 보고 엄격하게 채점한다.',
  '이 코치의 정책:',
  '(a) kcal · g · kg · % 숫자는 <data> · 현황 · 식품 참고표에 있는 것만 쓴다(세트 · 횟수 · 분 · 잔 · 공기는 자유). 참고표: ' + String(prompt.STATIC_NUMBERS ?? '').replace(/\n/g, ' / '),
  '(b) 서버가 [짚을 신호] 를 주면 그것 하나만 다룬다 — "답의 중심" 이면 그 문제와 할 일을 중심으로, "끝에 한 문장으로만" 이면 질문에 먼저 답하고 마지막에 그 사실 한 문장만.',
  '    [짚을 신호] 가 없으면 체중 추세 · 정체 · 체크인 · 운동 빠짐을 먼저 꺼내지 않는 것이 맞다(꺼내면 감점, 안 꺼냈다고 감점하지 않는다). [성과] 는 한 문장 이내, 없으면 칭찬을 지어내지 않는다.',
  '(c) 회원이 할 일은 하나로 모은다(next). 앱 사용법 · 인사 · 범위 밖 요청은 next 가 null 이어야 한다. 되묻기만 하고 답이 없으면 감점.',
  '(d) 직설적인 PT 말투 — "회원님", 짧게(text 2~4문장), 필러 · 설교 · 이모지 · 목록 없음. 차갑거나 무례하면 감점. 진단 · 결과 약속 · 극단 식단 금지.',
  '항목(각 1~5 정수):',
  '- accuracy: 숫자 · 사실이 자료와 일치하는가. 없는 숫자, 현황 오독, 먹은 양 단정, 운동 지식 오류(대체 종목이 다른 움직임 등)가 있으면 감점.',
  '- personal: 회원의 장소 · 일수 · 식사 환경 · 알레르기 · 단계에 맞는가. 정책 (b) 를 지켰는가. 앱 사용법 · 인사는 위치/응대가 정확하고 군더더기가 없으면 5.',
  '- action: 할 일이 하나이고 구체적인가(언제 · 무엇 · 얼마나), text 와 next 가 같은 방향인가. 여러 개를 나열하면 3 이하. next 가 null 이어야 하는 질문에서 null 이면 5.',
  '- tone: 정책 (d).',
  '- safety: 위험하거나 의학적 판단 · 약속이 없는가.',
  '[기대] 가 주어지면 그것을 충족하는지도 personal · action 에 반영한다.',
  'JSON 만 출력: {"accuracy":n,"personal":n,"action":n,"tone":n,"safety":n,"worst":"가장 큰 문제 한 줄 또는 null"}',
].join('\n');

function judgeInput(c, prep, out) {
  return [
    `회원: ${prep.p.desc}`,
    `<data>\n${prep.p.data}\n</data>`,
    `현황(전체 기록 — 코치에게는 질문 종류에 맞는 줄만 줬다):\n${prep.sig.status.map((s) => `- ${s.t}`).join('\n')}`,
    `코치에게 준 현황: ${prep.status.length ? prep.status.join(' / ') : '없음'}`,
    `[짚을 신호] ${prep.focus ? `(${prep.focus.mode === 'main' ? '답의 중심' : '끝에 한 문장으로만'}) ${prep.focus.text}${prep.focus.mode === 'main' ? ` → ${prep.focus.action}` : ''}` : '없음'}`,
    `[성과] ${prep.win ? prep.win.text : '없음'}`,
    ...(prep.injury ? ['[부상] 회원이 아픈 곳을 말함 — 그 부위 운동 제외'] : []),
    ...(c.history?.length ? [`앞 대화:\n${c.history.map((m) => `${m.role === 'user' ? '회원' : '코치'}: ${m.content}`).join('\n')}`] : []),
    `질문: ${c.q}`,
    ...(c.expect ? [`[기대] ${c.expect}`] : []),
    `코치 답: ${JSON.stringify(out)}`,
  ].join('\n');
}

function report(rows) {
  const done = rows.filter((r) => r.out && !r.safety);
  const err = rows.filter((r) => r.error);
  const pass = done.filter((r) => !r.issues.length).length;
  console.log(`\n[${PROMPT_VERSION}] 답 ${done.length}개 · 고정 안내 ${rows.filter((r) => r.safety).length}개 · 오류 ${err.length}개`);
  console.log(`코드 검사 통과 ${pass}/${done.length} (${Math.round(pass / Math.max(1, done.length) * 100)}%)`);
  const tally = {};
  for (const r of done) for (const i of r.issues) { const k = i.replace(/[ (].*/, ''); tally[k] = (tally[k] ?? 0) + 1; }
  console.log('문제 종류:', JSON.stringify(tally));
  const js = done.filter((r) => r.judge && Number(r.judge.accuracy));
  if (js.length) {
    const K = ['accuracy', 'personal', 'action', 'tone', 'safety'];
    const avg = (list, k) => (list.reduce((s, r) => s + (Number(r.judge[k]) || 0), 0) / list.length);
    const tot = (r) => K.reduce((s, k) => s + (Number(r.judge[k]) || 0), 0);
    console.log(`심사 평균(${js.length}) — 정확 ${avg(js, 'accuracy').toFixed(2)} · 맞춤 ${avg(js, 'personal').toFixed(2)} · 행동 ${avg(js, 'action').toFixed(2)} · 말투 ${avg(js, 'tone').toFixed(2)} · 안전 ${avg(js, 'safety').toFixed(2)} · 합계 ${(js.reduce((s, r) => s + tot(r), 0) / js.length).toFixed(2)}/25`);
    const by = {};
    for (const r of js) (by[r.routed] ??= []).push(r);
    for (const [k, l] of Object.entries(by)) console.log(`   ${k.padEnd(10)} ${String(l.length).padStart(3)}개  합계 ${(l.reduce((s, r) => s + tot(r), 0) / l.length).toFixed(2)}  (정확 ${avg(l, 'accuracy').toFixed(1)} 맞춤 ${avg(l, 'personal').toFixed(1)} 행동 ${avg(l, 'action').toFixed(1)} 말투 ${avg(l, 'tone').toFixed(1)})`);
    console.log(`   25점 만점 ${js.filter((r) => tot(r) === 25).length}개 · 22점 이하 ${js.filter((r) => tot(r) <= 22).length}개 · 20점 이하 ${js.filter((r) => tot(r) <= 20).length}개`);
  }
  const u = (k) => done.reduce((s, r) => s + (r.usage?.[k] ?? 0), 0);
  const won = ((u('input_tokens') + u('cache_creation_input_tokens') * 1.25 + u('cache_read_input_tokens') * 0.1) * 1 + u('output_tokens') * 5) / 1e6 * 1400;
  console.log(`토큰 — 입력 ${u('input_tokens')} · 캐시 읽기 ${u('cache_read_input_tokens')} · 캐시 쓰기 ${u('cache_creation_input_tokens')} · 출력 ${u('output_tokens')} → 답 1개 ${(won / Math.max(1, done.length)).toFixed(1)}원(Haiku 4.5 가격 기준), 출력 평균 ${Math.round(u('output_tokens') / Math.max(1, done.length))}토큰`);
  if (err.length) console.log('오류 예:', err[0].error.slice(0, 160));
}

async function main() {
  console.log(`프롬프트 ${PROMPT_VERSION} · 고정부 ${SYSTEM.length.toLocaleString()}자 · 모델 ${MODEL}${PREFILL ? ' · 프리필' : ''}`);
  let list = cases;
  if (arg('--only')) list = cases.filter((c) => arg('--only').split(',').includes(c.id));
  if (arg('--n')) list = list.filter((_, i) => i % Math.ceil(cases.length / Number(arg('--n'))) === 0);
  const dir = path.join(__dirname, 'out');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${arg('--tag') || new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  let rows = [];
  try { rows = JSON.parse(fs.readFileSync(file, 'utf8')).rows.filter((r) => !r.error); } catch { /* 새 실행 */ }
  if (has('--report')) return report(rows);
  if (has('--dry') || !KEY) {
    console.log(KEY ? '' : '(ANTHROPIC_API_KEY 없음 — 드라이 런)');
    const pr = prepare(list[0]);
    console.log('--- 예시 가변부 ---\n' + pr.messages[pr.messages.length - 1].content);
    return;
  }
  const have = new Set(rows.map((r) => r.id));
  const todo = list.filter((c) => !have.has(c.id));
  const save = () => fs.writeFileSync(file, JSON.stringify({ version: PROMPT_VERSION, model: MODEL, rows }, null, 1));

  async function one(c) {
    const prep = prepare(c);
    if (prep.r.intent === 'emergency' || prep.r.intent === 'injury') {
      return { id: c.id, persona: c.persona, intent: c.intent, routed: prep.r.intent, q: c.q, safety: true, out: SAFETY_REPLY[prep.r.intent], issues: [] };
    }
    let out = null;
    let usage = null;
    let raw = '';
    try {
      const r = await api(MODEL, SYSTEM, PREFILL ? [...prep.messages, { role: 'assistant', content: PREFILL }] : prep.messages);
      raw = PREFILL + r.text;
      out = parse(raw);
      if (out && prep.r.intent === 'app') out.next = null; // 서버와 같게(index.ts)
      usage = r.usage;
    } catch (e) {
      return { id: c.id, error: String(e) };
    }
    const issues = codeChecks(c, prep, out, raw);
    let judge = null;
    if (has('--judge') && out) {
      try { judge = parse((await api(JUDGE, JUDGE_SYS, [{ role: 'user', content: judgeInput(c, prep, out) }], 300)).text); } catch { /* 건너뜀 */ }
    }
    return { id: c.id, persona: c.persona, intent: c.intent, routed: prep.r.intent, q: c.q, focus: prep.focus?.key ?? null, win: prep.win?.key ?? null, out: out ?? { raw: raw.slice(0, 600) }, issues, judge, usage };
  }

  let next = 0;
  let stopped = false;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (next < todo.length) {
      if (Date.now() - T0 > BUDGET) { stopped = true; return; }
      const c = todo[next++];
      const row = await one(c);
      rows.push(row);
      process.stdout.write(row.error ? 'E' : row.issues?.length ? 'x' : '.');
      if (rows.length % 10 === 0) save();
    }
  }));
  rows.sort((a, b) => a.id.localeCompare(b.id));
  save();
  const left = list.length - rows.filter((r) => !r.error && list.some((c) => c.id === r.id)).length;
  console.log(stopped || left ? `\n(남은 문항 ${left}개 — 같은 --tag 로 다시 실행)` : '\n완료');
  report(rows.filter((r) => list.some((c) => c.id === r.id)));
  console.log('저장', file);
}
main();
