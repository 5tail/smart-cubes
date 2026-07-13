import { connectGanCube } from 'gan-web-bluetooth';
import type { ConnectOptions, SmartCube } from './types.js';
import { GanDriver } from '../drivers/gan/GanDriver.js';
import { connectQiyiDevice } from '../drivers/qiyi/QiyiDriver.js';
import { connectMoyuDevice } from '../drivers/moyu/MoyuDriver.js';
import {
  detectBrand,
  unifiedRequestDeviceOptions,
  withRequestDeviceOverride,
  GAN_NAME_PREFIXES,
} from './chooser.js';

/**
 * 統一連線入口（SPEC 3.1）：跳出「一次涵蓋三家」的藍牙選擇視窗，依裝置名稱前綴
 * 自動判斷品牌並交給對應 driver，回傳統一的 SmartCube。
 *
 * 品牌分派（SPEC §5 ADR 2026-07-13）：
 * - QiYi / MoYu driver 接受已選好的裝置（connect*Device）；
 * - GAN 走 gan-web-bluetooth 的 connectGanCube（其內部自帶 requestDevice、吃不下外部
 *   裝置），故在呼叫期間暫時覆寫 requestDevice 回傳已選裝置、結束即還原。
 *
 * 註：本入口 bundle 含三家 driver。只支援單一品牌的下游請改用
 * connectQiyiCube / connectMoyuCube 等專用入口以利 tree-shake。
 */
export async function connectSmartCube(options: ConnectOptions = {}): Promise<SmartCube> {
  const device = await navigator.bluetooth.requestDevice(unifiedRequestDeviceOptions());
  const brand = detectBrand(device.name ?? '');
  switch (brand) {
    case 'qiyi':
      return connectQiyiDevice(device, options);
    case 'moyu':
      return connectMoyuDevice(device, options);
    case 'gan': {
      const { macProvider } = options;
      const conn = await withRequestDeviceOverride(navigator.bluetooth, device, () =>
        // 適配到 gan 的 MacAddressProvider（其 isFallbackCall 為選用參數）。
        connectGanCube(
          macProvider ? (dev, isFallback) => macProvider(dev, isFallback ?? false) : undefined,
        ),
      );
      return new GanDriver(conn);
    }
    default:
      throw new Error(
        `無法從裝置名稱「${device.name ?? ''}」判斷品牌。支援的名稱前綴：` +
          `${GAN_NAME_PREFIXES.join('/')}（GAN）、QY-QYSC/XMD-TornadoV4（QiYi）、WCU_MY3（MoYu）`,
      );
  }
}
