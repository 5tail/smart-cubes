/**
 * maru-smartcube — 通用智能方塊連線套件（公開進入點）。
 *
 * GAN driver + 統一連線入口 connectSmartCube + 時間戳校正 createTimestampFitter。
 * QiYi / MoYu driver 於 Phase 2 加入。
 */

export { connectSmartCube } from './core/connect.js';
export { createTimestampFitter } from './core/timesync.js';

export type {
  CubeEvent,
  SmartCube,
  MacProvider,
  ConnectOptions,
  TimestampFitter,
} from './core/types.js';
