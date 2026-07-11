// Adapted from csTimer (https://github.com/cs0x7f/cstimer), Copyright Chen Shuang, GPL-3.0
// 移植自 csTimer `src/js/lib/sha256.js` 的 AES128 實作（標準 AES-128，10 回合）。
// Web Crypto API 不支援 AES-128-ECB，且 QiYi / MoYu 皆以 16-byte 單塊為單位加解密，
// 故移植 csTimer 這份最小 AES-128（in-place 單塊）作為兩家 driver 的底層。
// 只搬密碼學核心，csTimer 的 SHA256 / UI 一律不搬。

/* eslint-disable no-bitwise */

// AES S-box 與其反查表。
const SBOX: readonly number[] = [
  99, 124, 119, 123, 242, 107, 111, 197, 48, 1, 103, 43, 254, 215, 171, 118, 202, 130, 201, 125,
  250, 89, 71, 240, 173, 212, 162, 175, 156, 164, 114, 192, 183, 253, 147, 38, 54, 63, 247, 204,
  52, 165, 229, 241, 113, 216, 49, 21, 4, 199, 35, 195, 24, 150, 5, 154, 7, 18, 128, 226, 235, 39,
  178, 117, 9, 131, 44, 26, 27, 110, 90, 160, 82, 59, 214, 179, 41, 227, 47, 132, 83, 209, 0, 237,
  32, 252, 177, 91, 106, 203, 190, 57, 74, 76, 88, 207, 208, 239, 170, 251, 67, 77, 51, 133, 69,
  249, 2, 127, 80, 60, 159, 168, 81, 163, 64, 143, 146, 157, 56, 245, 188, 182, 218, 33, 16, 255,
  243, 210, 205, 12, 19, 236, 95, 151, 68, 23, 196, 167, 126, 61, 100, 93, 25, 115, 96, 129, 79,
  220, 34, 42, 144, 136, 70, 238, 184, 20, 222, 94, 11, 219, 224, 50, 58, 10, 73, 6, 36, 92, 194,
  211, 172, 98, 145, 149, 228, 121, 231, 200, 55, 109, 141, 213, 78, 169, 108, 86, 244, 234, 101,
  122, 174, 8, 186, 120, 37, 46, 28, 166, 180, 198, 232, 221, 116, 31, 75, 189, 139, 138, 112, 62,
  181, 102, 72, 3, 246, 14, 97, 53, 87, 185, 134, 193, 29, 158, 225, 248, 152, 17, 105, 217, 142,
  148, 155, 30, 135, 233, 206, 85, 40, 223, 140, 161, 137, 13, 191, 230, 66, 104, 65, 153, 45, 15,
  176, 84, 187, 22,
];
const SBOX_INV: number[] = [];
for (let i = 0; i < 256; i++) SBOX_INV[SBOX[i]!] = i;

// 加密移位表的反查（csTimer 的 ShiftTabI，用於 shiftSubAdd/shiftSubAddI）。
const SHIFT_TAB_INV: readonly number[] = [0, 13, 10, 7, 4, 1, 14, 11, 8, 5, 2, 15, 12, 9, 6, 3];

// GF(2^8) 的 xtime（乘 2）查表。
const XTIME: number[] = [];
for (let i = 0; i < 128; i++) {
  XTIME[i] = i << 1;
  XTIME[128 + i] = ((i << 1) ^ 0x1b) & 0xff;
}

function addRoundKey(state: number[], rkey: readonly number[]): void {
  for (let i = 0; i < 16; i++) state[i]! ^= rkey[i]!;
}

function shiftSubAdd(state: number[], rkey: readonly number[]): void {
  const s0 = state.slice();
  for (let i = 0; i < 16; i++) state[i] = SBOX_INV[s0[SHIFT_TAB_INV[i]!]!]! ^ rkey[i]!;
}

