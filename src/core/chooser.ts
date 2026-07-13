// 統一選擇視窗（SPEC 3.1）的組裝工具：三家品牌的 requestDevice 參數合併、
// 名稱前綴品牌偵測、以及讓 gan-web-bluetooth 吃下「已選好的裝置」的 requestDevice 覆寫。
// 純邏輯（無 BLE I/O），供 connect.ts 使用並由 tests/chooser.test.ts 覆蓋。

import { QIYI_NAME_PREFIXES, QIYI_SERVICE_UUID, QIYI_CIC_LIST } from '../drivers/qiyi/protocol.js';
import { MOYU_NAME_PREFIXES, MOYU_SERVICE_UUID, MOYU_CIC_LIST } from '../drivers/moyu/protocol.js';

/** GAN 裝置名稱前綴（SPEC 3.1；與 gan-web-bluetooth 的 requestDevice filters 一致）。 */
export const GAN_NAME_PREFIXES = ['GAN', 'MG', 'AiCube'];

// GAN 各代 service UUID。gan-web-bluetooth 未匯出其 definitions 模組，故在此複寫常數
// （值取自 gan-web-bluetooth src/gan-cube-definitions.ts，升版時需核對）。
const GAN_GEN2_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dc4179';
const GAN_GEN3_SERVICE = '8653000a-43e6-47b7-9cb0-5fc21d4ae340';
const GAN_GEN4_SERVICE = '00000010-0000-fff7-fff6-fff5fff4fff0';
// GAN 廣播 CIC 候選：低位元組固定 0x01（同 gan-web-bluetooth GAN_CIC_LIST）。
const GAN_CIC_LIST = Array.from({ length: 256 }, (_, i) => (i << 8) | 0x01);

export type Brand = 'gan' | 'moyu' | 'qiyi';

/** 依藍牙裝置名稱前綴判斷品牌（SPEC 3.1 品牌偵測規則）；無法判斷回傳 null。 */
export function detectBrand(deviceName: string): Brand | null {
  const name = deviceName.trim();
  if (QIYI_NAME_PREFIXES.some((p) => name.startsWith(p))) return 'qiyi';
  if (MOYU_NAME_PREFIXES.some((p) => name.startsWith(p))) return 'moyu';
  if (GAN_NAME_PREFIXES.some((p) => name.startsWith(p))) return 'gan';
  return null;
}

/**
 * 三家並陳的單一 requestDevice 參數（SPEC 3.1「filters 一次涵蓋三家」）：
 * - filters：三家名稱前綴聯集，使用者在同一個選擇視窗看到所有支援方塊；
 * - optionalServices：三家 service，連上後才知道品牌，必須先全部宣告；
 * - optionalManufacturerData：三家 CIC 聯集（Chrome 需事先宣告才會在廣播交出
 *   manufacturer data，QiYi/GAN/MoYu 的真實 MAC 都藏在裡面）。
 */
export function unifiedRequestDeviceOptions(): {
  filters: { namePrefix: string }[];
  optionalServices: string[];
  optionalManufacturerData: number[];
} {
  const prefixes = [...GAN_NAME_PREFIXES, ...QIYI_NAME_PREFIXES, ...MOYU_NAME_PREFIXES];
  const cics = new Set<number>([...GAN_CIC_LIST, ...QIYI_CIC_LIST, ...MOYU_CIC_LIST]);
  return {
    filters: prefixes.map((namePrefix) => ({ namePrefix })),
    optionalServices: [
      GAN_GEN2_SERVICE,
      GAN_GEN3_SERVICE,
      GAN_GEN4_SERVICE,
      QIYI_SERVICE_UUID,
      MOYU_SERVICE_UUID,
    ],
    optionalManufacturerData: [...cics].sort((a, b) => a - b),
  };
}

/**
 * 在 fn 執行期間把 bluetooth.requestDevice 暫時覆寫為「直接回傳已選好的 device」，
 * 結束（含拋錯）後還原。
 *
 * 用途：gan-web-bluetooth 的 connectGanCube() 內部自己呼叫 requestDevice、
 * 吃不下外部已選的裝置；統一選擇視窗已經選過一次，不能再跳第二個視窗。
 * 覆寫只在單一 await 鏈內生效並於 finally 還原，不影響其他呼叫者。
 */
export async function withRequestDeviceOverride<T>(
  bluetooth: Bluetooth,
  device: BluetoothDevice,
  fn: () => Promise<T>,
): Promise<T> {
  const hadOwn = Object.prototype.hasOwnProperty.call(bluetooth, 'requestDevice');
  const original = bluetooth.requestDevice;
  (bluetooth as { requestDevice: () => Promise<BluetoothDevice> }).requestDevice = () =>
    Promise.resolve(device);
  try {
    return await fn();
  } finally {
    if (hadOwn) {
      (bluetooth as { requestDevice: typeof original }).requestDevice = original;
    } else {
      // 原本是原型方法（無自有屬性）：刪掉覆寫、讓原型鏈復原。
      delete (bluetooth as Partial<Bluetooth>).requestDevice;
    }
  }
}
