/**
 * maru-smartcube — 通用智能方塊連線套件（公開進入點）。
 *
 * - `connectSmartCube`：統一連線入口（SPEC 3.1）——單一選擇視窗涵蓋三家，依名稱前綴分派 driver。
 * - `connectQiyiCube` / `connectMoyuCube`：QiYi / MoYu 專用連線入口（單品牌下游可 tree-shake）。
 * - `createTimestampFitter`：時間戳線性回歸校正（SPEC 3.4）。
 */

export { connectSmartCube } from './core/connect.js';
export { connectQiyiCube } from './drivers/qiyi/QiyiDriver.js';
export { connectMoyuCube } from './drivers/moyu/MoyuDriver.js';
export { createTimestampFitter } from './core/timesync.js';

// dev-only 實機封包擷取（非 SPEC §3 合約；供 demo / fixture 擷取用）。
export { setCapture, isCapturing, getCaptured, clearCaptured } from './utils/debug.js';
export type { CapturedPacket } from './utils/debug.js';

export type {
  CubeEvent,
  SmartCube,
  MacProvider,
  ConnectOptions,
  TimestampFitter,
} from './core/types.js';
