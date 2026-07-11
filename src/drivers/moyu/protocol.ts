// Adapted from csTimer (https://github.com/cs0x7f/cstimer), Copyright Chen Shuang, GPL-3.0
// 移植自 csTimer `src/js/hardware/moyu32cube.js`（MoYu WeiLong AI 加密協議，WCU_MY3 前綴）。
// 加密方案與 GAN Gen2/3 相同：AES-128 + IV 的重疊塊變體，金鑰/IV 由 MAC 推導。
// 只搬協議邏輯（金鑰推導、加解密、bit 欄位解析），csTimer 的 UI/狀態管理不搬。
//
// 純函式集中在此供 fixture 測試；BLE I/O 與轉動代數（重建 facelet）在 MoyuDriver.ts。

import { Aes128 } from '../../utils/crypto.js';

export const MOYU_SERVICE_UUID = '0783b03e-7735-b5a0-1760-a305d2795cb0';
export const MOYU_CHRCT_READ = '0783b03e-7735-b5a0-1760-a305d2795cb1';
export const MOYU_CHRCT_WRITE = '0783b03e-7735-b5a0-1760-a305d2795cb2';
export const MOYU_NAME_PREFIXES = ['WCU_MY3'];
// 綁定帳號的 CIC 範圍 0x0100–0xFF00（供廣播 MAC 探測用）。
export const MOYU_CIC_LIST: number[] = Array.from({ length: 255 }, (_, i) => (i + 1) << 8);

// AES-128 金鑰與 IV 基底（csTimer 以 LZString 壓縮存放，此為解壓後的 16 bytes）。
const MOYU_KEY_BASE: readonly number[] = [
  21, 119, 58, 92, 103, 14, 45, 31, 23, 103, 42, 19, 155, 103, 82, 87,
];
const MOYU_IV_BASE: readonly number[] = [
  17, 35, 38, 37, 134, 42, 44, 59, 85, 6, 127, 49, 126, 103, 33, 87,
];

export const OPCODE_INFO = 161;
export const OPCODE_STATE = 163;
export const OPCODE_BATTERY = 164;
export const OPCODE_MOVE = 165;

/** 由 MAC 推導 AES 金鑰與 IV（前 6 bytes 各加上反序的 MAC byte，模 255）。 */
export function deriveKeyIv(mac: string): { key: number[]; iv: number[] } {
  const value: number[] = [];
  for (let i = 0; i < 6; i++) value.push(parseInt(mac.slice(i * 3, i * 3 + 2), 16));
  const key = MOYU_KEY_BASE.slice();
  const iv = MOYU_IV_BASE.slice();
  for (let i = 0; i < 6; i++) {
    key[i] = (key[i]! + value[5 - i]!) % 255;
    iv[i] = (iv[i]! + value[5 - i]!) % 255;
  }
  return { key, iv };
}

/**
 * GAN Gen2/3 式解密：若長度 > 16，先解末端 16-byte 窗（XOR IV），再解首 16-byte（XOR IV）。
 * 不改動輸入陣列。
 */
export function decode(bytesIn: readonly number[], aes: Aes128, iv: readonly number[]): number[] {
  const ret = bytesIn.slice();
  if (ret.length > 16) {
    const offset = ret.length - 16;
    const block = aes.decrypt(ret.slice(offset));
    for (let i = 0; i < 16; i++) ret[offset + i] = block[i]! ^ (iv[i] ?? 0);
  }
  aes.decrypt(ret); // 就地解首 16 bytes
  for (let i = 0; i < 16; i++) ret[i]! ^= iv[i] ?? 0;
  return ret;
}

/** GAN Gen2/3 式加密（decode 的逆）。 */
export function encode(bytesIn: readonly number[], aes: Aes128, iv: readonly number[]): number[] {
  const ret = bytesIn.slice();
  for (let i = 0; i < 16; i++) ret[i]! ^= iv[i] ?? 0;
  aes.encrypt(ret);
  if (ret.length > 16) {
    const offset = ret.length - 16;
    const block = ret.slice(offset);
    for (let i = 0; i < 16; i++) block[i]! ^= iv[i] ?? 0;
    aes.encrypt(block);
    for (let i = 0; i < 16; i++) ret[offset + i] = block[i]!;
  }
  return ret;
}

