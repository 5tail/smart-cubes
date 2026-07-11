import { describe, it, expect } from 'vitest';
import { Aes128 } from '../src/utils/crypto.js';
import oracle from './fixtures/cstimer-oracle.json' with { type: 'json' };

// AES-128 是標準演算法：同金鑰同明文，任何正確實作輸出必相同。
// 以 FIPS-197 附錄 C.1 官方向量做獨立驗證，另以 csTimer 產生的 ECB 向量鎖住
// 與移植來源（csTimer $.aes128）逐位元組相容。
describe('Aes128', () => {
  it('符合 FIPS-197 附錄 C.1 官方測試向量', () => {
    const key = Array.from({ length: 16 }, (_, i) => i); // 000102...0f
    const plain = [
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee,
      0xff,
    ];
    const expected = [
      0x69, 0xc4, 0xe0, 0xd8, 0x6a, 0x7b, 0x04, 0x30, 0xd8, 0xcd, 0xb7, 0x80, 0x70, 0xb4, 0xc5,
      0x5a,
    ];
    const cipher = new Aes128(key).encrypt(plain.slice());
    expect(cipher).toEqual(expected);
  });

  it('encrypt 後 decrypt 還原（round-trip）', () => {
    const key = Array.from({ length: 16 }, (_, i) => (i * 17 + 3) & 0xff);
    const plain = Array.from({ length: 16 }, (_, i) => (i * 5 + 1) & 0xff);
    const aes = new Aes128(key);
    const block = plain.slice();
    aes.encrypt(block);
    expect(block).not.toEqual(plain);
    aes.decrypt(block);
    expect(block).toEqual(plain);
  });

  it('與 csTimer 的 ECB 向量逐位元組相容（QiYi 金鑰）', () => {
    const { key, plain, cipher } = oracle.qiyiEcb;
    expect(new Aes128(key).encrypt(plain.slice())).toEqual(cipher);
    expect(new Aes128(key).decrypt(cipher.slice())).toEqual(plain);
  });

  it('金鑰長度非 16 時丟出錯誤', () => {
    expect(() => new Aes128([1, 2, 3])).toThrow();
  });
});
