import { describe, it, expect } from 'vitest';
import { CubieCube, moveCube, moveStringToIndex, SOLVED_FACELET } from '../src/utils/facelets';
import {
  faceletToCubie,
  cubieToFacelet,
  applyMoveGeometric,
  moveToRotation,
  rotateVec,
} from '../demo/src/cube3dMap';

// demo 3D 元件的幾何映射（facelet index ↔ cubie 座標/法向、轉層旋轉）測試。
// 行為錨：以套件的 CubieCube 轉動代數（實機 fixture 驗過）為 oracle，
// 純幾何的貼紙旋轉必須與代數結果完全一致 —— 這鎖住座標系、面配置與旋轉方向三件事。

const ALL_MOVES = ['U', 'R', 'F', 'D', 'L', 'B'].flatMap((f) => [f, `${f}2`, `${f}'`]);

function applyMoveAlgebraic(facelets: string, move: string): string {
  const cc = new CubieCube().fromFacelet(facelets);
  expect(cc).not.toBe(-1);
  const next = new CubieCube();
  CubieCube.cubeMult(cc as CubieCube, moveCube[moveStringToIndex(move)]!, next);
  return next.toFaceCube();
}

describe('cube3dMap — facelet ↔ cubie 幾何映射', () => {
  it('54 個 facelet index 與 (座標, 法向) 一一對應（round-trip）', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 54; i++) {
      const { pos, normal } = faceletToCubie(i);
      // 座標在表面上：法向分量必為 ±1 且與法向同向。
      expect(pos[0] * normal[0] + pos[1] * normal[1] + pos[2] * normal[2]).toBe(1);
      const key = `${pos.join(',')}|${normal.join(',')}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      expect(cubieToFacelet(pos, normal)).toBe(i);
    }
  });

  it('中心貼紙落在各面中心座標', () => {
    // U 中心 = index 4 → (0, 1, 0)
    expect(faceletToCubie(4).pos).toEqual([0, 1, 0]);
    // F 中心 = index 22 → (0, 0, 1)
    expect(faceletToCubie(22).pos).toEqual([0, 0, 1]);
  });

  it('18 個基本轉動：純幾何貼紙旋轉 = CubieCube 轉動代數（solved 起點）', () => {
    for (const move of ALL_MOVES) {
      expect(applyMoveGeometric(SOLVED_FACELET, move), move).toBe(
        applyMoveAlgebraic(SOLVED_FACELET, move),
      );
    }
  });

  it('連續轉動（打亂狀態起點）：逐步幾何 = 逐步代數', () => {
    const seq = ['R', 'U', "F'", 'L2', "D'", 'B', "R'", 'U2'];
    let geo = SOLVED_FACELET;
    let alg = SOLVED_FACELET;
    for (const move of seq) {
      geo = applyMoveGeometric(geo, move)!;
      alg = applyMoveAlgebraic(alg, move);
      expect(geo, `after ${move}`).toBe(alg);
    }
  });

  it('rotateVec：四次同向 90° 回到原點', () => {
    const v = [1, -1, 0] as const;
    let out = v as readonly [number, number, number];
    for (let i = 0; i < 4; i++) out = rotateVec([0, 1, 0], 1, out);
    expect(out).toEqual([1, -1, 0]);
  });

  it('非法輸入：未知轉動與非 54 字元皆回傳 null', () => {
    expect(moveToRotation('X')).toBeNull();
    expect(moveToRotation('R3')).toBeNull();
    expect(applyMoveGeometric('UUU', 'R')).toBeNull();
    expect(applyMoveGeometric(SOLVED_FACELET, 'M')).toBeNull();
  });
});
