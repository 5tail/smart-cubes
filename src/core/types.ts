/**
 * 統一事件與介面定義（SPEC 第 3 節）。
 *
 * 本檔案是凍結合約（SPEC §10.3.1 / §10.6）：只有決策層有權修改。
 * 執行層若發現介面設計有問題，停下、寫清楚問題、結束對話，交決策層處理。
 */

// SPEC 3.2 — 統一事件
export type CubeEvent =
  | {
      type: 'move';
      move: string; // WCA notation: "R", "U'", "F2"…
      cubeTimestamp: number | null; // 方塊內部時鐘 (ms)，無則 null
      hostTimestamp: number; // performance.now()
    }
  | { type: 'facelets'; facelets: string } // 54 字元，Kociemba 順序 URFDLB
  | { type: 'battery'; level: number } // 0–100
  | { type: 'gyro'; quaternion: [number, number, number, number] } // 僅 GAN，MVP 只透傳不使用
  | { type: 'connected' }
  | { type: 'disconnected' }
  | { type: 'error'; error: Error };

// SPEC 3.3 — 統一方法
export interface SmartCube extends EventTarget {
  readonly brand: 'gan' | 'moyu' | 'qiyi';
  readonly deviceName: string;
  requestState(): Promise<void>; // 主動要求方塊回報 facelets
  requestBattery(): Promise<void>;
  disconnect(): Promise<void>;
}

// SPEC 3.1 — 統一連線入口的 macProvider 機制
// QiYi / GAN 需要 MAC 推導 AES 金鑰時的 fallback。
// 回傳 null = 讓 driver 自行從廣播資料解析。
export type MacProvider = (
  device: BluetoothDevice,
  isFallback: boolean,
) => Promise<string | null>;

export interface ConnectOptions {
  macProvider?: MacProvider;
}

// SPEC 3.4 — 時間校正工具（createTimestampFitter 回傳的物件）
export interface TimestampFitter {
  // 每次 move 事件餵入兩邊時間戳
  add(cubeTimestamp: number | null, hostTimestamp: number): void;
  // solve 結束後取得校正後的真實耗時
  fit(startCubeTs: number, endCubeTs: number): number;
}
