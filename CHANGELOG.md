# Changelog

本檔案記錄各 Phase 的進度（SPEC §10.4 進度錨）。格式參考
[Keep a Changelog](https://keepachangelog.com/)，版號遵循 [SemVer](https://semver.org/)。

## [Unreleased]

### 實機封包擷取（Phase 2 實機驗收 / fixture 行為錨）

- `src/utils/debug.ts`：dev-only 封包擷取（`setCapture` / `recordPacket` / `getCaptured` /
  `clearCaptured`），預設關閉、零負擔；QiYi / MoYu driver 於收到通知時記錄
  原始加密位元組與 driver 解密後位元組。不記錄 MAC（只存 raw + decoded，避免裝置位址外流）。
- `src/index.ts`：匯出擷取控制（非 SPEC §3 合約）。
- demo：新增「🔴 錄製封包 / ⬇ 下載封包 JSON」；錄製後轉方塊即可匯出
  `{brand, deviceName, packets:[{raw,decoded}], events}`，回傳後補進 `tests/fixtures/`，
  把 csTimer 合成向量升級成真實韌體行為錨。
- 測試 4 例（開關、raw/decoded hex、緩衝清空）。

### MAC 記憶與友善輸入（demo UX；SPEC §7 三層 fallback）

- demo：以 `<dialog>` 引導對話框取代裸 `prompt()` —— 含「MAC 在哪找」圖文、格式驗證/正規化
  （接受 `:`/`-`/空白/無分隔）、與「記住這顆方塊」勾選。
- demo：以 `device.id` 為 key 把 MAC 存進 `localStorage`，某顆方塊輸入一次後永久免問
  （SPEC §7 第二層 fallback）。
- driver：`connectQiyiCube` / `connectMoyuCube` 的 MAC fallback 順序調整為
  `macProvider(device,false)`（app 提供記住值）→ 廣播 → 名稱推導 → `macProvider(device,true)`（手動），
  與 `gan-web-bluetooth` 一致，讓「記住 MAC」對三家品牌一致生效。
- 效果：QiYi / MoYu 名稱可推導 MAC 本就零設定；GAN 首次一次性輸入後即記住，之後全自動。

### Phase 2 — QiYi + MoYu driver（由 csTimer 移植）

- **共用工具（`src/utils/`）**：
  - `crypto.ts`：最小 AES-128（單塊 in-place 加解密），移植自 csTimer `sha256.js` 的 `AES128`。
    Web Crypto 不支援 AES-128-ECB，且兩家皆以 16-byte 單塊為單位，故自帶最小實作。
  - `facelets.ts`：`CubieCube` 方塊狀態表示與 18 個基本轉動代數，移植自 csTimer `mathlib.js`。
    MoYu 只在初始狀態帶一次 facelet，之後靠轉動代數重建當前狀態。
- **QiYi driver（`src/drivers/qiyi/`）**：移植自 csTimer `qiyicube.js`。
  - `protocol.ts`（純函式，fixture 覆蓋）：CRC-16/MODBUS、AES-128-ECB 封包框架、
    hello 建構、facelet（27 bytes→54 字元）與轉動碼（1–12→WCA）解析、hello/state 封包解析與
    **自動 ACK** 內容產生（QiYi 漏送 ACK 會斷線，邏輯進 driver 內部）。金鑰為固定 16-byte，
    MAC 僅用於 hello 內容。
  - `QiyiDriver.ts`：BLE I/O + 事件投遞，每包自動回送 ACK；`connectQiyiCube()` 專用連線入口
    （MAC 三層 fallback：廣播資料 → 名稱推導 → `macProvider`）。
- **MoYu driver（`src/drivers/moyu/`）**：移植自 csTimer `moyu32cube.js`（WeiLong AI，WCU_MY3 前綴）。
  - `protocol.ts`（純函式，fixture 覆蓋）：MAC 推導金鑰/IV、GAN Gen2/3 式 AES+IV 重疊塊加解密、
    bit 欄位解析（狀態 facelet、電量、移動封包的轉動碼/時間增量/moveCnt）。
  - `MoyuDriver.ts`：BLE I/O + 以 `CubieCube` 逐步重建 facelet、累積方塊內部時鐘作為 `cubeTimestamp`；
    `connectMoyuCube()` 專用連線入口（MAC 為金鑰推導必需，同三層 fallback）。
- **測試（無硬體，csTimer 為 oracle）**：以 csTimer 各模組在 Node 直接產生
  加解密向量、facelet/move 解析結果與完整加密封包，存於 `tests/fixtures/*.json`；
  另加 AES FIPS-197 官方向量與方塊代數不變量（逆轉/四轉/sexy×6 還原）做獨立驗證。
  新增 39 例測試（crypto 4、facelets 9、qiyi 協議 11 + driver 5、moyu 協議 10 + driver 5）。
- `src/index.ts`：新增匯出 `connectQiyiCube`、`connectMoyuCube`。
- **實機驗收待五尾**：QiYi AI 3x3 與 MoYu WeiLong AI 各自連線穩定 5 分鐘以上、
  逐步轉動記錄與狀態正確、打亂後可逆推還原（SPEC Phase 2 驗收）。
- **決策層待辦**：SPEC 3.1「三家並陳單一選擇視窗」尚未整合（見 BACKLOG）；
  目前三家為各自的 `connect*Cube()` 入口。

### 時間戳校正 timesync（無硬體）

- `src/core/timesync.ts`：實作 SPEC 3.4 `createTimestampFitter()` —— 對
  (cubeTimestamp, hostTimestamp) 序列做最小平方法線性回歸，消除方塊時鐘漂移還原真實耗時
  （週賽防作弊核心）。移植自 csTimer 的線性回歸法（版權標頭見檔案，NOTICE 已列）。
- `src/index.ts`：匯出 `createTimestampFitter`，補完 SPEC 第 3 節凍結 API。
- 測試 9 例：完美時鐘、偏快/偏慢、截距相消、雜訊逼近、null 樣本略過、樣本不足與零變異退回、反向 fit。

### CI / Pages（基礎建設）

- `ci.yml`：PR 階段自動跑套件與 demo 的 typecheck / test / build。
- 修復 `pages.yml`：demo 打包會 bundle 套件原始碼，需先安裝根目錄相依再 build（改用 `npm ci`）。

### Phase 1 — GAN driver

- `src/drivers/gan/`：包裝 `gan-web-bluetooth`，把其 RxJS `events$` 轉成統一 `CubeEvent`，
  以原生 `CustomEvent(detail)` 投遞（RxJS 不外露）。事件投遞慣例經決策層定案：
  `cube.addEventListener('move', e => (e as CustomEvent<CubeEvent>).detail)`。
- `src/core/connect.ts`：實作 SPEC 3.1 `connectSmartCube()`，Phase 1 委派 GAN driver；
  `macProvider` fallback 已接上。多品牌單一選擇視窗待 Phase 2（見 BACKLOG）。
- `src/index.ts`：匯出 `connectSmartCube`。
- 測試（無硬體）：`ganEventToCubeEvent` 欄位映射 7 例、`GanDriver` 行為 6 例
  （CustomEvent 投遞、指令送出、斷線、connected）。
- demo：改為透過 `connectSmartCube()` 連 GAN 真方塊，即時顯示轉動記錄、2D 展開圖
  （54 貼紙上色，元件在 demo 不進套件）、電量；保留「假資料」路徑供無方塊時預覽。
- **實機驗收待五尾**：GAN 方塊連線後即時顯示每一步轉動與正確狀態、打亂後可逆推還原。

### Phase 0 — 骨架

- tsup + vitest + TypeScript strict 專案設定；`npm run build` 產出 ESM(.js) / CJS(.cjs) / `.d.ts`。
- `src/core/types.ts`：完整實作 SPEC 第 3 節統一介面合約
  （`CubeEvent`、`SmartCube`、`MacProvider`、`ConnectOptions`、`TimestampFitter`）。
- `src/index.ts`：公開進入點，匯出核心型別。
- `CLAUDE.md`：專案簡介、build/test 指令、架構規則，並逐條抄入 SPEC 第 9 節工作守則與第 10.3 節執行層護欄。
- `NOTICE.md` 骨架：列出 csTimer / gan-web-bluetooth 等移植來源與致謝。
- `BACKLOG.md`：待辦與範圍外事項記錄。
- `demo/`：Vite + 純 TypeScript 展示頁骨架，連線按鈕 + 事件 log 區（先接假資料）。
- GitHub Pages workflow：demo 自動部署。
