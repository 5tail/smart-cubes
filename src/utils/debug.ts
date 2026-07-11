/**
 * 實機封包擷取（dev-only）。
 *
 * 用途：連真方塊時把「原始加密封包 + driver 解密後的位元組」錄下來，
 * 匯出成 JSON 補進 `tests/fixtures/`，把 csTimer 合成向量升級成真實韌體行為錨
 * （SPEC §6 Phase 2 / §10.4 fixture 行為錨）。
 *
 * 這不是公開 API 合約的一部分（不出現在 SPEC 第 3 節）：預設關閉、零額外負擔，
 * 僅在呼叫 `setCapture(true)` 後才累積，供 demo 的「錄製封包」開關使用。
 * 不記錄 MAC —— 只存原始與解密後位元組，避免真實裝置位址外流；MoYu 的解密結果
 * 已是明文，解析測試無需 MAC 即可重放。
 */

export interface CapturedPacket {
  brand: string;
  t: number; // performance.now() 取整（ms）
  raw: string; // 原始（加密）位元組 hex
  decoded?: string; // driver 解密後位元組 hex（若有）
}

let enabled = false;
let buffer: CapturedPacket[] = [];

const toHex = (bytes: ArrayLike<number>): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** 開/關擷取；開啟時清空既有緩衝。 */
export function setCapture(on: boolean): void {
  enabled = on;
  if (on) buffer = [];
}

export function isCapturing(): boolean {
  return enabled;
}

/** driver 於收到通知時呼叫；未開啟擷取時為 no-op。 */
export function recordPacket(brand: string, raw: ArrayLike<number>, decoded?: ArrayLike<number>): void {
  if (!enabled) return;
  buffer.push({
    brand,
    t: Math.round(performance.now()),
    raw: toHex(raw),
    ...(decoded ? { decoded: toHex(decoded) } : {}),
  });
}

/** 取得目前累積的封包（複本）。 */
export function getCaptured(): CapturedPacket[] {
  return buffer.slice();
}

/** 清空緩衝。 */
export function clearCaptured(): void {
  buffer = [];
}