/** 建立一個 opcode 請求封包（20-byte，req[0]=opcode；未加密，由 driver 以 encode 包裝）。 */
export function buildRequest(opcode: number): number[] {
  const req = new Array<number>(20).fill(0);
  req[0] = opcode;
  return req;
}

/** bytes → MSB-first bit 字串（每 byte 8 位）。 */
export function bytesToBitString(bytes: readonly number[]): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += (bytes[i]! + 256).toString(2).slice(1);
  return s;
}

const bits = (s: string, start: number, len: number): number => parseInt(s.slice(start, start + len), 2);

/** 訊息型別（decode 後 bit[0,8)）。 */
export function messageType(decoded: readonly number[]): number {
  return bits(bytesToBitString(decoded), 0, 8);
}

/**
 * 解析 bit[8,152) 的 144-bit facelet → 54 字元（Kociemba URFDLB）。
 * MoYu 內部以 FBUDLR 順序、每面 8 貼紙×3-bit 儲存；中心固定。
 */
export function parseFacelet(faceletBits: string): string {
  const state: string[] = [];
  const faces = [2, 5, 0, 3, 4, 1]; // 由儲存的 FBUDLR 順序改讀成 URFDLB
  for (let i = 0; i < 6; i++) {
    const face = faceletBits.slice(faces[i]! * 24, 24 + faces[i]! * 24);
    for (let j = 0; j < 8; j++) {
      state.push('FBUDLR'.charAt(parseInt(face.slice(j * 3, 3 + j * 3), 2)));
      if (j === 3) state.push('FBUDLR'.charAt(faces[i]!));
    }
  }
  return state.join('');
}

/** 解析狀態封包（opcode 163）：facelets + moveCnt。 */
export function parseState(decoded: readonly number[]): { facelets: string; moveCnt: number } {
  const s = bytesToBitString(decoded);
  return { facelets: parseFacelet(s.slice(8, 152)), moveCnt: bits(s, 152, 160 - 152) };
}

/** 解析電量封包（opcode 164）：0–100。 */
export function parseBattery(decoded: readonly number[]): number {
  return bits(bytesToBitString(decoded), 8, 8);
}

// 封包內單一 move 的原始資料（封包順序：index 0 為最新）。
export interface MoyuRawMove {
  code: number; // 5-bit 原始碼
  timeOff: number; // 16-bit 時間增量
  move: string; // WCA 表記（如 "R"、"F'"）
  moveIndex: number; // facelets.moveCube 的 index（axis*3+power）
  valid: boolean; // code < 12 才是合法轉動
}

/** 解析移動封包（opcode 165）：moveCnt + 最多 5 個 move（封包順序，index 0 最新）。 */
export function parseMovePacket(decoded: readonly number[]): { moveCnt: number; moves: MoyuRawMove[] } {
  const s = bytesToBitString(decoded);
  const moveCnt = bits(s, 88, 8);
  const moves: MoyuRawMove[] = [];
  for (let i = 0; i < 5; i++) {
    const code = bits(s, 96 + i * 5, 5);
    const timeOff = bits(s, 8 + i * 16, 16);
    const face = 'FBUDLR'.charAt(code >> 1);
    const valid = code < 12;
    const move = face + (code & 1 ? "'" : '');
    const moveIndex = valid ? 'URFDLB'.indexOf(face) * 3 + (code & 1 ? 2 : 0) : -1;
    moves.push({ code, timeOff, move, moveIndex, valid });
  }
  return { moveCnt, moves };
}

/** 由 MoYu 裝置名稱推導預設 MAC（csTimer 的名稱規則）；無法推導回傳 null。 */
export function defaultMacFromName(deviceName: string): string | null {
  if (/^WCU_MY32_[0-9A-F]{4}$/.exec(deviceName)) {
    return 'CF:30:16:00:' + deviceName.slice(9, 11) + ':' + deviceName.slice(11, 13);
  }
  return null;
}
