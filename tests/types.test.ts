import { describe, it, expect } from 'vitest';
import type { CubeEvent } from '../src/core/types.js';

/**
 * Phase 0 只有型別合約，尚無執行邏輯。
 * 這個測試確保型別可被消費、且測試工具鏈可運行（驗收：npm test 可執行）。
 * 真正的協議 fixture 測試在 Phase 2 隨 driver 一起補上（SPEC §10.4 行為錨）。
 */
describe('core types (Phase 0 contract)', () => {
  it('CubeEvent move 事件符合 SPEC 3.2 形狀', () => {
    const event: CubeEvent = {
      type: 'move',
      move: "R'",
      cubeTimestamp: 1234,
      hostTimestamp: 5678,
    };
    expect(event.type).toBe('move');
    if (event.type === 'move') {
      expect(event.move).toBe("R'");
      expect(event.cubeTimestamp).toBe(1234);
    }
  });

  it('CubeEvent 各分支的 discriminant 皆可窮舉', () => {
    const events: CubeEvent[] = [
      { type: 'facelets', facelets: 'U'.repeat(9) + 'RFDLB'.repeat(9) },
      { type: 'battery', level: 87 },
      { type: 'gyro', quaternion: [0, 0, 0, 1] },
      { type: 'connected' },
      { type: 'disconnected' },
      { type: 'error', error: new Error('boom') },
    ];
    expect(events).toHaveLength(6);
  });
});
