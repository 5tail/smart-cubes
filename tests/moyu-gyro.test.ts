import { describe, it, expect, vi } from 'vitest';
import {
  deriveKeyIv,
  decode,
  messageType,
  parseGyroQuaternion,
  buildGyroControl,
  OPCODE_GYRO,
  OPCODE_GYRO_CTRL,
} from '../src/drivers/moyu/protocol.js';
import { MoyuDriver, connectMoyuDevice } from '../src/drivers/moyu/MoyuDriver.js';
import { Aes128 } from '../src/utils/crypto.js';
import type { CubeEvent } from '../src/core/types.js';
import packets from './fixtures/moyu-packets.json' with { type: 'json' };

// MoYu WCU_MY32 陀螺儀（opcode 171）fixture 測試（SPEC §10.3.3 測試即驗收）。
//
// csTimer 無實作（只有註解掉的 msgType==171）；封包格式由三個獨立社群來源交叉驗證：
// - lukeburong/weilong-v10-ai-protocol：[0xAB][quaternion 4×int32 LE ÷2^30]，順序 w,x,(-z),y
// - BTimeApp/BTime：bits[8,40)=W、[40,72)=X、[72,104)=Y、[104,136)=Z（LE、÷2^30、正規化）
// - huizhiLLL/DCTimer-BLE：GYRO_SCALE = 1073741824 (=2^30)
// fixture 的 enc 為「以 packets.mac 金鑰加密的完整 20-byte 封包」，走真實 decode 路徑。

const { key, iv } = deriveKeyIv(packets.mac);

describe('MoYu 陀螺儀封包解析（opcode 171）', () => {
  it('解密後型別為 171，繞 U(z) 90° 四元數解出 [0,0,√½,√½]（x,y,z,w 序）', () => {
    const decoded = decode(packets.gyro.quarterU.enc, new Aes128(key), iv);
    expect(messageType(decoded)).toBe(OPCODE_GYRO);
    const q = parseGyroQuaternion(decoded);
    const exp = packets.gyro.quarterU.expect.quaternion;
    for (let i = 0; i < 4; i++) expect(q[i]).toBeCloseTo(exp[i]!, 10);
  });

  it('負分量（int32 LE 符號位）正確解出，且逐包正規化為單位四元數', () => {
    const decoded = decode(packets.gyro.mixedSigns.enc, new Aes128(key), iv);
    const q = parseGyroQuaternion(decoded);
    const exp = packets.gyro.mixedSigns.expect.quaternion;
    for (let i = 0; i < 4; i++) expect(q[i]).toBeCloseTo(exp[i]!, 10);
    expect(Math.hypot(...q)).toBeCloseTo(1, 10);
  });

  it('buildGyroControl：opcode 172、byte[2] 為開關、20 bytes', () => {
    const on = buildGyroControl(true);
    const off = buildGyroControl(false);
    expect(on.length).toBe(20);
    expect(on[0]).toBe(OPCODE_GYRO_CTRL);
    expect(on[2]).toBe(1);
    expect(off[2]).toBe(0);
    expect(on.slice(3).every((b) => b === 0)).toBe(true);
  });
});

// --- 與 moyu-driver.test.ts 同款的最小 BLE mock（driver / connect 層行為） ---

class MockChrct extends EventTarget {
  value: DataView | null = null;
  writeValue = vi.fn((_bytes: BufferSource) => Promise.resolve());
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

describe('MoyuDriver 陀螺儀事件', () => {
  it('gyro 封包投遞 gyro 事件（quaternion [x,y,z,w]，GAN 同序）', () => {
    const read = new MockChrct();
    const driver = new MoyuDriver(
      new MockDevice() as unknown as BluetoothDevice,
      read as unknown as BluetoothRemoteGATTCharacteristic,
      new MockChrct() as unknown as BluetoothRemoteGATTCharacteristic,
      'WCU_MY32_ABCD',
      packets.mac,
    );
    const events: CubeEvent[] = [];
    driver.addEventListener('gyro', (e) => events.push((e as CustomEvent<CubeEvent>).detail));
    read.notify(packets.gyro.quarterU.enc);
    expect(events).toHaveLength(1);
    const ev = events[0]!;
    expect(ev.type).toBe('gyro');
    if (ev.type === 'gyro') {
      const exp = packets.gyro.quarterU.expect.quaternion;
      for (let i = 0; i < 4; i++) expect(ev.quaternion[i]).toBeCloseTo(exp[i]!, 10);
    }
  });
});

describe('connectMoyuDevice 陀螺儀開啟', () => {
  it('init 尾端送出 0xAC 開啟指令（在 INFO/STATE/BATTERY 之後）', async () => {
    const read = new MockChrct();
    const write = new MockChrct();
    write.writeValue = vi.fn((_bytes: BufferSource) => {
      queueMicrotask(() => read.notify(packets.state.enc)); // 方塊「回應」讓探測立即通過
      return Promise.resolve();
    });
    const service = {
      getCharacteristic: vi.fn((uuid: string) => Promise.resolve(uuid.endsWith('cb1') ? read : write)),
    };
    const gatt = {
      connect: vi.fn(() => Promise.resolve(gatt)),
      getPrimaryService: vi.fn(() => Promise.resolve(service)),
      disconnect: vi.fn(),
    };
    const device = Object.assign(new MockDevice(), { name: 'WCU_MY32_ABCD', gatt });

    const driver = await connectMoyuDevice(
      device as unknown as BluetoothDevice,
      { macProvider: (_d, fb) => Promise.resolve(fb ? null : packets.mac) },
      50,
    );
    // 以正確金鑰解密所有寫入，最後一筆應為 gyro 開啟（172, byte[2]=1）。
    const aes = new Aes128(key);
    const written = write.writeValue.mock.calls.map((c) =>
      decode(Array.from(new Uint8Array(c[0] as ArrayBuffer)), aes, iv),
    );
    const last = written[written.length - 1]!;
    expect(messageType(last)).toBe(OPCODE_GYRO_CTRL);
    expect(last[2]).toBe(1);
    // 開啟指令之前已送過 STATE 與 BATTERY 請求（基本功能不因 gyro 指令而變動）。
    const types = written.map((w) => messageType(w));
    expect(types).toContain(163);
    expect(types).toContain(164);
    await driver.disconnect();
  });
});
