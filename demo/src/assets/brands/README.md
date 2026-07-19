# demo/src/assets/brands — 品牌 LOGO 圖檔

把各品牌 LOGO 放這裡。規格與作圖規範見專案根目錄 [`SPEC_BRAND_LOGOS.md`](../../../../SPEC_BRAND_LOGOS.md)。

## 檔名（全小寫，需與此表一致）

| 檔名 | 品牌 | 判定依據（裝置名稱前綴） |
|---|---|---|
| `gan.svg` | 淦源 GAN | `GAN` / `MG` / `AiCube` |
| `moyu.svg` | 魔域 MoYu | `WCU_MY3` |
| `qiyi.svg` | 奇藝 QiYi（QY 系） | `QY-QYSC` |
| `mofangge.svg` | 魔方格 MFG（XMD 系） | `XMD` |

SVG 首選；只有點陣素材時可用同名 `.png`（實作以 `.svg` 優先）。

## 提醒（詳見 SPEC 第 3、5 節）

- **深色底要看得見**：demo 背景為 `#0f1115`，純黑/深色墨的字標會消失 → 出白/淺色版。
- **商標授權**：LOGO 屬第三方註冊商標，非本專案 GPL 範圍。放圖前請確認可公開散佈，
  並在根目錄 `NOTICE.md` 登錄來源；沒把握的品牌先留空（實作會退回純文字）。

> 此 README 僅為佔位與說明（git 不追蹤空資料夾）。圖檔備齊後可保留或刪除本檔。
