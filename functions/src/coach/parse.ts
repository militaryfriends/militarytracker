/**
 * 모델 출력에서 JSON 객체 하나를 꺼낸다 — 느슨하게.
 * Haiku 는 가끔 ```json 울타리를 치거나, 객체를 닫은 뒤 조각을 한 번 더 붙인다(`…}","meal":null…`).
 * "첫 { 부터 마지막 } 까지" 로 자르면 그때 파싱이 실패해 회원 화면에 JSON 원문이 그대로 나간다.
 * 그래서 처음 닫히는 객체만 잘라 읽고, 그래도 안 되면 text 값만이라도 건진다.
 */
export function firstJson(raw: string): Record<string, unknown> | null {
  const s = raw.replace(/```json|```/g, '');
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try {
        const o = JSON.parse(s.slice(start, i + 1));
        return o && typeof o === 'object' ? (o as Record<string, unknown>) : null;
      } catch {
        break;
      }
    }
  }
  // 끝이 잘렸거나 깨진 경우 — text 만이라도
  const m = s.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (m) {
    try {
      return { text: JSON.parse(`"${m[1]}"`) };
    } catch {
      return null;
    }
  }
  return null;
}
