import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MoyuDriver, connectMoyuDevice } from '../src/drivers/moyu/MoyuDriver.js';
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

describe('connectMoyuDevice — 金鑰自動探測（連上後試候選 MAC，用能解出合法封包的那組）', () => {
  // 不再猜「名稱 vs 廣播誰優先」：逐一探測候選 MAC，方塊回的封包能以該金鑰解出合法型別才採用
  // （csTimer isWrongKey 精神）。mock 方塊：任何 write 都回 fixture 的 state.enc（以 packets.mac
  // 的金鑰加密），故只有「候選 == packets.mac 的金鑰」能通過探測。
  // packets.mac = CF:30:16:AB:CD:EF；名稱推導 WCU_MY32_ABCD → CF:30:16:00:AB:CD（與 fixture 不同 → 探測失敗）。

  function makeProbeMock(
    name: string,
    opts: { respond?: boolean; advDvBytes?: number[] } = {},
  ): {
    device: BluetoothDevice;
    watchSpy: ReturnType<typeof vi.fn>;
    disconnectSpy: ReturnType<typeof vi.fn>;
  } {
    const respond = opts.respond ?? true;
    const read = new MockChrct();
    const write = new MockChrct();
    write.writeValue = vi.fn(() => {
      if (respond) queueMicrotask(() => read.notify(packets.state.enc)); // 方塊「回應」= fixture 加密封包
      return Promise.resolve();
    });
    const service = {
      getCharacteristic: vi.fn((uuid: string) =>
        Promise.resolve(uuid.endsWith('cb1') ? read : write),
      ),
    };
    const disconnectSpy = vi.fn();
    const gatt = {
      connect: vi.fn(() => Promise.resolve(gatt)),
      getPrimaryService: vi.fn(() => Promise.resolve(service)),
      disconnect: disconnectSpy,
    };
    const device = new MockDevice() as unknown as BluetoothDevice & { name: string };
    // 若給了 advDvBytes，watchAdvertisements 一被呼叫就（下一 microtask）派送廣播事件。
    const watchSpy = vi.fn(() => {
      if (opts.advDvBytes) {
        queueMicrotask(() =>
          device.dispatchEvent(
            Object.assign(new Event('advertisementreceived'), {
              manufacturerData: new Map([[0x0100, new DataView(new Uint8Array(opts.advDvBytes!).buffer)]]),
            }),
          ),
        );
      }
      return Promise.resolve();
    });
    const base: Record<string, unknown> = { name, gatt };
    if (opts.advDvBytes) base.watchAdvertisements = watchSpy; // 無 advDvBytes → 無此方法 → readMac 立即回 null
    Object.assign(device, base);
    return { device, watchSpy, disconnectSpy };
  }

  it('記住值（app）即正確金鑰 → 直接採用，macSource=app', async () => {
    const { device } = makeProbeMock('WCU_MY32_ABCD');
    const driver = await connectMoyuDevice(
      device,
      { macProvider: (_d, fb) => Promise.resolve(fb ? null : packets.mac) },
      50,
    );
    expect(driver.mac).toBe(packets.mac);
    expect(driver.macSource).toBe('app');
    await driver.disconnect();
  });

  it('名稱推導金鑰錯 → 自動改用廣播 MAC（探測通過），macSource=advertisement', async () => {
    // 廣播 dv 反序 = packets.mac；名稱推導 CF:30:16:00:AB:CD 探測失敗後改用廣播。
    const advBytes = [0xef, 0xcd, 0xab, 0x16, 0x30, 0xcf]; // 反序讀出 cf:30:16:ab:cd:ef（= packets.mac 金鑰）
    const { device, watchSpy } = makeProbeMock('WCU_MY32_ABCD', { advDvBytes: advBytes });
    const driver = await connectMoyuDevice(device, {}, 30);
    expect(driver.macSource).toBe('advertisement');
    expect(driver.mac.toUpperCase()).toBe(packets.mac);
    expect(watchSpy).toHaveBeenCalled();
    await driver.disconnect();
  });

  it('所有候選金鑰都錯 → 斷開 GATT 釋放連線並拋錯（避免方塊被卡住）', async () => {
    // 無 macProvider、名稱推導錯、無廣播 → 全部探測失敗。
    const { device, disconnectSpy } = makeProbeMock('WCU_MY32_ABCD');
    await expect(connectMoyuDevice(device, {}, 20)).rejects.toThrow(/金鑰驗證失敗/);
    expect(disconnectSpy).toHaveBeenCalled(); // 關鍵：釋放 GATT，方塊才能再度廣播
  });
});
