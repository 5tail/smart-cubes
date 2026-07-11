# Changelog

本檔案記錄各 Phase 的進度（SPEC §10.4 進度錨）。格式參考
[Keep a Changelog](https://keepachangelog.com/)，版號遵循 [SemVer](https://semver.org/)。

## [Unreleased]

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
