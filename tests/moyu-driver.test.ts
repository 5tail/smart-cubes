import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MoyuDriver, connectMoyuDevice } from '../src/drivers/moyu/MoyuDriver.js';
import type { CubeEvent } from '../src/core/types.js';
import { CubieCube, moveCube, moveStringToIndex } from '../src/utils/facelets.js';
import { defaultMacFromName } from '../src/drivers/moyu/protocol.js';
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

  it('基準後的狀態封包以 driver 重建為權威（SPEC §5 ADR 2026-07-13）', () => {
    const { read, events } = makeDriver();
    read.notify(packets.state.enc); // 基準：solved
    read.notify(packets.move.enc); // R U F'
    read.notify(packets.state.enc); // 方塊自報 solved（不知道已轉動/重置的情境模擬）
    const faceletEvents = events.filter((e) => e.type === 'facelets');
    const last = faceletEvents[faceletEvents.length - 1];
    // 重建狀態（R U F'）勝出，不吐方塊自報的 solved。
    expect(last).toEqual({ type: 'facelets', facelets: faceletAfter(['R', 'U', "F'"]) });
  });

  it('resetToSolved 歸零重建並投遞復原 facelets；其後狀態封包不打架', async () => {
    const { driver, read, events } = makeDriver();
    read.notify(packets.state.enc);
    read.notify(packets.move.enc); // R U F'
    await driver.resetToSolved();
    const afterResetEvents = events.filter((e) => e.type === 'facelets');
    const afterReset = afterResetEvents[afterResetEvents.length - 1];
    expect(afterReset).toEqual({ type: 'facelets', facelets: new CubieCube().toFaceCube() });
    // 重置後再收狀態封包：仍以重建（solved）為權威，畫面不被自報狀態拉走。
    read.notify(packets.state.enc);
    const lastEvents = events.filter((e) => e.type === 'facelets');
    expect(lastEvents[lastEvents.length - 1]).toEqual({
      type: 'facelets',
      facelets: new CubieCube().toFaceCube(),
    });
  });

  it('disconnect 投遞 disconnected 並關閉 GATT', async () => {
    const { driver, events } = makeDriver();
    await driver.disconnect();
    expect(events).toContainEqual({ type: 'disconnected' });
  });
});

describe('connectMoyuDevice — MAC fallback 順序（回歸：名稱推導優先於廣播）', () => {
  // MoYu 金鑰用「名稱推導的偽 MAC」（CF:30:16:…），不是真實藍牙 MAC。統一選擇視窗宣告三家
  // CIC 後 watchAdvertisements 能拿到真實 MAC，若讓它搶先會算錯金鑰 → 連上不串流。此測試鎖住
  // 「名稱可推導時一律走名稱、不碰廣播」，防止未來又把順序改回「廣播優先」。
  function makeMockDevice(name: string): {
    device: BluetoothDevice;
    watchSpy: ReturnType<typeof vi.fn>;
  } {
    const read = new MockChrct();
    const write = new MockChrct();
    const service = {
      getCharacteristic: vi.fn((uuid: string) =>
        Promise.resolve(uuid.endsWith('cb1') ? read : write),
      ),
    };
    const gatt = {
      connect: vi.fn(() => Promise.resolve(gatt)),
      getPrimaryService: vi.fn(() => Promise.resolve(service)),
      disconnect: vi.fn(),
    };
    const watchSpy = vi.fn(() => Promise.resolve());
    const device = new MockDevice() as unknown as BluetoothDevice & { name: string };
    Object.assign(device, { name, gatt, watchAdvertisements: watchSpy });
    return { device, watchSpy };
  }

  it('名稱可推導 → driver.mac = 名稱偽 MAC，且不呼叫 watchAdvertisements（不走廣播）', async () => {
    const { device, watchSpy } = makeMockDevice('WCU_MY32_ABCD');
    const driver = await connectMoyuDevice(device);
    expect(driver.mac).toBe(defaultMacFromName('WCU_MY32_ABCD'));
    expect(driver.mac).toMatch(/^CF:30:16:/); // 偽 MAC 固定前綴
    expect(watchSpy).not.toHaveBeenCalled(); // 名稱優先 → 完全沒去抓廣播真 MAC
    await driver.disconnect();
  });

  it('macProvider 記住值優先於名稱推導', async () => {
    const { device } = makeMockDevice('WCU_MY32_ABCD');
    const remembered = 'CF:30:16:00:99:88';
    const driver = await connectMoyuDevice(device, {
      macProvider: (_d, isFallback) => Promise.resolve(isFallback ? null : remembered),
    });
    expect(driver.mac).toBe(remembered);
    await driver.disconnect();
  });

  it('名稱不可解析 → 廣播兜底仍可用（末 6 bytes 反序，與 csTimer 同）', async () => {
    // 名稱不符 WCU_MY32_[0-9A-F]{4} → defaultMacFromName 回 null → 走廣播。
    const { device, watchSpy } = makeMockDevice('WCU_MY32_ZZZZ');
    const pending = connectMoyuDevice(device);
    await new Promise((r) => setTimeout(r, 10)); // 等 readMacFromAdvertisement 掛上 listener
    // 模擬廣播事件：CIC 0x0100 帶 6 bytes，反序讀出 cf:30:16:ab:cd:ef。
    const dv = new DataView(new Uint8Array([0xef, 0xcd, 0xab, 0x16, 0x30, 0xcf]).buffer);
    device.dispatchEvent(
      Object.assign(new Event('advertisementreceived'), {
        manufacturerData: new Map([[0x0100, dv]]),
      }),
    );
    const driver = await pending;
    expect(watchSpy).toHaveBeenCalled();
    expect(driver.mac).toBe('cf:30:16:ab:cd:ef');
    await driver.disconnect();
  });
});
