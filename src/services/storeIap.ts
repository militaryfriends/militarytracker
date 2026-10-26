/**
 * 스토어 결제 — 웹 · 키 없음 자리. 앱(iOS · Android)은 storeIap.native.ts.
 */
export interface StorePackage { id: string; productId: string; price: string; raw: unknown; trial?: string }

export const storeIapReady = (): boolean => false;
export async function loadPackages(_uid: string): Promise<StorePackage[]> { return []; }
export async function buyPackage(_uid: string, _pkg: StorePackage): Promise<'done' | 'cancelled'> {
  throw new Error('구독은 앱에서만 결제할 수 있습니다.');
}
export async function restoreStore(_uid: string): Promise<void> {}
export async function logOutStore(): Promise<void> {}
