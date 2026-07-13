import { describe, it, expect } from 'vitest';
import {
  detectBrand,
  unifiedRequestDeviceOptions,
  withRequestDeviceOverride,
  GAN_NAME_PREFIXES,
} from '../src/core/chooser.js';
import { QIYI_NAME_PREFIXES } from '../src/drivers/qiyi/protocol.js';
import { MOYU_NAME_PREFIXES } from '../src/drivers/moyu/protocol.js';

// 統一選擇視窗（SPEC 3.1）的組裝邏輯測試：品牌偵測、requestDevice 參數聯集、
// gan-web-bluetooth 用的 requestDevice 暫時覆寫（含拋錯還原）。

describe('detectBrand — 名稱前綴品牌偵測（SPEC 3.1）', () => {
  it.each([
    ['GAN12uiM', 'gan'],
    ['GANi3-1234', 'gan'],
    ['MG-3x3', 'gan'],
    ['AiCube-xyz', 'gan'],
    ['QY-QYSC-S-27E1', 'qiyi'],
    ['XMD-TornadoV4-i-ABCD', 'qiyi'],
    ['XMD-TornadoV4LE-ABCD', 'qiyi'],
    ['WCU_MY32_B6EF', 'moyu'],
  ] as const)('%s → %s', (name, brand) => {
    expect(detectBrand(name)).toBe(brand);
  });

  it('未知前綴 / 空字串 / 前後空白皆處理', () => {
    expect(detectBrand('Rubiks-Connected')).toBeNull();
    expect(detectBrand('')).toBeNull();
    expect(detectBrand('  WCU_MY32_B6EF  ')).toBe('moyu');
  });
});

describe('unifiedRequestDeviceOptions — 三家並陳單一視窗參數', () => {
  const opts = unifiedRequestDeviceOptions();

  it('filters 涵蓋三家全部名稱前綴', () => {
    const prefixes = opts.filters.map((f) => f.namePrefix);
    for (const p of [...GAN_NAME_PREFIXES, ...QIYI_NAME_PREFIXES, ...MOYU_NAME_PREFIXES]) {
      expect(prefixes).toContain(p);
    }
  });

  it('optionalServices 含三家 service（GAN Gen2/3/4 + QiYi + MoYu）', () => {
    expect(opts.optionalServices).toHaveLength(5);
    expect(opts.optionalServices).toContain('0000fff0-0000-1000-8000-00805f9b34fb'); // QiYi
    expect(opts.optionalServices).toContain('0783b03e-7735-b5a0-1760-a305d2795cb0'); // MoYu
    expect(opts.optionalServices).toContain('6e400001-b5a3-f393-e0a9-e50e24dc4179'); // GAN Gen2
  });

  it('optionalManufacturerData 為三家 CIC 去重聯集（含 QiYi 0x0504 與 GAN 低位 0x01 系列）', () => {
    const cics = new Set(opts.optionalManufacturerData);
    expect(cics.size).toBe(opts.optionalManufacturerData.length); // 無重複
    expect(cics.has(0x0504)).toBe(true); // QiYi
    expect(cics.has(0x0001)).toBe(true); // GAN (i<<8)|0x01
    expect(cics.has(0x0100)).toBe(true); // MoYu (i+1)<<8
  });
});

describe('withRequestDeviceOverride — gan-web-bluetooth 的裝置注入', () => {
  const fakeDevice = { name: 'GANi3-FAKE' } as BluetoothDevice;

  function makeFakeBluetooth(): { bt: Bluetooth; originalCalls: number[] } {
    const originalCalls: number[] = [];
    // 模擬「requestDevice 在原型上」：覆寫應以自有屬性遮蔽、還原時刪除自有屬性。
    class FakeBluetooth {
      requestDevice(): Promise<BluetoothDevice> {
        originalCalls.push(1);
        return Promise.resolve({ name: 'original' } as BluetoothDevice);
      }
    }
    return { bt: new FakeBluetooth() as unknown as Bluetooth, originalCalls };
  }

  it('fn 執行期間 requestDevice 回傳注入的裝置，結束後還原原型方法', async () => {
    const { bt, originalCalls } = makeFakeBluetooth();
    const got = await withRequestDeviceOverride(bt, fakeDevice, async () => {
      return bt.requestDevice({ filters: [] });
    });
    expect(got).toBe(fakeDevice);
    expect(originalCalls).toHaveLength(0);
    // 還原後走回原本的 requestDevice。
    expect(Object.prototype.hasOwnProperty.call(bt, 'requestDevice')).toBe(false);
    const after = await bt.requestDevice({ filters: [] });
    expect(after.name).toBe('original');
    expect(originalCalls).toHaveLength(1);
  });

  it('fn 拋錯時也會還原', async () => {
    const { bt } = makeFakeBluetooth();
    await expect(
      withRequestDeviceOverride(bt, fakeDevice, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(Object.prototype.hasOwnProperty.call(bt, 'requestDevice')).toBe(false);
    expect((await bt.requestDevice({ filters: [] })).name).toBe('original');
  });

  it('requestDevice 原本就是自有屬性時，還原為原值', async () => {
    const impl = (): Promise<BluetoothDevice> => Promise.resolve({ name: 'own' } as BluetoothDevice);
    const bt = { requestDevice: impl } as unknown as Bluetooth;
    await withRequestDeviceOverride(bt, fakeDevice, async () => {
      expect((await bt.requestDevice({ filters: [] })).name).toBe('GANi3-FAKE');
    });
    expect(bt.requestDevice).toBe(impl);
  });
});
