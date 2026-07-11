# 貢獻指南 Contributing

歡迎為 maru-smartcube 擴充品牌支援與回傳實機封包。本檔講兩件最常見的事：
**(A) 新增一家品牌 driver**、**(B) 用診斷 / 錄製工具交封包 fixture**。

> 本專案以 **GPL-3.0** 授權；送出 PR 即表示你的貢獻同樣以 GPL-3.0 釋出。
> 從 csTimer 等 GPL 專案移植程式碼是允許的，但必須遵守 [移植守則](#移植守則) 標註來源。

Welcome! The two most common contributions are **(A) adding a brand driver** and
**(B) submitting real-hardware packet fixtures**. Both are explained below (English notes inline).

---

## 開發環境 Setup

```bash
npm install
npm run build       # tsup → dist/（ESM + CJS + d.ts）
npm test            # vitest run（所有 fixture 測試）
npm run typecheck   # tsc --noEmit
```

送 PR 前請確定 `npm test`、`npm run typecheck`、`npm run build` 三者皆綠。

---

## 架構速覽 Architecture

```
src/
  core/     types.ts（凍結合約）· connect.ts · timesync.ts
  drivers/  gan/ · qiyi/ · moyu/     ← 每家一個資料夾，彼此不得互相 import
  utils/    crypto.ts（AES-128）· facelets.ts（CubieCube 狀態代數）· debug.ts（封包擷取）
  index.ts  ← 公開匯出
tests/      *.test.ts + fixtures/（真實封包 hex dump）
demo/       Vite 展示頁（含診斷 / 錄製工具）
```

三條硬規則（違反 = PR 不會被合）：

1. **不得改合約**：`src/core/types.ts` 與公開 API 是凍結的統一介面。覺得介面有問題？
   開 issue 討論，別在 PR 裡順手改。
   *Do not touch `src/core/types.ts` or the public API — it's a frozen contract.*
2. **driver 之間不得互相 import**：共用邏輯抽到 `src/core` 或 `src/utils`。
   *Drivers must not import each other; share via `core` / `utils`.*
3. **RxJS 等第三方型別不得外露**：driver 內部可用，但對外只回傳統一的 `CubeEvent`（原生 `EventTarget`）。
   *No third-party types (e.g. RxJS) in the public surface — convert to `CubeEvent` inside the driver.*

---

## A. 新增一家品牌 driver

以 `qiyi` / `moyu` 為範本。一個 driver 拆成「純協議函式」+「BLE I/O 類別」兩層，
好處是協議層可完全用 fixture 測試、不需要硬體。

1. **建資料夾** `src/drivers/<brand>/`，放兩個檔：
   - `protocol.ts` —— **純函式**，無 BLE、無副作用：service/characteristic UUID、名稱前綴、
     金鑰/IV 推導、封包框架與 CRC、facelet（54 字元）與轉動碼（→WCA）解析。這一層是測試主戰場。
   - `<Brand>Driver.ts` —— 實作 `SmartCube` 介面的類別 + 一個 `connect<Brand>Cube()` 連線入口。
     只負責 BLE I/O 與把 `protocol.ts` 的輸出包成 `CubeEvent`（用 `CustomEvent(detail)` 投遞）。
2. **實作 `SmartCube` 介面**（見 `src/core/types.ts`）：
   `brand` / `deviceName` / `requestState()` / `requestBattery()` / `disconnect()`，
   並 emit 統一事件 `move` / `facelets` / `battery` / `connected` / `disconnected` / `error`。
   未知韌體版本要 emit `error`，不要 silent fail。
3. **MAC / 金鑰**：若協議靠 MAC 推導金鑰，走三層 fallback（廣播解析 → `macProvider` → 記憶），
   對齊現有 driver 的 `ConnectOptions.macProvider` 用法。
4. **ACK 等韌體怪癖進 driver 內部**（例：QiYi 漏回 ACK 會斷線，ACK 邏輯就藏在 driver）。
5. **匯出**：在 `src/index.ts` 加 `export { connect<Brand>Cube } from './drivers/<brand>/<Brand>Driver.js';`。
6. **測試**（見下節，**沒有 fixture 測試的解析邏輯不算完成**）。
7. **文件**：README 的 [已驗證型號] 表加一列（標清楚是「已驗證」還是「待驗 / 已知不支援」），
   demo 支援清單同步更新；有移植就補 `NOTICE.md`。

> 想接第二個 driver 但發現該抽共用基底類別？先開 issue，不要在 PR 裡自行大改結構
> （`src/core/SmartCube.ts` 抽象基底是決策層待辦，見 BACKLOG）。

---

## B. 交封包 fixture（社群擴充的核心）

我們無法為每家每代方塊備硬體，所以**真實封包 fixture 就是協議正確性的錨**。
展示頁內建兩個工具幫你零手工擷取：

### 1. 🔍 診斷方塊（未知型號 / 名稱前綴不符時）

用於「新品牌或新型號連不上」。開 [展示頁](https://5tail.github.io/smart-cubes/)（或本機 `cd demo && npm run dev`）：

1. 點 **🔍 診斷方塊**，在瀏覽器視窗選你的方塊。
2. 工具會蒐集 6 秒廣播（manufacturer / service data、UUID、RSSI）與已授權服務的特徵值。
3. 自動下載 `maru-diagnose-*.json`。

> 想抓含真 MAC 的廣播，Chrome 要先開
> `chrome://flags/#enable-experimental-web-platform-features`（`watchAdvertisements`）。

### 2. 🔴 錄製封包（driver 已能連、要鎖協議行為）

用於「driver 連得上，要把某型號的真實韌體行為存成測試」：

1. 先用對應按鈕連上方塊（GAN / QiYi / MoYu）。
2. 點 **🔴 錄製封包**（會清空緩衝並開始擷取原始加密位元組 + driver 解密後位元組）。
3. **緩慢、清楚地做一段已知操作**（例如 `R U F' R' U'`），每步之間停頓一下。
4. 點 **⏹ 停止錄製** → **⬇ 下載封包 JSON**，得到 `maru-capture-<brand>-*.json`。

匯出的 JSON 長這樣（**不含 MAC**，只存 `raw`=原始加密、`decoded`=解密後、`events`=demo 解出的事件）：

```jsonc
{
  "brand": "moyu",
  "deviceName": "WCU_MY32_XXXX",
  "capturedAt": "2026-…",
  "packets": [{ "brand": "moyu", "t": 123, "raw": "…hex…", "decoded": "…hex…" }],
  "events":  [{ "type": "move", "move": "R", "cubeTimestamp": 100, "hostTimestamp": 1.0 }]
}
```

### 3. 提交

- 開 issue 或 PR，附上：**方塊完整型號名稱 + 韌體版本**、你實際做的操作序列、下載的 JSON。
- PR 的話：把封包放進 `tests/fixtures/<brand>-*.json`，並寫一支
  `tests/<brand>-real.test.ts` 斷言「解出的轉動序列 = 實際操作」「每個狀態 facelet 合法」，
  可能的話做**交叉驗證**（由 solved 用 `CubieCube` 逐步重建 facelet，對上方塊自報的狀態封包）——
  參考現有的 `tests/moyu-real.test.ts`。
- **隱私**：擷取工具刻意不記錄 MAC；請不要在 issue / fixture 裡貼你的方塊 MAC。

---

## 測試守則 Testing rules

1. **解析 / 解密邏輯必須有 fixture 測試才算完成**（SPEC §10.3.3）。
2. **不准為了讓測試過而改測試**。fixture（真實封包）是行為錨，改它 = 改需求，先討論。
3. 無硬體時可用 csTimer 當 oracle 產生向量（見 `tests/fixtures/cstimer-oracle.json`），
   但真實韌體 fixture 優先。

---

## 移植守則 Porting rules（SPEC §4）

從 csTimer 等 GPL 專案移植時：

- 移植 ≠ 照抄：抽「協議邏輯」翻成 TypeScript，不搬 UI 與原專案的內部狀態管理。
- **每個移植檔案開頭**註明：
  `Adapted from csTimer (https://github.com/cs0x7f/cstimer), Copyright Chen Shuang, GPL-3.0`
- 所有移植來源集中列於 [`NOTICE.md`](NOTICE.md)（補上原始檔案路徑與對應本專案檔案）。

---

## Commit / PR

- commit 訊息用範疇前綴（`feat(qiyi):` / `fix(moyu):` / `docs:` / `test:`…）。
- PR 前跑過 `npm test && npm run typecheck && npm run build`。
- 有行為變更就更新 `CHANGELOG.md`；範圍外但看到的問題記進 `BACKLOG.md`（別順手修）。

有問題就開 issue —— 尤其是任何「兩種做法好像都行」的介面判斷，先問再動手。
