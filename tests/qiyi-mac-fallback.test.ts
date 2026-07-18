import { describe, it, expect, vi, afterEach } from 'vitest';
import { connectQiyiDevice } from '../src/drivers/qiyi/QiyiDriver.js';
import { buildHello, defaultMacFromName } from '../src/drivers/qiyi/protocol.js';
import packets from './fixtures/qiyi-packets.json' with { type: 'json' };

// QiYi MAC fallback「hello 驗證鏈」測試（2026-07-17 決策層）。
//
// 機制：QiYi 方塊只在 hello 帶對 MAC 時才回話，錯 MAC = 完全沉默（0 封包）。
// mock 方塊據此模擬：writeValue 收到「與 buildHello(真 MAC) 相等」的封包才回 hello 回應，
// 其餘寫入（錯 MAC 的 hello、ACK）一律沉默。驗證鏈必須靠回話與否前進到下一候選，
// 全部沉默才跳 macProvider 手動輸入 —— 這修復「名稱推導猜錯 → 手動 fallback 不可達 →
// 新裝置上 0 封包死路」的實機回報（2026-07-17，另一台從未連線過的 Android 平板）。

class MockChrct extends EventTarget {
  value: DataView | null = null;
  /** 收到的所有寫入（原始 bytes），供測試比對送了哪些 hello。 */
  writes: number[][] = [];

  constructor(private readonly realMac: string) {
    super();
  }

  writeValue = (buf: ArrayBuffer): Promise<void> => {
    const bytes = [...new Uint8Array(buf)];
    this.writes.push(bytes);
    const expected = buildHello(this.realMac);
    if (bytes.length === expected.length && bytes.every((b, i) => b === expected[i])) {
      // 真 MAC 的 hello → 方塊回 hello 回應（fixture 實機封包）。
      this.notify(packets.hello.enc);
    }
    return Promise.resolve();
  };

  startNotifications = vi.fn(() => Promise.resolve(this));
  stopNotifications = vi.fn(() => Promise.resolve(this));

  notify(bytes: number[]): void {
    this.value = new DataView(new Uint8Array(bytes).buffer);
    this.dispatchEvent(new Event('characteristicvaluechanged'));
  }

  /** 寫入中與 buildHello(mac) 相等的次數（= 用該 MAC 送過幾次 hello）。 */
  helloCount(mac: string): number {
    const h = buildHello(mac);
    return this.writes.filter((w) => w.length === h.length && w.every((b, i) => b === h[i])).length;
  }
}

class MockDevice extends EventTarget {
  // 無 watchAdvertisements（旗標未開的瀏覽器）→ 廣播候選直接跳過。
  name: string;
  gatt: { connect: () => Promise<unknown>; disconnect: () => void };

  constructor(name: string, chrct: MockChrct) {
    super();
    this.name = name;
    this.gatt = {
      connect: () =>
        Promise.resolve({
          getPrimaryService: () => Promise.resolve({ getCharacteristic: () => Promise.resolve(chrct) }),
        }),
      disconnect: vi.fn(),
    };
  }
}

function setup(name: string, realMac: string): { device: BluetoothDevice; chrct: MockChrct } {
  const chrct = new MockChrct(realMac);
  const device = new MockDevice(name, chrct) as unknown as BluetoothDevice;
  return { device, chrct };
}

const NAME = 'QY-QYSC-A-1234';
const NAME_MAC = defaultMacFromName(NAME)!; // CC:A3:00:00:12:34

afterEach(() => {
  vi.useRealTimers();
});

