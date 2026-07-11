import { describe, it, expect } from 'vitest';
import { parseState, parseMovePacket } from '../src/drivers/moyu/protocol.js';
import { CubieCube, moveCube, moveStringToIndex } from '../src/utils/facelets.js';
import real from './fixtures/moyu-real.json' with { type: 'json' };

// 真實韌體行為錨（SPEC §10.4）：實機 MoYu WeiLong AI（WCU_MY32_B6EF）擷取的
// 解密後封包 —— 操作序列 R U F' R' U'。此檔不含 MAC；decoded 已是明文，解析測試直接重放。
// 交叉驗證：cube 自報的狀態封包(0xA3) 應與「初始 solved + 用 CubieCube 逐步套用」重建結果一致。

function hexToBytes(hex: string): number[] {
  const a: number[] = [];
  for (let i = 0; i < hex.length; i += 2) a.push(parseInt(hex.slice(i, i + 2), 16));
  return a;
}

describe('MoYu 實機封包（WeiLong AI，R U F\' R\' U\'）', () => {
  it('移動封包：解出的轉動序列與實際操作一致', () => {
    const seq = real.movePackets.map((p) => {
      const { moveCnt, moves } = parseMovePacket(hexToBytes(p.decoded));
      expect(moveCnt).toBe(p.moveCnt); // moveCnt 逐包遞增
      return moves[0]!.move; // 最新的一步
    });
    expect(seq).toEqual(real.userSequence);
  });

  it('狀態封包：每個 facelet 合法（六色各 9 面）', () => {
    for (const p of real.statePackets) {
      const { facelets } = parseState(hexToBytes(p.decoded));
      expect(facelets).toBe(p.facelets);
      expect(facelets).toHaveLength(54);
      for (const face of 'URFDLB') {
        expect(facelets.split('').filter((c) => c === face)).toHaveLength(9);
      }
    }
  });

  it('CubieCube 重建 = 方塊自報狀態（逐步交叉驗證）', () => {
    // 由 solved 依 userSequence 逐步套用，每步結果應等於同一步的實機狀態封包 facelet。
    let cube = new CubieCube();
    real.userSequence.forEach((move, i) => {
      const next = new CubieCube();
      CubieCube.cubeMult(cube, moveCube[moveStringToIndex(move)]!, next);
      cube = next;
      expect(cube.toFaceCube()).toBe(real.statePackets[i]!.facelets);
    });
  });
});
