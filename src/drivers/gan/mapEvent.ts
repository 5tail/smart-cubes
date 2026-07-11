import type { GanCubeEvent } from 'gan-web-bluetooth';
import type { CubeEvent } from '../../core/types.js';

/**
 * 把 gan-web-bluetooth 的 GanCubeEvent 轉成本套件的統一 CubeEvent。
 *
 * 純函式、無副作用，方便直接單元測試（SPEC §10.3.3 測試即驗收）。
 * 回傳 null 表示這個 GAN 事件沒有對應的統一事件（例如 HARDWARE），呼叫端應忽略。
 */
export function ganEventToCubeEvent(e: GanCubeEvent): CubeEvent | null {
  switch (e.type) {
    case 'MOVE':
      return {
        type: 'move',
        move: e.move,
        // 方塊內部時鐘（recovered move 可能為 null）
        cubeTimestamp: e.cubeTimestamp,
        // SPEC 要求 hostTimestamp 為 number；localTimestamp 為 host 時鐘，
        // recovered move 可能為 null，退回事件抵達時間戳（必為 number）。
        hostTimestamp: e.localTimestamp ?? e.timestamp,
      };
    case 'FACELETS':
      // gan 的 facelets 已是 Kociemba URFDLB 54 字元，與 SPEC 一致，直接透傳。
      return { type: 'facelets', facelets: e.facelets };
    case 'BATTERY':
      return { type: 'battery', level: e.batteryLevel };
    case 'GYRO':
      // SPEC quaternion 為 [number,number,number,number]，MVP 只透傳不使用；
      // 依 gan 欄位順序 x,y,z,w 排列。
      return {
        type: 'gyro',
        quaternion: [e.quaternion.x, e.quaternion.y, e.quaternion.z, e.quaternion.w],
      };
    case 'DISCONNECT':
      return { type: 'disconnected' };
    case 'HARDWARE':
      // 無對應統一事件，忽略（型號/韌體資訊 Phase 3 再決定是否納入）。
      return null;
    default:
      return null;
  }
}
