# BACKLOG

工單範圍外、看不順眼但先不動的事項記在這（SPEC §10.3.4）。
決策層排優先序，執行層不得自行順手處理。

## 待辦（依 SPEC Phase 排入）

- [x] Phase 1：GAN driver — 包裝 `gan-web-bluetooth`，RxJS → `CubeEvent`；demo 接真方塊、2D 展開圖、電量。（實機驗收待五尾）
- [ ] **決策層**：多品牌單一選擇視窗（SPEC 3.1「filters 一次涵蓋三家」）。三家 driver 皆已就緒，各有專用入口 `connectSmartCube`(GAN) / `connectQiyiCube` / `connectMoyuCube`。整合障礙：gan-web-bluetooth 自帶 `requestDevice`（僅 GAN filters），無法接收外部已選裝置；三家並陳需決策層決定整合方式（自建涵蓋三家 filters 的 `requestDevice` 後依名稱前綴分派，GAN 分支如何交由 gan-web-bluetooth 連線既有裝置待評估）。此為公開 API 形狀決策，執行層不自行決定。
- [x] Phase 2：QiYi + MoYu driver — 由 csTimer 移植（`qiyicube.js` / `moyu32cube.js`），fixture 測試覆蓋解密/解析；QiYi ACK 邏輯進 driver。共用 `utils/crypto.ts`(AES-128) 與 `utils/facelets.ts`(CubieCube)。（實機驗收待五尾）
- [x] MAC 記憶（localStorage，SPEC §7 第二層）+ 友善引導對話框（demo）；driver MAC fallback 順序對齊 `gan-web-bluetooth`。GAN 首次一次性輸入後即記住。
- [ ] **決策層**：MAC 記憶要不要進「套件層」（目前只在 demo）。套件保持純粹、把儲存交給 app（macProvider）是刻意選擇；若未來多個下游都要記憶，再評估是否提供內建 localStorage 版。
- [ ] GAN 自動抓 MAC 需 `chrome://flags/#enable-experimental-web-platform-features`（`watchAdvertisements`）。一般使用者引導頁待 Phase 3；真正零設定需桌面 App（Electron/Tauri，SPEC Phase 4 週賽專案再議）。
- [ ] Phase 3：README（中英雙語）、CONTRIBUTING、npm publish 0.1.0、demo 加支援清單。
- [x] `src/core/timesync.ts`（線性回歸時間戳校正，`createTimestampFitter`）。
- [x] `src/core/connect.ts`（統一入口；品牌偵測待 Phase 2 多品牌整合）。
- [ ] `src/core/SmartCube.ts`（抽象基底）— 目前 GanDriver 直接實作 `SmartCube` 介面，抽象基底待有第二個 driver 時再視需要抽出。
- [x] `src/utils/`：`crypto.ts`（最小 AES-128）、`facelets.ts`（CubieCube 狀態/轉動代數）。
- [ ] `tests/fixtures/`：目前為 csTimer oracle 產生的合成向量；**實機封包 hex dump 待五尾**（連上真方塊時 dump 原始封包補進 `tests/fixtures/{qiyi,moyu}/`，鎖住真實韌體行為）。
- [ ] `TESTING.md`：藍牙 I/O 層手動測試 checklist（SPEC §7 硬體無法進 CI 對策）。

## 範圍外 / 未來（不在 MVP）

- 魔域各代協議差異（WeiLong AI 舊版 vs V10/V11）：以實機型號為準，其他列此。
- 陀螺儀 3D 視覺化、更多品牌（雨花石等）、iOS（Bluefy）測試 — SPEC Phase 4。
