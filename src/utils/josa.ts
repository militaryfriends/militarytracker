/** 받침에 맞춘 조사 — 한글로 끝나지 않으면(영문 · 숫자) 받침 없는 쪽 */
const lastHas = (w: string): boolean => {
  const c = w.trim().charCodeAt(w.trim().length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
};
export const eulReul = (w: string) => `${w}${lastHas(w) ? '을' : '를'}`;
export const iGa = (w: string) => `${w}${lastHas(w) ? '이' : '가'}`;
