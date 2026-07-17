import { describe, it, expect } from 'vitest';
import {
  type Quat,
  QUAT_IDENTITY,
  quatNormalize,
  ganQuatToCssTransform,
  viewTransform,
} from '../demo/src/cube3dMap';

// 視角 transform 組合（demo 觸控/拖曳環視 × gyro 姿態，2026-07-17 決策層）。
// 鎖住三件事：gyro 關閉時與舊 orbit 行為全等、gyro 開啟且環視角為零時
// 與 ganQuatToCssTransform 全等（校正回正不變式不受影響）、環視角疊在姿態外層。

const q: Quat = quatNormalize([0.3, -0.5, 0.1, 0.8]);

describe('viewTransform（orbit × gyro 組合）', () => {
  it('gyro 關閉：純 orbit，姿態四元數不影響輸出（舊行為）', () => {
    expect(viewTransform(false, -24, -38, q)).toBe('rotateX(-24deg) rotateY(-38deg)');
    expect(viewTransform(false, -24, -38, QUAT_IDENTITY)).toBe(
      viewTransform(false, -24, -38, q),
    );
  });

  it('gyro 開啟 + 環視角為零：輸出與 ganQuatToCssTransform 全等（回正不變式保留）', () => {
    expect(viewTransform(true, 0, 0, q, QUAT_IDENTITY)).toBe(ganQuatToCssTransform(q));
    // 校正（baseline = current）後回正：與 identity 姿態同輸出。
    expect(viewTransform(true, 0, 0, q, q)).toBe(ganQuatToCssTransform(QUAT_IDENTITY));
  });

  it('gyro 開啟 + 環視角非零：orbit 疊在姿態外層（rotateX/rotateY 前綴 + 同一 matrix3d）', () => {
    const out = viewTransform(true, 10, -20, q, QUAT_IDENTITY);
    expect(out).toBe(`rotateX(10deg) rotateY(-20deg) ${ganQuatToCssTransform(q)}`);
  });
});
