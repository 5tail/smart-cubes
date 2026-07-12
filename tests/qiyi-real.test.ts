import { describe, it, expect } from 'vitest';
import { decodeNotification, parseCubeData, QIYI_KEY } from '../src/drivers/qiyi/protocol.js';
import { CubieCube, moveCube, moveStringToIndex } from '../src/utils/facelets.js';
import real from './fixtures/qiyi-real.json' with { type: 'json' };

// 真實韌體行為錨（SPEC §10.4）：實機 QiYi AI 3x3 標準款（QY-QYSC-A-09F0）擷取的封包。
// 奇藝金鑰固定，故可從「原始加密位元組」全程重放：解密 → CRC → 解析 → ACK。
// 不含 MAC（MAC 僅用於 hello 內容，與收包解析無關）。

function hexToBytes(hex: string): number[] {
  const a: number[] = [];
  for (let i = 0; i < hex.length; i += 2) a.push(parseInt(hex.slice(i, i + 2), 16));
  return a;
}
function toHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('QiYi 實機封包（QiYi AI 3x3，B U R\' U\' B\'）', () => {
  it('每個原始封包都能解密並通過 CRC（固定金鑰，對上 driver 當時的解密結果）', () => {
    for (const p of real.packets) {
      const msg = decodeNotification(hexToBytes(p.raw), QIYI_KEY);
      expect(msg).not.toBeNull();
      // 與擷取當下 driver 解出的位元組逐位元組相同。
      expect(toHex(msg!)).toBe(p.decoded);
    }
  });

  it('依序解析：轉動序列與 facelets 與 demo 當時一致，且每包都產生 ACK', () => {
    let lastTs = 0;
    let battery = -1;
    const moves: string[] = [];
    const facelets: string[] = [];
    for (const p of real.packets) {
      const msg = decodeNotification(hexToBytes(p.raw), QIYI_KEY)!;
      const parsed = parseCubeData(msg, lastTs, battery);
      lastTs = parsed.lastTs;
      expect(parsed.ack).not.toBeNull(); // hello/state 封包都必須回 ACK
      for (const e of parsed.events) {
        if (e.type === 'move') moves.push(e.move);
        if (e.type === 'facelets' && facelets[facelets.length - 1] !== e.facelets) facelets.push(e.facelets);
        if (e.type === 'battery') battery = e.level;
      }
    }
    expect(moves).toEqual(real.expectedMoves);
    expect(facelets).toEqual(real.expectedFacelets);
  });

  it('內部一致性：解出的 move 套到前一個 facelet = 方塊回報的下一個 facelet', () => {
    const f = real.expectedFacelets;
    const m = real.expectedMoves;
    for (let i = 1; i < f.length; i++) {
      const cube = new CubieCube();
      expect(cube.fromFacelet(f[i - 1]!)).toBe(cube);
      const next = new CubieCube();
      CubieCube.cubeMult(cube, moveCube[moveStringToIndex(m[i]!)]!, next);
      expect(next.toFaceCube()).toBe(f[i]);
    }
  });

  it('所有回報的 facelet 皆為合法狀態（六色各 9 面）', () => {
    for (const facelet of real.expectedFacelets) {
      expect(facelet).toHaveLength(54);
      for (const face of 'URFDLB') {
        expect(facelet.split('').filter((c) => c === face)).toHaveLength(9);
      }
    }
  });
});
