import { describe, it, expect } from 'vitest';
import type { GanCubeEvent } from 'gan-web-bluetooth';
import { ganEventToCubeEvent } from '../src/drivers/gan/mapEvent.js';

/**
 * GAN 事件 → 統一 CubeEvent 的對照測試（SPEC §10.3.3 測試即驗收）。
 * 這是 GAN driver 的解析層；封包解密由 gan-web-bluetooth（MIT 依賴）負責，
 * 我們測的是欄位映射的正確性。
 */
describe('ganEventToCubeEvent', () => {
  it('MOVE → move，時間戳照 SPEC 映射', () => {
    const gan: GanCubeEvent = {
      type: 'MOVE',
      timestamp: 5000,
      serial: 3,
      face: 1,
      direction: 1,
      move: "R'",
      localTimestamp: 4990,
      cubeTimestamp: 1234,
    };
    expect(ganEventToCubeEvent(gan)).toEqual({
      type: 'move',
      move: "R'",
      cubeTimestamp: 1234,
      hostTimestamp: 4990,
    });
  });

  it('MOVE：localTimestamp 為 null 時 hostTimestamp 退回事件 timestamp', () => {
    const gan: GanCubeEvent = {
      type: 'MOVE',
      timestamp: 5000,
      serial: 4,
      face: 0,
      direction: 0,
      move: 'U',
      localTimestamp: null,
      cubeTimestamp: null,
    };
    expect(ganEventToCubeEvent(gan)).toEqual({
      type: 'move',
      move: 'U',
      cubeTimestamp: null,
      hostTimestamp: 5000,
    });
  });

  it('FACELETS → facelets（Kociemba URFDLB 透傳）', () => {
    const facelets =
      'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
    const gan: GanCubeEvent = {
      type: 'FACELETS',
      timestamp: 10,
      serial: 0,
      facelets,
      state: {
        CP: [0, 1, 2, 3, 4, 5, 6, 7],
        CO: [0, 0, 0, 0, 0, 0, 0, 0],
        EP: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
        EO: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    };
    expect(ganEventToCubeEvent(gan)).toEqual({ type: 'facelets', facelets });
  });

  it('BATTERY → battery', () => {
    const gan: GanCubeEvent = { type: 'BATTERY', timestamp: 1, batteryLevel: 87 };
    expect(ganEventToCubeEvent(gan)).toEqual({ type: 'battery', level: 87 });
  });

  it('GYRO → gyro，四元數依 x,y,z,w 排列', () => {
    const gan: GanCubeEvent = {
      type: 'GYRO',
      timestamp: 1,
      quaternion: { x: 0.1, y: 0.2, z: 0.3, w: 0.9 },
    };
    expect(ganEventToCubeEvent(gan)).toEqual({
      type: 'gyro',
      quaternion: [0.1, 0.2, 0.3, 0.9],
    });
  });

  it('DISCONNECT → disconnected', () => {
    const gan: GanCubeEvent = { type: 'DISCONNECT', timestamp: 1 };
    expect(ganEventToCubeEvent(gan)).toEqual({ type: 'disconnected' });
  });

  it('HARDWARE → null（無對應統一事件，忽略）', () => {
    const gan: GanCubeEvent = {
      type: 'HARDWARE',
      timestamp: 1,
      hardwareName: 'GANi3',
      softwareVersion: '1.0',
    };
    expect(ganEventToCubeEvent(gan)).toBeNull();
  });
});
