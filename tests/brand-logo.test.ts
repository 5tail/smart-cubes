import { describe, it, expect } from 'vitest';
import { displayBrand, DISPLAY_BRAND_LABEL } from '../demo/src/brandLogo.js';

// 顯示品牌映射（demo 層 LOGO 用）：鎖住 qiyi driver 依名稱前綴細分奇藝/魔方格的行為。
describe('displayBrand', () => {
  it('gan / moyu 直通', () => {
    expect(displayBrand('gan', 'GAN12ui_A1B2')).toBe('gan');
    expect(displayBrand('moyu', 'WCU_MY32_B6EF')).toBe('moyu');
  });

  it('qiyi + QY-QYSC 前綴 → 奇藝(qiyi)', () => {
    expect(displayBrand('qiyi', 'QY-QYSC-A-1234')).toBe('qiyi');
    expect(displayBrand('qiyi', 'QY-QYSC')).toBe('qiyi');
  });

  it('qiyi + XMD 前綴 → 魔方格(mofangge)', () => {
    expect(displayBrand('qiyi', 'XMD-TornadoV4-i')).toBe('mofangge');
    expect(displayBrand('qiyi', 'XMD-TornadoV4LE-00F9')).toBe('mofangge');
  });

  it('前綴判定大小寫不敏感、容忍前後空白', () => {
    expect(displayBrand('qiyi', '  xmd-tornado ')).toBe('mofangge');
    expect(displayBrand('qiyi', 'Xmd-Foo')).toBe('mofangge');
  });

  it('qiyi 其他/空名稱 → 預設歸奇藝(qiyi)', () => {
    expect(displayBrand('qiyi', '')).toBe('qiyi');
    expect(displayBrand('qiyi', 'Unknown')).toBe('qiyi');
  });

  it('四個顯示品牌都有中文標籤（無障礙 alt 用）', () => {
    for (const k of ['gan', 'moyu', 'qiyi', 'mofangge'] as const) {
      expect(DISPLAY_BRAND_LABEL[k]).toBeTruthy();
    }
  });
});
