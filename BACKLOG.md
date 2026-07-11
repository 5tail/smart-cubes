# BACKLOG

工單範圍外、看不順眼但先不動的事項記在這（SPEC §10.3.4）。
決策層排優先序，執行層不得自行順手處理。

## 待辦（依 SPEC Phase 排入）

- [x] Phase 1：GAN driver — 包裝 `gan-web-bluetooth`，RxJS → `CubeEvent`；demo 接真方塊、2D 展開圖、電量。（實機驗收待五尾）
- [ ] **決策層**：多品牌單一選擇視窗（SPEC 3.1「filters 一次涵蓋三家」）。gan-web-bluetooth 自帶 `requestDevice`（僅 GAN filters），故 Phase 1 為 GAN 專用選擇視窗；三家並陳需在 Phase 2 其他 driver 就緒後由決策層決定整合方式。
- [ ] Phase 2：QiYi + MoYu driver — 由 csTimer 移植，fixture 測試覆蓋解密/解析；ACK 邏輯進 driver。
- [ ] Phase 3：README（中英雙語）、CONTRIBUTING、npm publish 0.1.0、demo 加支援清單。
- [ ] `src/core/`：`SmartCube.ts`（抽象基底）、`connect.ts`（品牌偵測 + 統一入口）、`timesync.ts`（線性回歸）。
- [ ] `src/utils/`：`crypto.ts`（AES / Web Crypto）、`facelets.ts`（狀態表示與驗證）。
- [ ] `tests/fixtures/`：實機封包 hex dump（Phase 2 隨 driver 補上）。
- [ ] `TESTING.md`：藍牙 I/O 層手動測試 checklist（SPEC §7 硬體無法進 CI 對策）。

## 範圍外 / 未來（不在 MVP）

- 魔域各代協議差異（WeiLong AI 舊版 vs V10/V11）：以實機型號為準，其他列此。
- 陀螺儀 3D 視覺化、更多品牌（雨花石等）、iOS（Bluefy）測試 — SPEC Phase 4。
