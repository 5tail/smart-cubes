# CLAUDE.md — maru-smartcube

> 本檔案是每個對話（Phase）開場必讀。開發前先讀本檔 + SPEC 對應章節。

## 專案簡介

**maru-smartcube** 是一個開源 TypeScript 套件，讓瀏覽器（電腦藍牙，Web Bluetooth API）
連線三家智能方塊並輸出統一事件：

| 品牌 | 代表型號 |
|------|---------|
| 淦源 GAN | GAN12 UI / i4 / i Carry(Gen2/3/4) |
| 魔域 MoYu | WeiLong AI V10/V11、AoLong AI |
| 奇藝 QiYi | QiYi AI 3x3 |

**MVP**：一個 npm 套件 + 一個 GitHub Pages 展示頁。展示頁點「連線」選任一品牌方塊，
即時顯示轉動記錄（含時間戳）、方塊當前狀態（2D 展開圖）、電量。

授權：**GPL-3.0**（決策理由見 SPEC 第 5 節 ADR）。完整規格見
`SPEC_SMARTCUBE_20260711_v2.md`。

## 指令

```bash
npm run build       # tsup 打包，輸出 dist/ 的 ESM(.js) + CJS(.cjs) + .d.ts
npm test            # vitest run，跑一次全部測試
npm run test:watch  # vitest watch 模式
npm run typecheck   # tsc --noEmit，型別檢查

# demo（GitHub Pages 展示頁，Vite + 純 TypeScript）
cd demo && npm install && npm run dev     # 本機開發
cd demo && npm run build                  # 產出 demo/dist（Pages 部署用）
```

## 架構規則

- **統一介面（SPEC 第 3 節）是合約**：事件格式、方法簽名、macProvider 機制皆已凍結。
  `src/core/types.ts` 與所有公開 API 唯讀，只有決策層能改（見下方護欄第 1 條）。
- **driver 不得互相引用**：`src/drivers/{gan,qiyi,moyu}/` 各自獨立，
  共用邏輯抽到 `src/core` 或 `src/utils`，driver 之間不得 import。
- **RxJS 不得外露**：對外 API 只用原生 `EventTarget` / callback。
  GAN driver 底層依賴 `gan-web-bluetooth` 的 RxJS Observable，
  必須在 driver 內部轉成本套件的 `CubeEvent`，RxJS 型別不得出現在公開 API。
- **AES 一律用 Web Crypto API**：避免多帶依賴；Web Crypto 不支援的模式
  （如 AES-128-ECB）自行實作最小版本或移植 csTimer 的實作。
- **csTimer 移植守則見 SPEC 第 4 節**：移植的每個檔案開頭註明
  `Adapted from csTimer (https://github.com/cs0x7f/cstimer), Copyright Chen Shuang, GPL-3.0`；
  所有移植來源集中列於 `NOTICE.md`；移植 ≠ 照抄（抽協議邏輯翻譯成 TS，UI 與 csTimer 內部狀態管理不搬）。
- **repo 結構**：套件在根目錄（`src/`），展示頁在 `demo/`，測試 fixture 在 `tests/fixtures/`。

## Repo 結構

```
src/
  core/     types.ts / SmartCube.ts / connect.ts / timesync.ts
  drivers/  gan/ · qiyi/ · moyu/
  utils/    crypto.ts / facelets.ts
  index.ts
tests/      fixtures/（真實封包 hex dump）+ *.test.ts
demo/       Vite + 純 TypeScript 展示頁
```

---

## 工作守則（SPEC 第 9 節，逐條）

1. 每個 Phase 開新對話，開場先讀 `CLAUDE.md` 與本 SPEC 對應章節
2. 統一介面（第 3 節）是合約：driver 實作若發現介面設計有問題，先停下來回報，不要私自改介面
3. 移植 csTimer 程式碼必須遵守第 4 節守則（版權標頭 + NOTICE.md）
4. 所有解析/解密邏輯必須有 fixture 測試才算完成
5. 完成後：commit（訊息含 Phase 編號）→ 更新 CHANGELOG → 回報驗收項目狀態與建議的下一步

---

## 執行層護欄（SPEC 第 10.3 節，每對話生效，逐條）

1. **禁改合約**：`src/core/types.ts` 與所有公開 API 唯讀。發現介面設計有問題 → 停下、寫清楚問題、結束對話，交決策層處理
2. **開場必讀**：CLAUDE.md + 本 SPEC 的當前 Phase 章節（不用讀整份）
3. **測試即驗收**：fixture 測試不過不准 commit；不准為了讓測試通過而修改測試
4. **禁止順手重構**：工單範圍外的程式碼一行都不動，看不順眼記進 `BACKLOG.md` 就好
5. **不確定就停**：任何「兩種做法都好像可以」的時刻 = 需要判斷 = 升級決策層

---

## 防走偏三道錨（SPEC 第 10.4 節）

1. **SPEC = 憲法**：統一介面（第 3 節）+ ADR（第 5 節）只有決策層能改
2. **fixture 測試 = 行為錨**：真實封包 hex dump + 期望輸出鎖住協議邏輯
3. **CHANGELOG + Phase 編號 commit = 進度錨**：冷啟動時讀 CHANGELOG 最後三條 + `git log --oneline -10` 即可還原進度
