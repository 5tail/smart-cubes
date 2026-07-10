/**
 * maru-smartcube — 通用智能方塊連線套件（公開進入點）。
 *
 * Phase 0：僅匯出核心型別（SPEC 第 3 節合約）。
 * 後續 Phase 會補上 connectSmartCube / createTimestampFitter 等實作。
 */

export type {
  CubeEvent,
  SmartCube,
  MacProvider,
  ConnectOptions,
  TimestampFitter,
} from './core/types.js';
