/**
 * maru-smartcube — 通用智能方塊連線套件（公開進入點）。
 *
 * Phase 1：GAN driver + 統一連線入口 connectSmartCube。
 * QiYi / MoYu driver 於 Phase 2 加入；createTimestampFitter 於後續 Phase。
 */

export { connectSmartCube } from './core/connect.js';

export type {
  CubeEvent,
  SmartCube,
  MacProvider,
  ConnectOptions,
  TimestampFitter,
} from './core/types.js';