function shiftSubAddInv(state: number[], rkey: readonly number[]): void {
  const s0 = state.slice();
  for (let i = 0; i < 16; i++) state[SHIFT_TAB_INV[i]!] = SBOX[s0[i]! ^ rkey[i]!]!;
}

function mixColumns(state: number[]): void {
  for (let i = 12; i >= 0; i -= 4) {
    const s0 = state[i]!;
    const s1 = state[i + 1]!;
    const s2 = state[i + 2]!;
    const s3 = state[i + 3]!;
    const h = s0 ^ s1 ^ s2 ^ s3;
    state[i] = s0 ^ h ^ XTIME[s0 ^ s1]!;
    state[i + 1] = s1 ^ h ^ XTIME[s1 ^ s2]!;
    state[i + 2] = s2 ^ h ^ XTIME[s2 ^ s3]!;
    state[i + 3] = s3 ^ h ^ XTIME[s3 ^ s0]!;
  }
}

function mixColumnsInv(state: number[]): void {
  for (let i = 0; i < 16; i += 4) {
    const s0 = state[i]!;
    const s1 = state[i + 1]!;
    const s2 = state[i + 2]!;
    const s3 = state[i + 3]!;
    const h = s0 ^ s1 ^ s2 ^ s3;
    const xh = XTIME[h]!;
    const h1 = XTIME[XTIME[(xh ^ s0 ^ s2) & 0xff]!]! ^ h;
    const h2 = XTIME[XTIME[(xh ^ s1 ^ s3) & 0xff]!]! ^ h;
    state[i] = s0 ^ h1 ^ XTIME[s0 ^ s1]!;
    state[i + 1] = s1 ^ h2 ^ XTIME[s1 ^ s2]!;
    state[i + 2] = s2 ^ h1 ^ XTIME[s2 ^ s3]!;
    state[i + 3] = s3 ^ h2 ^ XTIME[s3 ^ s0]!;
  }
}

/**
 * 最小 AES-128 單塊密碼（in-place，operate on number[16]）。
 *
 * QiYi 以此做 AES-128-ECB（逐 16-byte 塊獨立加解密）；
 * MoYu 以此配合 IV 做 GAN Gen2/3 式的重疊塊 CBC 變體（見 moyu/protocol.ts）。
 */
export class Aes128 {
  private readonly key: number[];

  /** @param key 16-byte 金鑰 */
  constructor(key: readonly number[]) {
    if (key.length !== 16) throw new Error('AES-128 需要 16-byte 金鑰');
    // 金鑰展開：16 → 176 bytes（11 round keys）。
    const ex = key.slice();
    let rcon = 1;
    for (let i = 16; i < 176; i += 4) {
      let tmp = ex.slice(i - 4, i);
      if (i % 16 === 0) {
        tmp = [SBOX[tmp[1]!]! ^ rcon, SBOX[tmp[2]!]!, SBOX[tmp[3]!]!, SBOX[tmp[0]!]!];
        rcon = XTIME[rcon]!;
      }
      for (let j = 0; j < 4; j++) ex[i + j] = ex[i + j - 16]! ^ tmp[j]!;
    }
    this.key = ex;
  }

  /** 就地加密 block 的前 16 bytes，並回傳同一 block。 */
  encrypt(block: number[]): number[] {
    shiftSubAddInv(block, this.key.slice(0, 16));
    for (let i = 16; i < 160; i += 16) {
      mixColumns(block);
      shiftSubAddInv(block, this.key.slice(i, i + 16));
    }
    addRoundKey(block, this.key.slice(160, 176));
    return block;
  }

  /** 就地解密 block 的前 16 bytes，並回傳同一 block。 */
  decrypt(block: number[]): number[] {
    addRoundKey(block, this.key.slice(160, 176));
    for (let i = 144; i >= 16; i -= 16) {
      shiftSubAdd(block, this.key.slice(i, i + 16));
      mixColumnsInv(block);
    }
    shiftSubAdd(block, this.key.slice(0, 16));
    return block;
  }
}
