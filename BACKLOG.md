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
- [x] **陀螺儀 3D 姿態（demo，GAN）**：GAN gyro quaternion 驅動 3D 方塊即時翻轉（SPEC §5 ADR
      2026-07-13），純 CSS matrix3d；座標對齊/校正回正有 9 例單元測。連上 GAN 翻一下方塊即
      **自動開啟** gyro 模式（不必先找開關），並有診斷文案顯示是否收到 gyro 事件。
- [x] **Tornado V4 AI 陀螺儀封包格式已逆向（2026-07-16，決策層）**：由 XMD-TornadoV4LE-00F9
      實機 259 包翻轉封包破解 —— `0xcc` 框架 `[cc 10 seq ts:2 ?:1 quat(4×int16 BE) crc:2]`，
      offset 6 起四元數 norm 變異僅 0.03%、CRC16/MODBUS 259/259 全中。已在 `protocol.ts`
      實作 `parseGyroQuaternion` + `parseCubeData` 0xcc 分支投遞 gyro 事件，fixture 測試 3 例。
- [ ] **Tornado V4 陀螺儀座標校正（剩最後一哩）**：封包格式已鎖定、gyro 事件已流出、demo 已
      渲染，但**四元數分量順序（哪個是 w）與座標系對映未知**（無官方文件）。目前暫用 GAN 的
      座標轉換當初值 → 方塊會跟著動但軸向可能不對。需一次「已知動作」實機校正：請使用者做
      指定翻轉（如白上綠前 → 整顆順時針轉 90°）並回報畫面轉向，即可一次解出分量順序 + 軸號。
- [x] **MoYu 陀螺儀已實作（2026-07-17，決策層）**：格式由三個獨立社群來源交叉驗證
      （lukeburong/weilong-v10-ai-protocol、BTimeApp/BTime、DCTimer-BLE），無需自行錄封包逆向：
      `[0xAB][w,x,y,z 各 int32 LE ÷2^30]`，且須先送 0xAC 開啟指令（byte[2]=1）——
      這解釋 csTimer 為何只留註解掉的 `msgType == 171`（它不送開啟指令）。
      driver 連線 init 尾端自動開啟；座標系（x=右,y=後,z=上）與 GAN 相同故原樣透傳。
- [x] **MoYu 陀螺儀實機驗收通過（2026-07-17，使用者 Android 平板回報）**：3D 跟著魔域
      方塊轉向，文件記載的座標系（與 GAN 相同）原樣透傳即正確，無需軸向校正。
- [ ] **QiYi 0x04 狀態覆寫實機驗收**：resetToSolved 已改送覆寫指令（文件+三實作交叉驗證，
      fixture 測試綠燈），待實機在 QY-QYSC 與 Tornado V4 各按一次「六面重置」確認畫面變
      六面且後續轉動正常。若 Tornado 韌體拒收（文件主要對象是 QY-QYSC），錄封包回報。
- [ ] MoYu 掉包超過移動封包歷史長度時，重建可能漂移；因「基準後以重建為權威」（ADR 2026-07-13），
      不再能靠方塊自報自動復原。實務上移動封包帶多步歷史可自癒短暫掉包；若實機回報漂移，
      決策層再評估顯式 `recoverState()`（重新以自報狀態為基準）。
- [ ] demo「🔍 診斷方塊（除錯）」工具：抓廣播（含 MAC）+ 列舉 GATT 服務/特徵值/屬性/可讀值，供未來新型號分析（已就緒）。
- [ ] **MoYu 廣播 MAC 之謎（決策層複查 2026-07-13 留檔）**：統一入口下廣播解析值曾致金鑰錯
      （已以「名稱推導優先」修復）。但 csTimer 本身是廣播優先且能動 —— 疑似我們解析到
      非 MAC 的 manufacturer data 封包（第一包就收，QiYi 有「含 MAC 的掃描回應較晚到」前科）。
      **一錘定音法**：demo「🔍 診斷方塊」對 WCU_MY32_B6EF 抓 6 秒合併廣播，看各 cic 的
      payload 末 6 bytes 反序是否 = `CF:30:16:00:B6:EF`。若相等 → 廣播值其實沒壞，回歸另有
      根因需重查；若不等/多包不一 → 證實解析到錯包，可考慮改為「等到出現 CF:30:16 前綴的
      封包才採用」。
- [ ] **MoYu wrong-key 回復機制（殘餘風險）**：若存在「名稱猜不準金鑰」的魔域機型
      （csTimer 留 prompt 就是為此），名稱優先會靜默失敗且 fallback 不可達（名稱有值就
      不會走到 macProvider 手動）。目前支援清單內無此機型證據，暫不做投機性重試；
      實機回報時再議（可仿 csTimer isWrongKey：解密後 messageType 全非法 → 換下一個 MAC 來源重試）。
- [ ] MoYu 電量/資訊封包實機 fixture（本次擷取未含 0xA1/0xA4）。
- [ ] `TESTING.md`：藍牙 I/O 層手動測試 checklist（SPEC §7 硬體無法進 CI 對策）。

## 範圍外 / 未來（不在 MVP）

- 魔域各代協議差異（WeiLong AI 舊版 vs V10/V11）：以實機型號為準，其他列此。
- 陀螺儀 3D 姿態**進階**：長時間漂移校正、慣性平滑（即時 1:1 姿態鏡射 + 手動歸正已於
  2026-07-13 完成，見上方）— SPEC Phase 4。
- 更多品牌（雨花石等）、iOS（Bluefy）測試 — SPEC Phase 4。
  （facelets 驅動的 3D 立體方塊 + gyro 即時姿態已於 2026-07-13 提前完成，見上方。）
