import { describe, it, expect, vi } from 'vitest';
import { QiyiDriver } from '../src/drivers/qiyi/QiyiDriver.js';
import type { CubeEvent } from '../src/core/types.js';
import packets from './fixtures/qiyi-packets.json' with { type: 'json' };

// 以 mock BLE 物件驅動真實 QiyiDriver：餵入 csTimer 產生的加密封包，驗證事件投遞與自動 ACK。

class MockChrct extends EventTarget {
  value: DataView | null = null;
  writeValue = vi.fn(() => Promise.resolve());
  stopNotifications = vi.fn(() => Promise.resolve(this));
  notify(bytes: number[]): void {
    this.value = new DataView(new Uint8Array(bytes).buffer);
    this.dispatchEvent(new Event('characteristicvaluechanged'));
  }
}
class MockDevice extends EventTarget {
  gatt = { disconnect: vi.fn() };
}

function makeDriver(): { driver: QiyiDriver; chrct: MockChrct; events: CubeEvent[] } {
  const chrct = new MockChrct();
  const device = new MockDevice();
  const driver = new QiyiDriver(
    device as unknown as BluetoothDevice,
    chrct as unknown as BluetoothRemoteGATTCharacteristic,
    'QY-QYSC-A-1234',
    'CC:A3:00:00:12:34',
  );
  const events: CubeEvent[] = [];
  for (const t of ['move', 'facelets', 'battery', 'connected', 'disconnected'] as const) {
    driver.addEventListener(t, (e) => events.push((e as CustomEvent<CubeEvent>).detail));
  }
  return { driver, chrct, events };
}

describe('QiyiDriver', () => {
  it('hello 封包投遞 facelets + battery', () => {
    const { chrct, events } = makeDriver();
    chrct.notify(packets.hello.enc);
    expect(events).toContainEqual({ type: 'facelets', facelets: packets.hello.expect.facelets });
    expect(events).toContainEqual({ type: 'battery', level: packets.hello.expect.battery });
  });

  it('每個封包自動回送 ACK（writeValue 被呼叫）', () => {
    const { chrct } = makeDriver();
    chrct.notify(packets.hello.enc);
    expect(chrct.writeValue).toHaveBeenCalledTimes(1);
  });

  it('state 封包投遞 move（含 cubeTimestamp）與 facelets', () => {
    const { chrct, events } = makeDriver();
    chrct.notify(packets.hello.enc); // 先建立 lastTs / battery 基準
    chrct.notify(packets.state.enc);
    const move = events.find((e): e is Extract<CubeEvent, { type: 'move' }> => e.type === 'move');
    expect(move?.move).toBe(packets.state.expect.move);
    expect(move?.cubeTimestamp).toBe(packets.state.expect.moveCubeTs);
    expect(typeof move?.hostTimestamp).toBe('number');
  });

  it('CRC 壞掉的封包被忽略（不投遞事件）', () => {
    const { chrct, events } = makeDriver();
    const bad = packets.hello.enc.slice();
    bad[0] = (bad[0]! ^ 0xff) & 0xff;
    chrct.notify(bad);
    expect(events.filter((e) => e.type === 'facelets')).toHaveLength(0);
  });

  it('disconnect 投遞 disconnected', async () => {
    const { driver, events } = makeDriver();
    await driver.disconnect();
    expect(events).toContainEqual({ type: 'disconnected' });
  });
});
