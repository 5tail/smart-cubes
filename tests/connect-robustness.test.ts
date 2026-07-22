import { describe, it, expect, vi } from 'vitest';
import { withTimeout } from '../src/utils/timeout.js';
import { connectQiyiDevice } from '../src/drivers/qiyi/QiyiDriver.js';
import { connectMoyuDevice } from '../src/drivers/moyu/MoyuDriver.js';

// 連線穩定性大修（決策層 2026-07-21）：GATT 操作無內建逾時，方塊卡死時會永久 hang，
// 半開的連線佔住 adapter → 下一次連線 `GATT operation already in progress`、方塊也不再廣播。
// 修法：GATT 生命週期包逾時，任何失敗/逾時都保證 disconnect 釋放連線。
// 本檔用「會 hang / 會 reject 的 mock GATT 階段」驗證：連線在時限內失敗，且一定釋放連線。

const NEVER = (): Promise<never> => new Promise<never>(() => {}); // 永不 settle

describe('withTimeout', () => {
  it('Promise 在時限內完成 → 原值透傳', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, 'x')).resolves.toBe(42);
  });

  it('Promise 永不完成 → 逾時後以標籤拒絕', async () => {
    await expect(withTimeout(NEVER(), 20, 'GATT 連線')).rejects.toThrow(/GATT 連線逾時/);
  });

  it('Promise 先自行拒絕 → 透傳原錯誤（非逾時錯誤）', async () => {
    await expect(withTimeout(Promise.reject(new Error('原始錯誤')), 1000, 'x')).rejects.toThrow(
      /原始錯誤/,
    );
  });
});

// --- QiYi 連線清理 ---

type QiyiHangStage = 'connect' | 'service' | 'characteristic' | 'notifications';

function makeQiyiDevice(opts: {
  hangAt?: QiyiHangStage;
  rejectServiceWith?: string;
}): { device: BluetoothDevice; disconnect: ReturnType<typeof vi.fn> } {
  const disconnect = vi.fn();
  const chrct = {
    startNotifications: () => (opts.hangAt === 'notifications' ? NEVER() : Promise.resolve()),
    addEventListener: () => {},
    removeEventListener: () => {},
    writeValue: () => Promise.resolve(),
    stopNotifications: () => Promise.resolve(),
  };
  const service = {
    getCharacteristic: () =>
      opts.hangAt === 'characteristic' ? NEVER() : Promise.resolve(chrct),
  };
  const gattObj = {
    getPrimaryService: () => {
      if (opts.hangAt === 'service') return NEVER();
      if (opts.rejectServiceWith) return Promise.reject(new Error(opts.rejectServiceWith));
      return Promise.resolve(service);
    },
  };
  const device = Object.assign(new EventTarget(), {
    name: 'QY-QYSC-A-1234',
    gatt: {
      connect: () => (opts.hangAt === 'connect' ? NEVER() : Promise.resolve(gattObj)),
      disconnect,
    },
  }) as unknown as BluetoothDevice;
  return { device, disconnect };
}

describe('connectQiyiDevice — 失敗/逾時保證釋放連線', () => {
  it.each<QiyiHangStage>(['connect', 'service', 'characteristic', 'notifications'])(
    'GATT 「%s」階段 hang → 逾時拒絕且釋放連線',
    async (hangAt) => {
      const { device, disconnect } = makeQiyiDevice({ hangAt });
      await expect(connectQiyiDevice(device, {}, 30)).rejects.toThrow(/逾時/);
      expect(disconnect).toHaveBeenCalled();
    },
  );

  it('GATT 階段直接 reject（非 hang）→ 透傳錯誤且釋放連線', async () => {
    const { device, disconnect } = makeQiyiDevice({ rejectServiceWith: 'GATT Server disconnected' });
    await expect(connectQiyiDevice(device, {}, 5000)).rejects.toThrow(/GATT Server disconnected/);
    expect(disconnect).toHaveBeenCalled();
  });
});

// --- MoYu 連線清理 ---

type MoyuHangStage = 'connect' | 'service' | 'characteristic' | 'notifications';

function makeMoyuDevice(opts: { hangAt?: MoyuHangStage }): {
  device: BluetoothDevice;
  disconnect: ReturnType<typeof vi.fn>;
} {
  const disconnect = vi.fn();
  const read = {
    startNotifications: () => (opts.hangAt === 'notifications' ? NEVER() : Promise.resolve()),
    addEventListener: () => {},
    removeEventListener: () => {},
    stopNotifications: () => Promise.resolve(),
    properties: {},
    writeValue: () => Promise.resolve(),
  };
  const write = { properties: {}, writeValue: () => Promise.resolve() };
  const service = {
    getCharacteristic: (uuid: string) =>
      opts.hangAt === 'characteristic'
        ? NEVER()
        : Promise.resolve(uuid.endsWith('cb1') ? read : write),
  };
  const device = Object.assign(new EventTarget(), {
    name: 'WCU_MY32_ABCD',
    gatt: {
      connect: () =>
        opts.hangAt === 'connect'
          ? NEVER()
          : Promise.resolve({
              getPrimaryService: () => (opts.hangAt === 'service' ? NEVER() : Promise.resolve(service)),
            }),
      disconnect,
    },
  }) as unknown as BluetoothDevice;
  return { device, disconnect };
}

describe('connectMoyuDevice — 失敗/逾時保證釋放連線', () => {
  it.each<MoyuHangStage>(['connect', 'service', 'characteristic', 'notifications'])(
    'GATT 「%s」階段 hang → 逾時拒絕且釋放連線',
    async (hangAt) => {
      const { device, disconnect } = makeMoyuDevice({ hangAt });
      await expect(connectMoyuDevice(device, {}, 20, 30)).rejects.toThrow(/逾時/);
      expect(disconnect).toHaveBeenCalled();
    },
  );
});
