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
- [x] `tests/fixtures/moyu-real.json`：MoYu WeiLong AI 實機封包（R U F' R' U'），實機驗收通過（解密/解析/重建三層對上方塊自報狀態）。
- [x] QiYi 實機連線：**QY-QYSC-A / XMD-TornadoV4-i / Tornado V4 LE 三顆實機皆連線並串流成功**。
      根因是 `requestDevice` 漏宣告 `optionalManufacturerData` → Chrome 濾掉廣播 manufacturer data
      → 抓不到真 MAC → hello 用名稱猜的錯 MAC → 方塊不串流。補上後三顆全通。
      （先前「Tornado V4 LE 是不支援的協議變體」為**誤判**，實為此缺漏；LE 與標準款同協議。）
- [x] QiYi 實機封包 fixture：`tests/fixtures/qiyi-real.json`（QY-QYSC-A 實機，B U R' U' B'）。
      因金鑰固定，測試從**原始加密封包**全程重放：解密 → CRC → 解析 → ACK，並以 CubieCube
      驗證「move 套到前一 facelet = 方塊回報的下一 facelet」5/5 一致。**QiYi 實機驗收通過。**
- [ ] **QiYi 重連需重整網頁**（實機回報）：中斷後再連常不串流，重讀網頁才恢復。研判 `readMacFromAdvertisement`
      的 `watchAdvertisements` 在同一 device 物件二次呼叫會失敗 → 退回名稱推導 MAC（可能錯）→ 不串流；
      重整產生新 device 物件才恢復。**建議修法**：首次由廣播取得真 MAC 後存 localStorage，重連走
      `macProvider` 記住值、不再每次即時抓廣播（需把 driver 解出的真 MAC 暴露給 app 儲存）。
- [ ] demo「🔍 診斷方塊（除錯）」工具：抓廣播（含 MAC）+ 列舉 GATT 服務/特徵值/屬性/可讀值，供未來新型號分析（已就緒）。
- [ ] MoYu 電量/資訊封包實機 fixture（本次擷取未含 0xA1/0xA4）。
- [ ] `TESTING.md`：藍牙 I/O 層手動測試 checklist（SPEC §7 硬體無法進 CI 對策）。

## 範圍外 / 未來（不在 MVP）

- 魔域各代協議差異（WeiLong AI 舊版 vs V10/V11）：以實機型號為準，其他列此。
- 陀螺儀 3D 視覺化、更多品牌（雨花石等）、iOS（Bluefy）測試 — SPEC Phase 4。
