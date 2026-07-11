import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MoyuDriver } from '../src/drivers/moyu/MoyuDriver.js';
import type { CubeEvent } from '../src/core/types.js';
import { CubieCube, moveCube, moveStringToIndex } from '../src/utils/facelets.js';
import packets from './fixtures/moyu-packets.json' with { type: 'json' };

// 以 mock BLE 物件驅動真實 MoyuDriver：餵入 csTimer 產生的加密封包（DataView），
// 驗證「初始狀態→逐步轉動」的 facelet 重建與時間戳累積（SPEC Phase 2 事件行為與 GAN 一致）。

class MockChrct extends EventTarget {
  value: DataView | null = null;
  writeValue = vi.fn(() => Promise.resolve());
  startNotifications = vi.fn(() => Promise.resolve(this));
  stopNotifications = vi.fn(() => Promise.resolve(this));
  notify(bytes: number[]): void {
    this.value = new DataView(new Uint8Array(bytes).buffer);
    this.dispatchEvent(new Event('characteristicvaluechanged'));
  }
}

class MockDevice extends EventTarget {
  gatt = { disconnect: vi.fn() };
}

function makeDriver(): { driver: MoyuDriver; read: MockChrct; events: CubeEvent[] } {
  const read = new MockChrct();
  const write = new MockChrct();
  const device = new MockDevice();
  const driver = new MoyuDriver(
    device as unknown as BluetoothDevice,
    read as unknown as BluetoothRemoteGATTCharacteristic,
    write as unknown as BluetoothRemoteGATTCharacteristic,
    'WCU_MY32_ABCD',
    packets.mac,
  );
  const events: CubeEvent[] = [];
  for (const t of ['move', 'facelets', 'battery', 'connected', 'disconnected'] as const) {
    driver.addEventListener(t, (e) => events.push((e as CustomEvent<CubeEvent>).detail));
  }
  return { driver, read, events };
}

function faceletAfter(moves: string[]): string {
  let a = new CubieCube();
  let b = new CubieCube();
  for (const m of moves) {
    CubieCube.cubeMult(a, moveCube[moveStringToIndex(m)]!, b);
    [a, b] = [b, a];
  }
  return a.toFaceCube();
}

describe('MoyuDriver', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('初始狀態封包投遞 facelets', () => {
    const { read, events } = makeDriver();
    read.notify(packets.state.enc);
    expect(events).toContainEqual({ type: 'facelets', facelets: packets.state.expect.facelets });
  });

  it('電量封包投遞 battery', () => {
    const { read, events } = makeDriver();
    read.notify(packets.battery.enc);
    expect(events).toContainEqual({ type: 'battery', level: packets.battery.expect.level });
  });

  it('移動封包：逐步重建 facelet 並累積 cubeTimestamp（R U F\')', () => {
    const { read, events } = makeDriver();
    read.notify(packets.state.enc); // 基準：solved, moveCnt=7
    read.notify(packets.move.enc); // moveCnt=10 → 套用 R, U, F'

    const moves = events.filter((e): e is Extract<CubeEvent, { type: 'move' }> => e.type === 'move');
    expect(moves.map((m) => m.move)).toEqual(['R', 'U', "F'"]);
    // 時間戳為方塊內部累積時鐘：+200, +150, +120
    expect(moves.map((m) => m.cubeTimestamp)).toEqual([200, 350, 470]);
    for (const m of moves) expect(typeof m.hostTimestamp).toBe('number');

    // 每步後的 facelets 應等於增量套用結果。
    const facelets = events
      .filter((e): e is Extract<CubeEvent, { type: 'facelets' }> => e.type === 'facelets')
      .map((e) => e.facelets);
    // 首個 facelets 來自初始狀態封包（solved），其後三個為 R / R U / R U F'。
    expect(facelets.slice(1)).toEqual([
      faceletAfter(['R']),
      faceletAfter(['R', 'U']),
      faceletAfter(['R', 'U', "F'"]),
    ]);
  });

  it('重複移動計數（moveDiff=0）不重複投遞', () => {
    const { read, events } = makeDriver();
    read.notify(packets.state.enc);
    read.notify(packets.move.enc);
    const countAfterFirst = events.filter((e) => e.type === 'move').length;
    read.notify(packets.move.enc); // 同 moveCnt=10 → moveDiff=0
    expect(events.filter((e) => e.type === 'move').length).toBe(countAfterFirst);
  });

  it('disconnect 投遞 disconnected 並關閉 GATT', async () => {
    const { driver, events } = makeDriver();
    await driver.disconnect();
    expect(events).toContainEqual({ type: 'disconnected' });
  });
});