describe('connectQiyiDevice MAC hello 驗證鏈', () => {
  it('名稱推導正確：靜默連上，不跳手動輸入', async () => {
    const { device, chrct } = setup(NAME, NAME_MAC);
    const fallbackSpy = vi.fn(() => Promise.resolve(null));
    const macProvider = (_d: BluetoothDevice, isFallback: boolean): Promise<string | null> =>
      isFallback ? fallbackSpy() : Promise.resolve(null);

    const driver = await connectQiyiDevice(device, { macProvider });
    expect(driver.mac).toBe(NAME_MAC);
    expect(driver.macSource).toBe('name');
    expect(chrct.helloCount(NAME_MAC)).toBe(1);
    expect(fallbackSpy).not.toHaveBeenCalled();
  });

  it('名稱推導錯（方塊沉默）：逾時後跳手動輸入，手動 MAC 送出第二個 hello', async () => {
    vi.useFakeTimers();
    const REAL = '11:22:33:44:55:66'; // 與名稱推導不同 → 名稱候選沉默
    const { device, chrct } = setup(NAME, REAL);
    const macProvider = vi.fn((_d: BluetoothDevice, isFallback: boolean) =>
      Promise.resolve(isFallback ? REAL : null),
    );

    const pending = connectQiyiDevice(device, { macProvider });
    await vi.advanceTimersByTimeAsync(2000); // 名稱候選 hello 驗證逾時
    const driver = await pending;

    expect(driver.mac).toBe(REAL);
    expect(driver.macSource).toBe('manual');
    expect(macProvider).toHaveBeenCalledWith(device, true);
    expect(chrct.helloCount(NAME_MAC)).toBe(1); // 錯的先試過
    expect(chrct.helloCount(REAL)).toBe(1); // 手動值再送
  });

  it('記住值（macProvider 非 fallback）優先且正確：一發命中', async () => {
    const REAL = '11:22:33:44:55:66';
    const { device, chrct } = setup(NAME, REAL);
    const macProvider = vi.fn((_d: BluetoothDevice, isFallback: boolean) =>
      Promise.resolve(isFallback ? null : REAL),
    );

    const driver = await connectQiyiDevice(device, { macProvider });
    expect(driver.mac).toBe(REAL);
    expect(driver.macSource).toBe('app');
    expect(chrct.helloCount(REAL)).toBe(1);
    expect(chrct.helloCount(NAME_MAC)).toBe(0); // 沒輪到名稱候選
  });

  it('記住值錯 → 自動前進到名稱推導候選（自癒，不需手動）', async () => {
    vi.useFakeTimers();
    const { device, chrct } = setup(NAME, NAME_MAC); // 真 MAC = 名稱推導值
    const STALE = 'AA:BB:CC:DD:EE:FF';
    const fallbackSpy = vi.fn(() => Promise.resolve(null));
    const macProvider = (_d: BluetoothDevice, isFallback: boolean): Promise<string | null> =>
      isFallback ? fallbackSpy() : Promise.resolve(STALE);

    const pending = connectQiyiDevice(device, { macProvider });
    await vi.advanceTimersByTimeAsync(2000); // 記住值候選逾時
    const driver = await pending;

    expect(driver.mac).toBe(NAME_MAC);
    expect(driver.macSource).toBe('name');
    expect(chrct.helloCount(STALE)).toBe(1);
    expect(chrct.helloCount(NAME_MAC)).toBe(1);
    expect(fallbackSpy).not.toHaveBeenCalled();
  });

  it('全部沉默且使用者取消手動輸入：仍回傳 driver（交由 app 層看門狗診斷）', async () => {
    vi.useFakeTimers();
    const { device } = setup(NAME, '11:22:33:44:55:66');
    const macProvider = vi.fn(() => Promise.resolve(null)); // 記住值無、手動取消

    const pending = connectQiyiDevice(device, { macProvider });
    await vi.advanceTimersByTimeAsync(2000);
    const driver = await pending;

    expect(driver.mac).toBe(NAME_MAC); // 保留最後一個候選供診斷顯示
    expect(driver.macSource).toBe('name');
    expect(macProvider).toHaveBeenCalledWith(device, true);
  });

  it('無任何候選也無 macProvider：丟錯（維持舊語意）', async () => {
    const { device } = setup('QY-QYSC-A', '11:22:33:44:55:66'); // 名稱無尾碼 → 推導不出
    await expect(connectQiyiDevice(device)).rejects.toThrow(/MAC/);
  });
});
