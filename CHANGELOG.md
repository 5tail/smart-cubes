# Changelog

本檔案記錄各 Phase 的進度（SPEC §10.4 進度錨）。格式參考
[Keep a Changelog](https://keepachangelog.com/)，版號遵循 [SemVer](https://semver.org/)。

## [Unreleased]

### DEPLOY.md 新增 — 展示頁自架部署指南（決策層 2026-07-18）

使用者要把展示頁架到自己的網站（`https://maru.tw/app/smartcubes`，手動 build + 上傳）。
新增 `DEPLOY.md`：以該路徑為實例的完整步驟（`--base` CLI 覆寫、傳 dist「內容」、nginx 範例、
驗證清單）、需手工修改的文字清單（必改僅 `--base` 一項）、注意重點（HTTPS 硬需求、
index.html no-cache、MAC 記憶跟網域走、iOS 平台限制）與日後更新流程。
README 中英兩處 demo 章節補上連結。文件所載 build 指令已實際執行驗證
（產出資源前綴 `/app/smartcubes/` 正確）。`demo/vite.config.ts` 零改動
（GitHub Pages 的 base 保留，自架一律用 CLI 覆寫）。

### QiYi 新裝置 0 封包修復 — MAC fallback 改為 hello 驗證鏈（決策層 2026-07-17）

實機回報：另一台**從未連線過**的 Android 平板上，GAN/MoYu 正常，奇藝（魔方格）系
「只能連線、0 封包」。根因是 MAC fallback 的設計缺陷，非新協議問題：

- **機制**：QiYi 的 hello 必須帶對 MAC，錯了方塊完全沉默。新平板沒有 localStorage 記憶、
  旗標未開也沒有廣播 MAC，於是退到**名稱推導**（`CC:A3:00:00:XX:XX`）——而 2026-07-13
  即有鐵證：實測三顆奇藝的名稱推導 MAC 全是錯的（csTimer 原作只拿它當 prompt 預設值，
  移植時被升格成靜默權威來源）。名稱「猜得出值」就算成功 → 手動輸入 fallback 永遠
  不可達 → 錯 MAC 靜默送出 → 0 封包 → 看門狗斷線 → 重整後無限循環。
- **修法**：`connectQiyiDevice` 改為 **hello 驗證鏈** —— 記住值 → 廣播 → 名稱推導依序當
  候選，每個候選送 hello 後等 1.5 秒，方塊有回話（facelets/battery/move）才定案；
  全部沉默才跳手動輸入對話框（內建 ⚡ 旗標引導可自助）。名稱推導猜對的方塊行為不變
  （靜默連上）；猜錯的不再死路，且記住值失效時也能自癒前進。gyro 事件不算驗證通過
  （Tornado 姿態串流與 hello 的關係未證實，保守排除）。
- 廣播 MAC 等待 3s → **5s**（QiYi「含 MAC 的掃描回應較晚到」前科，診斷工具收 6 秒同理）。
- `QiyiDriver.mac` 改為 getter（對外仍唯讀；驗證鏈需在連線中切換候選），公開 API 形狀不變；
  凍結合約 `types.ts` 零改動。demo 的 MAC 對話框文案品牌中性化（QiYi 現在也會走到）。
- fixture 測試 +6（`tests/qiyi-mac-fallback.test.ts`）：mock 方塊「只認真 MAC 的 hello 才回話」，
  覆蓋名稱推導命中/落空、記住值命中/失效自癒、手動取消、無候選丟錯；138 例綠燈。

### GAN 免輸入 MAC 引導 — 對話框內建 Chrome 旗標設定教學（決策層 2026-07-17）

一般使用者不知道「開實驗旗標就能自動抓 MAC」，MAC 對話框只有手動輸入一條路。
現在對話框內建「⚡ 免輸入模式」引導：

- 四步驟教學 + **一鍵複製旗標網址**（`chrome://` 網址無法從網頁點擊開啟 —— Chrome 安全
  限制，故提供複製貼上流程；剪貼簿被拒時退回反白全選）。
- **旗標狀態偵測**（`watchAdvertisements` 存在與否）決定文案與展開：未開 → 自動展開教學；
  已開仍跳窗 = 廣播逾時 → 收合教學、提示喚醒方塊/拉近重試。
- 電腦與 Android 平板 Chrome 皆適用；headless Chromium 實渲染驗證對話框版面（480px）。

### 0.1.0 發佈準備（決策層 2026-07-17）

MVP 功能全數實機驗收通過（三品牌連線/串流/電量/重置/陀螺儀 + 觸控環視），
npm 發佈前置條件（QY-QYSC 實機驗證）已滿足，執行 Phase 3 發佈收尾：

- `package.json`：版本 0.0.0 → **0.1.0**；`files` 加入 `NOTICE.md`（GPL 移植清單必須隨
  套件散佈）；新增 `prepublishOnly`（typecheck + test + build，發佈前自動把關）。
  套件名 `maru-smartcube` 已確認 npm 可用（registry 404）。
- `NOTICE.md`：移除過時的「Phase 0 尚未移植」段落；補齊陀螺儀與 QiYi 0x04 的參考來源
  （lukeburong/weilong-v10-ai-protocol、BTime、DCTimer-BLE、CubeZX3）。
- `TESTING.md` 新增（SPEC §7 對策）：藍牙 I/O 手動測試 checklist —— 每品牌基本流程
  （連線/串流/電量/重置/陀螺儀/觸控環視/重連）、品牌特例、除錯工具、發佈前檢查。
- BACKLOG 收檔三個決策項：MAC 記憶維持 demo 層（macProvider 設計本意）、
  `SmartCube.ts` 抽象基底不做（YAGNI）、MoYu 廣播 MAC 之謎降級為留檔。
- 實際 `npm publish` 由套件擁有者執行（需 npm 帳號），步驟見 PR 的發佈 checklist。

## [0.1.0] - 2026-07-17

### QiYi 六面重置修復 — resetToSolved 改送 0x04 狀態覆寫指令（決策層 2026-07-17）

實機回報：奇藝系（QY-QYSC / Tornado V4）按「六面重置」無效，GAN/MoYu 都正常。
根因是語意缺口而非 bug：QiYi 每包以**方塊自報狀態**為權威，而舊 `resetToSolved` 只是
「重送 hello 重新同步」（Phase 2 認知「QiYi 無 BLE 重置指令」）——方塊內部追蹤器已亂時，
重同步只會把亂的狀態再抓回來，畫面永遠不會變六面。

- **QiYi 其實有狀態覆寫指令（opcode 0x04）**：csTimer 未實作，但 Flying-Toast
  qiyi_smartcube_protocol 文件記載，並經三個獨立來源交叉驗證 —— huizhiLLL/DCTimer-BLE
  （`SYNC_STATE_PREFIX` + 2-byte 尾墊）、maggnus/CubeZX3（官方 app 實機抓包「FE 26 04 …」
  重置封包 + 復原態 27-byte hex）、KittatamSaisaard/qiyi_smartcube_protocol_web。
- 實作：`protocol.ts` 新增 `encodeFacelet`（`parseFacelet` 的逆）與 `buildSyncState`
  （內容 = `[0x04, 固定前綴 4B, facelet 27B, 0x00, 0x00]`，framing 後 len=0x26 與抓包一致）；
  `parseCubeData` 新增 0x04 確認包分支（投遞覆寫後 facelets、**不回 ACK**、lastTs 重設為
  本包 ts 避免誤補投歷史 move）；`resetToSolved()` 改送 `buildSyncState(SOLVED_FACELET)`。
- 合約語意升級（僅註解，API 零改動）：types.ts 品牌語意註記由「QiYi 重送 hello 重新同步」
  改為「0x04 狀態覆寫」——與 GAN 原生 REQUEST_RESET 同級，三品牌重置語意對齊。
- fixture 測試 +6（`tests/qiyi-sync.test.ts`）：復原態編碼 = CubeZX3 實機抓包 27-byte hex
  （外部行為錨）、encode/parse 互逆（含實機打亂態）、封包 framing/CRC 自洽、0x04 確認包
  解析（no-ACK + lastTs 重設）、driver 送覆寫指令與確認包畫面更新；132 例綠燈。

### 3D 方塊觸控環視 — gyro 模式下拖曳不再停用（決策層 2026-07-17）

前情：**MoYu 陀螺儀實機驗收通過**（使用者 Android 平板回報 3D 跟著魔域方塊轉向）。
接續補「畫面上方塊觸控轉向」：平板上拖不動 3D 方塊的根因不是觸控事件
（pointer events + `touch-action: none` 早已就緒），而是**連上方塊會自動進 gyro 模式，
而 gyro 模式下拖曳被整個停用**（`if (gyroMode) return`）——平板上等於永遠摸不動。

- **orbit 與 gyro 由二選一改為可疊加**：gyro 開啟時拖曳/觸控的環視角疊在陀螺儀姿態
  **外層**（螢幕軸，CSS 左式先套）——實體方塊控制姿態、手指環視鏡頭，兩者獨立不打架，
  可拖去看方塊背面。gyro 關閉時行為與舊版全等（純 orbit）。
- 兩組環視角獨立（orbit 的 pitch/yaw 與 gyro 模式的 gyroPitch/gyroYaw），切換模式互不污染；
  進 gyro 模式與按「校正正面」時 gyro 環視角歸零（「回正」= 姿態基準 + 環視角一起歸正，
  校正回正不變式保留）。
- 組合邏輯抽為 `cube3dMap.ts` 純函式 `viewTransform`（環視角為零時輸出與
  `ganQuatToCssTransform` 全等）；`cube3d.ts` 只接線。
- 測試 +3（`tests/view-transform.test.ts`）：gyro 關閉舊行為全等、環視角零時回正不變式、
  環視角疊加輸出；126 例綠燈。

### MoYu 陀螺儀連動 — 投遞 gyro 事件 + 連線時自動開啟（決策層 2026-07-17）

前情：使用者實機回報（2026-07-17）**魔域已能連線且抓得到封包**——先前「平板 0 封包」問題
在 writeWithoutResponse + INFO→STATE 握手順序修正（commit 67db315）部署後解除。
本輪補上魔域陀螺儀，讓 3D 方塊跟著實體翻轉（GAN、QiYi Tornado V4 已具備）。

- **封包格式免逆向**：csTimer 只有註解掉的 `msgType == 171 // gyro`，但社群已有文件與實作，
  三個獨立來源交叉一致 —— lukeburong/weilong-v10-ai-protocol（bit 級文件）、BTimeApp/BTime
  （TS 實作）、huizhiLLL/DCTimer-BLE（`GYRO_SCALE = 2^30`）：
  `[0xAB][w,x,y,z 各 int32 little-endian ÷ 2^30]`（走既有 AES 解密路徑，注意 LE 與其他欄位
  的 MSB-first 不同）。
- **關鍵機關：0xAC 開啟指令**。方塊預設不串流 gyro，須寫入 `[0xAC, 0x00, 0x01, …]` 開啟
  —— 這解釋了 csTimer 為何收得到 msgType 171 卻無實作（官方 app 開過、狀態殘留才收得到）。
  `connectMoyuDevice` 在 INFO/STATE/BATTERY 請求之後自動送出；個別韌體不認得此指令也不影響
  基本功能（state/battery 已請求完畢）。
- **座標系零改動**：MoYu 座標系（x=右、y=後、z=上）與 GAN 相同（BTime 逆向記載），
  `parseGyroQuaternion` 依 GAN 同序回傳 `[x,y,z,w]` 原樣透傳，demo 既有 GAN 基變換直接適用。
  軸向/手性以文件為據、待實機驗證（見 BACKLOG）。
- 探測合法型別加入 171（gyro 已開啟的方塊在探測期串流姿態封包也算金鑰正確）。
- demo：陀螺儀開關對 MoYu 一併啟用；提示文案更新（原「QiYi/MoYu 待逆向」已過時）。
- fixture 測試 5 例（`tests/moyu-gyro.test.ts`）：固定金鑰加密的完整 20-byte gyro 封包走
  真實解密路徑 → 四元數（含負分量/LE 符號位/正規化）、0xAC 指令位元組、driver 投遞 gyro
  事件、connect init 尾端送開啟指令；123 例綠燈。

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
