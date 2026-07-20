import { describe, it, expect, vi } from 'vitest';
import { connectMoyuDevice } from '../src/drivers/moyu/MoyuDriver.js';
import packets from './fixtures/moyu-packets.json' with { type: 'json' };

// 寫入模式 fallback 鏈（QiYi hello 驗證鏈同精神）：兩個方向都有實機前科 ——
// Android 平板需要 without-response 才不沉默（67db315），筆電（桌機藍牙堆疊）疑似
// 相反：without-response 被靜默丟包、with-response 才通（2026-07-19「平板正常、
// 筆電連上無訊號」）。mock 方塊「只認其中一種寫入模式的請求才回話」，驗證探測期
// 能自動找到通的模式並整條連線沿用。
//
// 金鑰固定用 macProvider 給 packets.mac（正確金鑰），讓探測結果只取決於寫入模式。

interface WriteModeMockOpts {
  /** 特徵值是否宣告支援 writeWithoutResponse（且掛上該 API）。 */
  supportsWithoutResponse: boolean;
  /** without-response 寫入是否會讓方塊回話（false = 靜默丟包，筆電情境）。 */
  respondWithoutResponse: boolean;
  /** with-response（writeValue）寫入是否會讓方塊回話。 */
  respondWithResponse: boolean;
}

function makeWriteModeMock(name: string, opts: WriteModeMockOpts): {
  device: BluetoothDevice;
  writeValueSpy: ReturnType<typeof vi.fn>;
  withoutResponseSpy: ReturnType<typeof vi.fn>;
} {
  class Chrct extends EventTarget {
    value: DataView | null = null;
    properties = { writeWithoutResponse: opts.supportsWithoutResponse };
    startNotifications = vi.fn(() => Promise.resolve(this));
    stopNotifications = vi.fn(() => Promise.resolve(this));
    writeValue = vi.fn(() => Promise.resolve());
    notify(bytes: number[]): void {
      this.value = new DataView(new Uint8Array(bytes).buffer);
      this.dispatchEvent(new Event('characteristicvaluechanged'));
    }
  }
  const read = new Chrct();
  const write = new Chrct();
  const writeValueSpy = vi.fn(() => {
    if (opts.respondWithResponse) queueMicrotask(() => read.notify(packets.state.enc));
    return Promise.resolve();
  });
  write.writeValue = writeValueSpy;
  const withoutResponseSpy = vi.fn(() => {
    if (opts.respondWithoutResponse) queueMicrotask(() => read.notify(packets.state.enc));
    return Promise.resolve();
  });
  if (opts.supportsWithoutResponse) {
    (write as unknown as Record<string, unknown>).writeValueWithoutResponse = withoutResponseSpy;
  }
  const service = {
    getCharacteristic: vi.fn((uuid: string) => Promise.resolve(uuid.endsWith('cb1') ? read : write)),
  };
  const gatt = {
    connect: vi.fn(() => Promise.resolve(gatt)),
    getPrimaryService: vi.fn(() => Promise.resolve(service)),
    disconnect: vi.fn(),
  };
  const device = new EventTarget() as unknown as BluetoothDevice;
  Object.assign(device, { name, gatt });
  return { device, writeValueSpy, withoutResponseSpy };
}

const rememberMac = { macProvider: (_d: BluetoothDevice, fb: boolean) => Promise.resolve(fb ? null : packets.mac) };

describe('connectMoyuDevice — 寫入模式 fallback 鏈', () => {
  it('平板情境：without-response 有回話 → 第一輪定案，不動 writeValue', async () => {
    const { device, writeValueSpy, withoutResponseSpy } = makeWriteModeMock('WCU_MY32_ABCD', {
      supportsWithoutResponse: true,
      respondWithoutResponse: true,
      respondWithResponse: false,
    });
    const driver = await connectMoyuDevice(device, rememberMac, 50);
    expect(driver.writeMode).toBe('withoutResponse');
    expect(driver.macSource).toBe('app');
    expect(withoutResponseSpy).toHaveBeenCalled();
    expect(writeValueSpy).not.toHaveBeenCalled();
    await driver.disconnect();
  });

  it('筆電情境：without-response 靜默丟包、with-response 通 → 第二輪救回，整條連線沿用 with-response', async () => {
    const { device, writeValueSpy } = makeWriteModeMock('WCU_MY32_ABCD', {
      supportsWithoutResponse: true,
      respondWithoutResponse: false, // 桌機堆疊丟包情境
      respondWithResponse: true,
    });
    const driver = await connectMoyuDevice(device, rememberMac, 50);
    expect(driver.writeMode).toBe('withResponse');
    expect(driver.mac).toBe(packets.mac);
    expect(driver.macSource).toBe('app'); // 第二輪重用第一輪 resolve 的候選（順序不變）
    // 連線後的請求也沿用勝出模式（sendRequest 走 writeValue）。
    writeValueSpy.mockClear();
    await driver.requestState();
    expect(writeValueSpy).toHaveBeenCalledTimes(1);
    await driver.disconnect();
  });

  it('兩種模式都沉默 → 維持現行盲連行為（名稱推導 + 平台偏好模式），交看門狗判斷', async () => {
    const { device } = makeWriteModeMock('WCU_MY32_ABCD', {
      supportsWithoutResponse: true,
      respondWithoutResponse: false,
      respondWithResponse: false,
    });
    const driver = await connectMoyuDevice(device, {}, 20);
    expect(driver.macSource).toBe('name');
    expect(driver.mac).toBe('CF:30:16:00:AB:CD');
    expect(driver.writeMode).toBe('withoutResponse'); // 盲連回到平台偏好，現行行為不變
    await driver.disconnect();
  });

  it('特徵值不支援 without-response → 只跑 with-response 一輪（現行 writeValue 路徑不變）', async () => {
    const { device, writeValueSpy, withoutResponseSpy } = makeWriteModeMock('WCU_MY32_ABCD', {
      supportsWithoutResponse: false,
      respondWithoutResponse: false,
      respondWithResponse: true,
    });
    const driver = await connectMoyuDevice(device, rememberMac, 50);
    expect(driver.writeMode).toBe('withResponse');
    expect(driver.macSource).toBe('app');
    expect(writeValueSpy).toHaveBeenCalled();
    expect(withoutResponseSpy).not.toHaveBeenCalled();
    await driver.disconnect();
  });
});
