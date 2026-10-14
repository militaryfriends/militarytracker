/**
 * Hermes 에 TextDecoder 가 없을 때만 채운다 — GLTFLoader 가 .glb 머리 · JSON 을 읽을 때 쓴다(UTF-8).
 * engine.native.ts 에서 쓴다.
 */
export class Utf8Decoder {
  decode(input?: ArrayBuffer | ArrayBufferView): string {
    if (!input) return '';
    const b = input instanceof ArrayBuffer
      ? new Uint8Array(input)
      : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    const parts: string[] = [];
    let out = '';
    for (let i = 0; i < b.length;) {
      const c = b[i++];
      let cp: number;
      if (c < 0x80) cp = c;
      else if (c < 0xe0) cp = ((c & 0x1f) << 6) | (b[i++] & 0x3f);
      else if (c < 0xf0) cp = ((c & 0x0f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f);
      else cp = ((c & 0x07) << 18) | ((b[i++] & 0x3f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f);
      out += String.fromCodePoint(cp);
      if (out.length > 4096) {
        parts.push(out);
        out = '';
      }
    }
    parts.push(out);
    return parts.join('');
  }
}

export function ensureTextDecoder() {
  const g = globalThis as { TextDecoder?: unknown };
  if (typeof g.TextDecoder === 'undefined') g.TextDecoder = Utf8Decoder;
}
