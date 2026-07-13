import { describe, it, expect } from 'vitest';
import {
  type Quat,
  QUAT_IDENTITY,
  quatMultiply,
  quatConjugate,
  quatNormalize,
  ganQuatToCubeQuat,
  quatToMatrix3,
  cubeQuatToCssMatrix,
  ganQuatToCssTransform,
} from '../demo/src/cube3dMap';

// 陀螺儀姿態（gyro）數學測試（demo，SPEC §5 ADR 2026-07-13）。
// 鎖住三件事：四元數代數、GAN→方塊座標基變換、以及「校正後回正」不變式。

const SQRT_HALF = Math.SQRT1_2; // sin/cos 45°

function expectVecClose(a: readonly number[], b: readonly number[]): void {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i]!, 6);
}

/** 用 3×3 矩陣（row-major）乘 column 向量。 */
function apply3(m: number[], v: readonly [number, number, number]): [number, number, number] {
  return [
    m[0]! * v[0] + m[1]! * v[1] + m[2]! * v[2],
    m[3]! * v[0] + m[4]! * v[1] + m[5]! * v[2],
    m[6]! * v[0] + m[7]! * v[1] + m[8]! * v[2],
  ];
}

describe('四元數代數', () => {
  it('q ⊗ q⁻¹ = identity', () => {
    const q = quatNormalize([1, 2, 3, 4]);
    expectVecClose(quatMultiply(q, quatConjugate(q)), QUAT_IDENTITY);
  });

  it('identity 為乘法單位元', () => {
    const q = quatNormalize([0.3, -0.5, 0.1, 0.8]);
    expectVecClose(quatMultiply(q, QUAT_IDENTITY), q);
    expectVecClose(quatMultiply(QUAT_IDENTITY, q), q);
  });

  it('quatToMatrix3(identity) = 單位矩陣', () => {
    expectVecClose(quatToMatrix3(QUAT_IDENTITY), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });
});

describe('GAN → 方塊座標基變換', () => {
  it('GAN 各軸對到方塊座標：+X→+X、+Y(藍/B)→-Z、+Z(白/U)→+Y', () => {
    // 純向量（w=0）驗基變換 C·(x,y,z)=(x,z,-y)。
    expectVecClose(ganQuatToCubeQuat([1, 0, 0, 0]), [1, 0, 0, 0]);
    expectVecClose(ganQuatToCubeQuat([0, 1, 0, 0]), [0, 0, -1, 0]);
    expectVecClose(ganQuatToCubeQuat([0, 0, 1, 0]), [0, 1, 0, 0]);
  });

  it('繞 GAN +Z（白/U 面）轉 90° → 方塊繞 +Y(U) 轉 90°：R 面(+X) 轉到 -Z(B)', () => {
    // GAN 繞 +Z 轉 90° 的姿態四元數。
    const ganQ: Quat = [0, 0, SQRT_HALF, SQRT_HALF];
    const cubeQ = ganQuatToCubeQuat(ganQ);
    const m = quatToMatrix3(cubeQ);
    // 繞我們 +Y 90°（右手）：+X → -Z。
    expectVecClose(apply3(m, [1, 0, 0]), [0, 0, -1]);
    // U 軸(+Y) 為旋轉軸，不動。
    expectVecClose(apply3(m, [0, 1, 0]), [0, 1, 0]);
  });
});

describe('CSS matrix3d 輸出', () => {
  it('identity → 單位 matrix3d', () => {
    expect(cubeQuatToCssMatrix(QUAT_IDENTITY)).toBe(
      'matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)',
    );
  });

  it('輸出 16 個數、無 -0', () => {
    const s = cubeQuatToCssMatrix(quatNormalize([0.2, 0.4, 0.1, 0.9]));
    const nums = s.slice('matrix3d('.length, -1).split(', ');
    expect(nums).toHaveLength(16);
    for (const n of nums) expect(n.startsWith('-0,') || n === '-0').toBe(false);
  });
});

describe('校正基準（回正不變式）', () => {
  it('baseline = current 時方塊回正（identity transform）', () => {
    const q: Quat = quatNormalize([0.5, -0.3, 0.7, 0.2]);
    expect(ganQuatToCssTransform(q, q)).toBe(
      'matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)',
    );
  });

  it('baseline = identity 時等同直接轉換當前姿態', () => {
    const q: Quat = quatNormalize([0.1, 0.2, 0.3, 0.9]);
    expect(ganQuatToCssTransform(q)).toBe(cubeQuatToCssMatrix(ganQuatToCubeQuat(q)));
  });
});
