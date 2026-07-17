# Changelog

本檔案記錄各 Phase 的進度（SPEC §10.4 進度錨）。格式參考
[Keep a Changelog](https://keepachangelog.com/)，版號遵循 [SemVer](https://semver.org/)。

## [Unreleased]

### 3D 互動預設改為拖曳（實機回報，2026-07-17）

- 使用者回饋：不需要做「已知動作校正」，直接用觸控/滑鼠轉 3D 更實際。
- 拖曳環視（觸控/滑鼠，同一套 pointer events）恢復為**預設互動、隨時可用**；
  陀螺儀改為**純手動開關**：偵測到 gyro 事件只「亮開關」，不再自動開啟搶走拖曳。
  開啟時拖曳暫停、關閉即恢復。提示文案同步改寫。
- Tornado V4 陀螺儀的座標校正因此降級為 nice-to-have（BACKLOG 保留），
  拖曳已滿足「看任意面」的需求。
- Playwright 驗證：預設拖曳可轉（transform rotateX/rotateY 隨拖曳變化）；118 例綠燈。

### Tornado V4 陀螺儀封包逆向 — QiYi driver 投遞 gyro 事件（決策層 2026-07-16）

實機回報 Tornado V4 兩顆能串流但 3D 不跟著翻。查證官方規格確有高精度陀螺儀，但社群文件
（Flying-Toast，對象是無陀螺儀的 QY-QYSC）與 csTimer 皆無此格式。由使用者平板擷取的
XMD-TornadoV4LE-00F9「整顆翻轉」259 包**逆向破解**：

- 根因：`parseCubeData` 首行 `if (msg[0] !== 0xfe) return` 把姿態封包（`0xcc` 框架）直接丟棄；
  這些封包其實已通過 driver 既有的 AES-ECB 解密與 CRC-16/MODBUS 驗證。
- 封包格式（鐵證）：`[0xcc, 0x10, seq, ts:2B-BE, ?:1B, quaternion:4×int16 BE @off6, crc:2B-LE]`。
  259 包自由翻轉中 offset 6 起 4×int16 的 norm 變異僅 **0.03%**（單位四元數的鐵證），
  且前 14 bytes 的 CRC-16/MODBUS **259/259** 全中。
- 實作：`protocol.ts` 新增 `parseGyroQuaternion`（offset 6、BE、逐包正規化）、`FRAME_GYRO=0xcc`，
  `parseCubeData` 加 0xcc 分支投遞 `gyro` 事件（無需 ACK，實機連續串流未斷線佐證）；
  `ParsedQiyiEvent` 加 gyro 變體，QiyiDriver 既有事件迴圈自動透傳。
- fixture 測試 3 例（`tests/qiyi-gyro.test.ts`）：真實加密封包走完整路徑 → 單位四元數；118 例綠燈。
- **待最後一哩**：四元數分量順序（w 位置）與座標系對映無官方文件，暫用 GAN 座標轉換當初值 →
  方塊會動但軸向可能不對，需一次「已知動作」實機校正（見 BACKLOG）。

### MoYu 金鑰自動探測 + 死連線修復（決策層 2026-07-13，實機「完全連不到」定位）

實機關鍵回報：**QiYi/GAN 都能連，只有魔域（多顆）完全連不到**。這排除硬體/環境，
坐實是魔域這條路的程式問題，且從「連上不串流」惡化成「連不到」。定位到兩個機制 bug：

- **死連線 → 不再廣播（解釋「連不到」）**：BLE 裝置連線中不廣播、一次只容一個連線。
  魔域連上但金鑰錯（不串流）時，舊看門狗只印錯誤、**從不斷開 GATT** → 方塊被死連線佔住 →
  不再廣播 → 下次選擇視窗找不到它。多顆魔域各被卡一次後全數消失（QiYi/GAN 正常串流故不卡）。
  修法：(a) demo 看門狗 6 秒無資料即主動 `disconnect()` 釋放 GATT；(b) `connectMoyuDevice`
  金鑰全數探測失敗時主動 `gatt.disconnect()` 再拋錯 —— 失敗連線不再遺留死連線。
- **金鑰自動探測（根治不串流，取代前幾輪的 MAC 順序猜測）**：QiYi（固定金鑰）能動、
  只有魔域（MAC 推導金鑰）不行 = 金鑰錯。改為連上後對候選 MAC（記住值→名稱推導→廣播→
  手動）**逐一探測**：送 STATE 請求、若回封包能以該金鑰解出合法訊息型別即採用（csTimer
  isWrongKey 精神，自我修正）。不再需要人為判定「名稱 vs 廣播誰對」——哪組能解就用哪組，
  並經 `macSource` 回報是哪組贏（實機終於能拿到 ground truth）。
- `defaultMacFromName` 改為大小寫不敏感（小寫後綴名稱不再漏接）。
- **魔域永不跳 MAC 輸入框**（實機回報：探測落到手動 → 跳出使用者無從填的 MAC 對話框）：
  候選鏈移除「手動輸入」（魔域金鑰用推導 MAC，使用者無從得知真 MAC）。探測都沒過但有候選 →
  用最可能的（名稱推導優先）**直接連上**，交看門狗判斷；完全無候選才斷線拋錯。
- 測試：MoYu 連線改寫為探測行為（記住值即正解、名稱錯→改用廣播、探測全失敗→名稱推導直連
  且不跳輸入框、完全無 MAC→斷線拋錯）；115 例綠燈。

### MoYu 連線診斷儀表（決策層 2026-07-13，實機仍不串流的除錯輪）

- 前情：名稱優先修法部署後（Pages run#17 = main `1e5fac8`，已驗證），實機 MoYu 仍「連上但
  零事件」。driver 資料流複查無可疑處 → 問題幾乎必在「實際採用的 MAC」，但畫面看不到。
- **連線行顯示 MAC 與來源**：`已連線：{名稱}（{brand}）· MAC xx（記住值/名稱推導/廣播/手動）`。
  QiyiDriver/MoyuDriver 新增 `macSource` 診斷欄位；GanDriver 補 `mac`（gan-web-bluetooth 的
  `deviceMAC`，附帶效益：GAN 首次串流後 demo 也會記住 MAC，之後重連不再依賴旗標）。
- **看門狗一般化**：原本只在「用了記住值」時檢查；改為所有品牌/來源連上 6 秒無資料就在
  log 報出「使用的 MAC＋來源＋下一步指引」，不再靜默。
- **名稱推導大小寫不敏感**：`WCU_MY32_b6ef`（小寫後綴）不再靜默漏接名稱推導而誤入廣播路徑。
- 測試 115 例綠燈（macSource 斷言 + 小寫名稱推導 +1）。

### 陀螺儀 3D 姿態（demo，決策層 2026-07-13）

- **3D 方塊跟著實體翻轉**：GAN `gyro` 事件的 quaternion 驅動 3D 方塊姿態（純 CSS `matrix3d`，
  零依賴；決策見 SPEC §5 ADR 2026-07-13）。套件層對 gyro 仍只透傳不解讀，消費全在 demo。
- **座標對齊**（最易翻車處）：GAN 右手系 +X=R/+Y=B/+Z=U → 本專案 3D 座標 +X=R/+Y=U/+Z=F，
  差固定基變換（繞 X −90°）。`demo/src/cube3dMap.ts` 新增四元數代數（乘積/共軛/正規化）、
  GAN→方塊座標基變換、四元數→3×3 矩陣→CSS matrix3d（含 y-down 鏡射）與「校正基準」轉換。
- **UI**：3D 面板加「🧭 陀螺儀姿態」開關（僅連 GAN 啟用）+「校正正面」按鈕。開啟時方塊朝向
  由陀螺儀驅動、手動拖曳環視停用、當前姿態設為正面基準；QiYi/MoYu 無 gyro 事件故停用開關；
  2D 檢視時整列隱藏。gyro 為高頻事件，只驅動姿態、不進事件 log。
- 測試 +9 例（`tests/gyro-orientation.test.ts`）：四元數 q⊗q⁻¹=identity、GAN 各軸基變換映射、
  繞 U 軸 90°、identity→單位 matrix3d、校正後回正不變式。Playwright 另驗 UI 接線
  （控制列顯隱、開關切換使方塊 transform 由 orbit 轉為 matrix3d）。
- 驗收：111 例測試綠燈（+9）；套件與 demo typecheck/build 通過。**實機姿態手感待五尾**
  （GAN 方塊在手上翻轉，確認 3D 跟隨方向正確、校正歸正符合直覺）。
- **UX 修正（實機回報「連上但不轉」）**：連上 GAN、翻一下方塊喚醒陀螺儀後**自動開啟** gyro
  模式（不必先找開關），並加診斷文案（「轉一下方塊喚醒陀螺儀…」→「✓ 陀螺儀運作中」）讓使用者
  能判斷 gyro 事件是否真的送達。手動點過開關則尊重使用者選擇不自動開。
- **QiYi/MoYu 陀螺儀現況**：兩家**無現成協議可移植**（csTimer moyu32cube.js 只有註解掉的
  opcode 171、qiyicube.js 完全沒有 gyro），需實機錄封包逆向 quaternion 格式（見 BACKLOG）；
  driver 的 recordPacket 已會錄下這些封包，擷取工具現成。

### 統一選擇視窗（SPEC 3.1 補完，決策層 2026-07-13）

- **`connectSmartCube()` 改為三家並陳的單一選擇視窗**：`src/core/chooser.ts` 組出涵蓋三家的
  `requestDevice` 參數（名稱前綴 filters、GAN Gen2/3/4 + QiYi + MoYu services、CIC 聯集），
  依裝置名稱前綴分派品牌（實作方式見 SPEC §5 ADR 2026-07-13）。
- **GAN 分派**：gan-web-bluetooth 的 `connectGanCube` 自帶 requestDevice、吃不下外部裝置，
  以 `withRequestDeviceOverride`（呼叫期間暫時覆寫、finally 還原）注入已選裝置，不 fork 上游。
- **QiYi / MoYu 抽出 `connect*Device(device, options)`**（接受已選裝置）；原 `connect*Cube()`
  專用入口保留，單品牌下游仍可 tree-shake。
- demo 三顆連線按鈕收斂為一顆「🔗 連線方塊（GAN / QiYi / MoYu）」。
- 測試 +9 例（`tests/chooser.test.ts`）：品牌偵測、requestDevice 參數聯集、
  覆寫/還原/拋錯還原。
- 註：GAN 首連仍需 MAC（開實驗旗標自動抓，或輸入一次後由 demo 記住）——Web Bluetooth
  刻意不給網頁 MAC，且 GAN 裝置名稱不含 MAC（QiYi/MoYu 有），詳見 ADR。
- **回歸修復（實機回報「MoYu 能連線但沒動作」；決策層複查後修正論述）**：統一入口宣告
  三家 CIC 後，MoYu 的廣播 MAC 路徑首次真正啟用（Phase 2 沒宣告 manufacturerData、廣播
  拿不到，走的一直是名稱推導），而廣播解析值在實機上導致金鑰錯 → 解密全為垃圾 → 連上
  卻零事件。名稱推導值（`CF:30:16:` + 名稱末四碼，與 csTimer 同式）已由實機 fixture 證實
  可解密，故 fallback 改為**名稱推導優先於廣播**（QiYi 相反：金鑰固定、hello 需真實 MAC、
  名稱推導不可靠，維持廣播優先）。註：csTimer 本身廣播優先但配有 wrong-key 重問機制；
  廣播值為何是壞的（疑似解析到非 MAC 的 manufacturer data 封包）待實機診斷 dump 確認
  （見 BACKLOG）。回歸測試 +3 例（名稱可推導→不碰廣播；記住值最優先；名稱不可解析→
  廣播兜底仍可用，並鎖住末 6 bytes 反序的解析順序）。

### 3D 立體方塊 + `resetToSolved()` 入約（決策層，2026-07-13）

四項決策已寫入 SPEC §5 ADR（2026-07-13 四條），本節為實作記錄：

- **`resetToSolved(): Promise<void>` 正式納入凍結 `SmartCube` 介面**（SPEC §3.3）：
  三家 driver 既有具體實作直接升格（GAN 原生 `REQUEST_RESET`；MoYu 歸零重建；QiYi 重送 hello）。
  demo 改為直接呼叫（移除型別守衛）。README 中英 API 區塊同步。
- **3D 立體方塊（demo，不進套件）**：`demo/src/cube3d.ts` 純 CSS 3D transforms（零依賴）——
  26 cubie + `preserve-3d`，貼紙上色、每步轉層動畫（快轉時自動跳過動畫）、拖曳環視；
  與 2D 展開圖以「3D / 2D」切換並存（記住選擇）。
  `demo/src/cube3dMap.ts` 為純幾何映射（facelet index ↔ cubie 座標/法向、WCA 轉動 → 轉層旋轉），
  `tests/cube3d-map.test.ts`（6 例）以 CubieCube 代數為 oracle 交叉驗證 18 個基本轉動全數一致。
- **狀態模型（ADR）**：`facelets` 事件為權威、`move` 只驅動動畫與本地預測，預測不符時以權威 snap。
  **MoYu 建立基準後，driver 的 facelets 事件一律投遞 driver 重建狀態**（方塊自報僅作初始基準）——
  方塊自身追蹤器不知道 `resetToSolved()`，重置後自報會與重建打架（moyu-driver 測試 +2 例）。
  demo 僅對 GAN 每步 `requestState()`（MoYu/QiYi 每步已自帶 facelets）。
- 假資料模式改為維護整顆狀態（CubieCube），每步 move 後投遞一致的 facelets，2D/3D 皆可預覽。
- 陀螺儀（gyro）3D 姿態本輪不做，維持 SPEC 3.2「只透傳不使用」，留在 Phase 4。
- 驗收：87 例測試綠燈（+8）；套件與 demo 的 typecheck/build 通過；demo 以 headless Chromium
  實際渲染驗證（初始配色、打亂後 2D/3D 一致、拖曳環視）。

### QiYi 實機連線修復 ✅（三顆奇藝全通）

- `connectQiyiCube` 的 `requestDevice` 補上 `optionalManufacturerData: QIYI_CIC_LIST`。
  Chrome 只有在宣告製造商 ID 時才會在廣播交出 manufacturer data（含真實 MAC）；
  漏宣告 → 抓不到真 MAC → hello 用名稱推導的錯 MAC → 方塊連上卻不串流（零事件）。
- 實機驗證：**QY-QYSC-A / XMD-TornadoV4-i / Tornado V4 LE 三顆皆連線並串流成功**。
  （先前判定「Tornado V4 LE 為不支援變體」係此缺漏所致的誤判，已更正；LE 同協議。）
- demo 診斷工具 `requestDevice` 同步補上，使診斷能顯示真實 MAC。
- **QiYi 實機驗收通過**：`tests/fixtures/qiyi-real.json`（QY-QYSC-A 實機封包）+
  `tests/moyu`… 風格的 `qiyi-real.test.ts`（4 例）。因奇藝金鑰固定，測試從原始加密封包
  全程重放（解密 → CRC → 解析 → ACK），並用 CubieCube 驗證 move↔facelet 內部一致 5/5。
- 重連穩定化：QiyiDriver/MoyuDriver 暴露 `mac`，demo 於**收到第一個資料事件後**才把真 MAC
  存進 localStorage（避免存到「連得上卻不串流」的錯 MAC）；重連經 `macProvider` 取回真 MAC，
  不再每次即時抓廣播。若記住的 MAC 無法串流，5 秒內自動清除並提示重整。

### 重置為復原 + 支援清單更正

- **重置為復原（六面）**：GanDriver/QiyiDriver/MoyuDriver 新增 `resetToSolved()`（未動凍結
  `SmartCube` 合約，供決策層日後正式納入介面）—— GAN 送原生 `REQUEST_RESET`；MoYu 將重建用的
  `CubieCube` 歸零為復原並投遞復原 facelets；QiYi 無 BLE 重置指令，重送 hello 讓畫面與方塊同步。
  demo 加「🔄 重置為復原」按鈕（連線後啟用）。
- demo 支援面板與 README [已驗證型號] 更正：QiYi 三型號（QY-QYSC / Tornado V4-i / V4 LE）
  皆改為 ✅ 實機驗收通過（先前 LE「不支援」為誤判）。

### Phase 3 — 開源收尾（文件）

- **`README.md`（中英雙語）**：安裝、快速上手（十行內連上方塊）、事件與 API 表、
  瀏覽器支援矩陣、[已驗證型號]（GAN ✅、MoYu WeiLong AI ✅、QiYi QY-QYSC / Tornado V4-i / V4 LE ✅
  —— 見下方「三顆奇藝全通」的後續更正）、GAN 需開 `chrome://flags` 或輸入一次 MAC 的三層 fallback 說明、致謝。
- **`CONTRIBUTING.md`**：如何新增品牌 driver（protocol/純函式 + Driver/BLE I/O 兩層、三條硬規則、
  移植守則）、如何用 demo 的「🔍 診斷方塊 / 🔴 錄製封包」工具擷取封包並交 fixture（含隱私：不含 MAC）。
- **demo**：加「支援品牌與已知限制」面板（品牌狀態表 + 限制說明），footer 補 GitHub 連結與授權。
- **npm publish**：三家已實機驗過，0.1.0 準備發佈（尚未上 npm；見 BACKLOG）。

### MoYu 實機驗收通過 ✅（WeiLong AI / WCU_MY32）

- 實機擷取 MoYu WeiLong AI（WCU_MY32_B6EF）操作 R U F' R' U' 的封包，
  存為 `tests/fixtures/moyu-real.json`（真實韌體行為錨，不含 MAC）。
- `tests/moyu-real.test.ts`（3 例）：
  - 移動封包解出的轉動序列 = 實際操作 R U F' R' U'，moveCnt 逐包遞增；
  - 每個狀態封包 facelet 合法（六色各 9 面）；
  - **交叉驗證**：由 solved 用 `CubieCube` 逐步重建的 facelet，與方塊自報的狀態封包
    (0xA3) 逐步逐字元一致 —— 解密 / 解析 / 轉動代數三層在真韌體上全數正確。
- 電量/資訊封包本次未擷取到（已由合成 fixture 覆蓋）；QiYi 實機驗收待補。

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
