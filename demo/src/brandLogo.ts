// 品牌 LOGO 顯示：把協議 brand（gan/moyu/qiyi）+ 裝置名稱映射為「顯示品牌」。
// 規格見根目錄 SPEC_BRAND_LOGOS.md。純函式集中在此供單元測試；圖檔 URL 解析在 main.ts
// （用 import.meta.glob，Vite 打包時改寫成帶 base 的雜湊網址，子路徑部署安全）。

import type { SmartCube } from '../../src/core/types';

/** 展示層品牌 key（與圖檔名一致）：qiyi driver 依名稱前綴細分奇藝(QY) / 魔方格(XMD)。 */
export type DisplayBrand = 'gan' | 'moyu' | 'qiyi' | 'mofangge';

export const DISPLAY_BRAND_LABEL: Record<DisplayBrand, string> = {
  gan: '淦源 GAN',
  moyu: '魔域 MoYu',
  qiyi: '奇藝 QiYi',
  mofangge: '魔方格 MFG',
};

/**
 * 由協議 brand + 裝置名稱推導顯示品牌。
 * 奇藝與魔方格共用同一個 QiYi driver（brand === 'qiyi'），僅靠裝置名稱前綴區分：
 * 名稱以 `XMD` 開頭（如 XMD-TornadoV4）→ 魔方格；其餘 qiyi（QY-QYSC…）→ 奇藝。
 * gan / moyu 直通。
 */
export function displayBrand(brand: SmartCube['brand'], deviceName: string): DisplayBrand {
  if (brand === 'qiyi') {
    return (deviceName ?? '').trim().toUpperCase().startsWith('XMD') ? 'mofangge' : 'qiyi';
  }
  return brand;
}
