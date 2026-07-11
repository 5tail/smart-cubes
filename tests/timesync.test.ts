import { describe, it, expect } from 'vitest';
import { createTimestampFitter } from '../src/core/timesync.js';

/**
 * createTimestampFitter 線性回歸校正測試（SPEC 3.4，週賽防作弊核心 —— 測試寫足）。
 *
 * 語意：fit(start, end) 回傳兩個「方塊時間戳」之間校正後的真實耗時（host ms）。
 * 若方塊時鐘 host ≈ a·cube + b，則真實耗時 = a·(end − start)。
 */
describe('createTimestampFitter', () => {
  it('方塊時鐘完美（斜率 1）：真實耗時 = 方塊時間差', () => {
    const f = createTimestampFitter();
    // host = cube + 1000（純平移，斜率 1）
    f.add(0, 1000);
    f.add(1000, 2000);
    f.add(2000, 3000);
    expect(f.fit(0, 2000)).toBeCloseTo(2000, 6);
    expect(f.fit(500, 1500)).toBeCloseTo(1000, 6);
  });

  it('方塊時鐘偏快 5%：校正後耗時比方塊回報的長', () => {
    const f = createTimestampFitter();
    // 真實(host) = 1.05·cube + 500
    for (const cube of [0, 1000, 2000, 3000, 4000]) {
      f.add(cube, 1.05 * cube + 500);
    }
    // 方塊回報耗時 2000，真實應為 2100
    expect(f.fit(0, 2000)).toBeCloseTo(2100, 6);
  });

  it('方塊時鐘偏慢（斜率 0.9）', () => {
    const f = createTimestampFitter();
    for (const cube of [100, 600, 1100, 1600, 2100]) {
      f.add(cube, 0.9 * cube + 30);
    }
    expect(f.fit(100, 1100)).toBeCloseTo(900, 6);
  });

  it('截距相消：起點不從 0 開始也正確', () => {
    const f = createTimestampFitter();
    for (const cube of [10000, 11000, 12000, 13000]) {
      f.add(cube, 2 * cube - 7777);
    }
    expect(f.fit(10500, 12500)).toBeCloseTo(4000, 6); // 斜率 2 × 2000
  });

  it('有雜訊時回歸仍逼近真值（比不校正更準）', () => {
    const f = createTimestampFitter();
    // 真實斜率 1.02（10000ms 方塊時間 → 真實 10200ms），每筆加 ±數 ms 雜訊
    const noise = [+3, -3, +2, -2, +1, -1, 0];
    noise.forEach((dn, i) => {
      const cube = i * 1000;
      f.add(cube, 1.02 * cube + 200 + dn);
    });
    const corrected = f.fit(0, 10000);
    // 校正後落在真值 10200 附近（雜訊下容許幾 ms 誤差）
    expect(Math.abs(corrected - 10200)).toBeLessThan(10);
    // 且明顯優於「不校正」的 10000（把方塊時間直接當真實）
    expect(Math.abs(corrected - 10200)).toBeLessThan(Math.abs(10000 - 10200));
  });

  it('cubeTimestamp 為 null 的樣本被略過（漏包回補的 move）', () => {
    const f = createTimestampFitter();
    f.add(0, 1000);
    f.add(null, 999999); // 應被忽略，不污染回歸
    f.add(1000, 2050); // host = 1.05·cube + 1000
    f.add(2000, 3100);
    expect(f.fit(0, 2000)).toBeCloseTo(2100, 6);
  });

  it('樣本不足（< 2 筆）：退回斜率 1，直接取方塊時間差', () => {
    const f0 = createTimestampFitter();
    expect(f0.fit(0, 1234)).toBe(1234); // 完全沒餵資料

    const f1 = createTimestampFitter();
    f1.add(500, 9999); // 只有一筆
    expect(f1.fit(0, 800)).toBe(800);
  });

  it('方塊時間戳全相同（零變異）：退回斜率 1', () => {
    const f = createTimestampFitter();
    f.add(1000, 5000);
    f.add(1000, 6000);
    f.add(1000, 7000);
    expect(f.fit(0, 300)).toBe(300);
  });

  it('反方向 fit 得到負耗時（end < start）', () => {
    const f = createTimestampFitter();
    for (const cube of [0, 1000, 2000]) f.add(cube, cube + 500);
    expect(f.fit(2000, 0)).toBeCloseTo(-2000, 6);
  });
});
