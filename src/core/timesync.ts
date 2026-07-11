// Adapted from csTimer (https://github.com/cs0x7f/cstimer), Copyright Chen Shuang, GPL-3.0
// 線性回歸時間戳校正法為陳霜於 csTimer 首創；亦參考 gan-web-bluetooth 的
// cubeTimestampLinearFit（MIT）。此處抽出演算法翻譯為 TypeScript，不搬 UI/狀態管理。

import type { TimestampFitter } from './types.js';

/**
 * 建立時間戳校正器（SPEC 3.4）。
 *
 * 方塊內部時鐘會相對真實時間漂移（跑快或跑慢）。把每次 move 的
 * (cubeTimestamp, hostTimestamp) 餵進來，對序列做最小平方法線性回歸
 * 求斜率 a（hostTimestamp ≈ a·cubeTimestamp + b）。兩個方塊時間戳之間的
 * 真實耗時即 a·(end − start)，截距 b 相消。
 *
 * 這是未來週賽防作弊的核心：即使方塊回報的時鐘有系統性漂移，也能還原真實耗時。
 *
 * 退化情況（樣本 < 2 或方塊時間戳無變異）時斜率退回 1，即「不校正、直接取差」。
 * cubeTimestamp 為 null 的樣本（bluetooth 漏包後回補的 move）無法納入回歸，略過。
 */
export function createTimestampFitter(): TimestampFitter {
  // 累積和，供增量最小平方法（記憶體 O(1)，可隨時 fit）。
  let n = 0;
  let sumX = 0; // Σ cubeTimestamp
  let sumY = 0; // Σ hostTimestamp
  let sumXY = 0; // Σ cubeTimestamp·hostTimestamp
  let sumXX = 0; // Σ cubeTimestamp²

  function slope(): number {
    if (n < 2) return 1;
    const denominator = n * sumXX - sumX * sumX;
    if (denominator === 0) return 1; // 所有 cubeTimestamp 相同，無法回歸
    return (n * sumXY - sumX * sumY) / denominator;
  }

  return {
    add(cubeTimestamp: number | null, hostTimestamp: number): void {
      if (cubeTimestamp === null) return;
      n += 1;
      sumX += cubeTimestamp;
      sumY += hostTimestamp;
      sumXY += cubeTimestamp * hostTimestamp;
      sumXX += cubeTimestamp * cubeTimestamp;
    },
    fit(startCubeTs: number, endCubeTs: number): number {
      return slope() * (endCubeTs - startCubeTs);
    },
  };
}
