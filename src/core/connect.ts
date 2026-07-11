import { connectGanCube } from 'gan-web-bluetooth';
import type { ConnectOptions, SmartCube } from './types.js';
import { GanDriver } from '../drivers/gan/GanDriver.js';

/**
 * 統一連線入口（SPEC 3.1）。跳出瀏覽器藍牙選擇視窗，連線後回傳統一的 SmartCube。
 *
 * Phase 1：只有 GAN driver。gan-web-bluetooth 內建 requestDevice（GAN 名稱前綴 filters），
 * 故此處為 GAN 專用連線流程。SPEC 3.1「filters 一次涵蓋三家、單一選擇視窗」需在
 * Phase 2 其他 driver 就緒後整合（見 BACKLOG）— 此為決策層待辦，Phase 1 不處理。
 */
export async function connectSmartCube(options: ConnectOptions = {}): Promise<SmartCube> {
  const { macProvider } = options;
  // 適配到 gan 的 MacAddressProvider（其 isFallbackCall 為選用參數）。
  const conn = await connectGanCube(
    macProvider ? (device, isFallback) => macProvider(device, isFallback ?? false) : undefined,
  );
  return new GanDriver(conn);
}
