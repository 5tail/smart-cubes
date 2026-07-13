# BACKLOG

工單範圍外、看不順眼但先不動的事項記在這（SPEC §10.3.4）。
決策層排優先序，執行層不得自行順手處理。

## 待辦（依 SPEC Phase 排入）

- [x] Phase 1：GAN driver — 包裝 `gan-web-bluetooth`，RxJS → `CubeEvent`；demo 接真方塊、2D 展開圖、電量。（實機驗收待五尾）
- [x] **決策層**：多品牌單一選擇視窗（SPEC 3.1）已於 2026-07-13 定案並實作：自建涵蓋三家 filters 的
      `requestDevice` 後依名稱前綴分派；GAN 分支以「呼叫期間暫時覆寫 requestDevice 注入已選裝置」
      交由 gan-web-bluetooth 連線（見 SPEC §5 ADR）。若上游未來開放傳入 device，移除該 shim。
- [x] Phase 2：QiYi + MoYu driver — 由 csTimer 移植（`qiyicube.js` / `moyu32cube.js`），fixture 測試覆蓋解密/解析；QiYi ACK 邏輯進 driver。共用 `utils/crypto.ts`(AES-128) 與 `utils/facelets.ts`(CubieCube)。（實機驗收待五尾）
- [x] MAC 記憶（localStorage，SPEC §7 第二層）+ 友善引導對話框（demo）；driver MAC fallback 順序對齊 `gan-web-bluetooth`。GAN 首次一次性輸入後即記住。
- [ ] **決策層**：MAC 記憶要不要進「套件層」（目前只在 demo）。套件保持純粹、把儲存交給 app（macProvider）是刻意選擇；若未來多個下游都要記憶，再評估是否提供內建 localStorage 版。
- [x] GAN 自動抓 MAC 需 `chrome://flags/#enable-experimental-web-platform-features`（`watchAdvertisements`）— 已於 README/demo 說明三層 fallback（開旗標自動抓 / 手動輸入一次 / 記憶）。真正零設定需桌面 App（Electron/Tauri，SPEC Phase 4 週賽專案再議）。
- [x] Phase 3（文件）：README（中英雙語）、CONTRIBUTING、demo 加支援清單與已知限制。
- [ ] Phase 3（發佈）：npm publish 0.1.0 — **待 QiYi 標準版（QY-QYSC）實機驗過再發**。
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
- [x] **QiYi 重連需重整網頁**（實機回報）：根因 `watchAdvertisements` 二次呼叫失敗 → 退回錯 MAC。
      已修：driver 暴露 `mac`；demo 於**收到第一個資料事件後**才存真 MAC（不再存到「連得上卻不串流」的錯 MAC，
      這是 QY 那顆卡住的主因），重連經 `macProvider` 取回真 MAC；記住的 MAC 無法串流時 5 秒自動清除並提示重整。
- [x] **決策層｜介面**：`resetToSolved(): Promise<void>` 已於 2026-07-13 正式納入 `SmartCube`
      凍結合約（SPEC §3.3 + §5 ADR），三家 driver 具體實作升格，demo 直接呼叫。
      QiYi 維持重送 hello（協議無 BLE 重置指令，方塊自身會追蹤實體復原）。
- [x] **3D 立體方塊（demo）**：純 CSS 3D transforms（SPEC §5 ADR 2026-07-13），facelets 權威 +
      move 動畫，與 2D 切換並存；幾何映射有 CubieCube 交叉驗證測試。
- [x] **陀螺儀 3D 姿態（demo）**：GAN gyro quaternion 驅動 3D 方塊即時翻轉（SPEC §5 ADR
      2026-07-13），純 CSS matrix3d；座標對齊/校正回正有 9 例單元測。實機手感待五尾。
- [ ] MoYu 掉包超過移動封包歷史長度時，重建可能漂移；因「基準後以重建為權威」（ADR 2026-07-13），
      不再能靠方塊自報自動復原。實務上移動封包帶多步歷史可自癒短暫掉包；若實機回報漂移，
      決策層再評估顯式 `recoverState()`（重新以自報狀態為基準）。
- [ ] demo「🔍 診斷方塊（除錯）」工具：抓廣播（含 MAC）+ 列舉 GATT 服務/特徵值/屬性/可讀值，供未來新型號分析（已就緒）。
- [ ] MoYu 電量/資訊封包實機 fixture（本次擷取未含 0xA1/0xA4）。
- [ ] `TESTING.md`：藍牙 I/O 層手動測試 checklist（SPEC §7 硬體無法進 CI 對策）。

## 範圍外 / 未來（不在 MVP）

- 魔域各代協議差異（WeiLong AI 舊版 vs V10/V11）：以實機型號為準，其他列此。
- 陀螺儀 3D 姿態**進階**：長時間漂移校正、慣性平滑（即時 1:1 姿態鏡射 + 手動歸正已於
  2026-07-13 完成，見上方）— SPEC Phase 4。
- 更多品牌（雨花石等）、iOS（Bluefy）測試 — SPEC Phase 4。
  （facelets 驅動的 3D 立體方塊 + gyro 即時姿態已於 2026-07-13 提前完成，見上方。）
