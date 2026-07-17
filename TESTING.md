# TESTING.md — 藍牙 I/O 手動測試 checklist

藍牙硬體無法進 CI（SPEC §7 對策）：協議解析/解密由 fixture 測試鎖住（`npm test`），
**BLE I/O 層改動**（連線流程、寫入模式、通知訂閱、MAC fallback）合併前須跑本清單。

- 測試環境：桌機 Chrome 與 Android Chrome **各跑一輪**（兩者 Web Bluetooth 行為有差異，
  歷史案例：MoYu 寫入模式 writeWithoutResponse 桌機能動、平板沉默）。
- 展示頁：https://5tail.github.io/smart-cubes/ （或 `cd demo && npm run dev`）。
- GAN 自動抓 MAC 需開 `chrome://flags/#enable-experimental-web-platform-features`
  （不開則首次連線手動輸入一次，之後由 demo 記住）。

## 每品牌基本流程（GAN12 UI / MoYu WCU_MY32 / QY-QYSC / XMD-TornadoV4）

- [ ] **連線**：按「🔗 連線方塊」，三家在同一個選擇視窗；選定後 6 秒內連上，
      連線行顯示「已連線：{名稱}（{brand}）· MAC xx（來源）」。
- [ ] **串流**：轉動方塊，事件 log 出現 move（含時間戳），2D/3D 狀態跟著變；
      6 秒無資料看門狗**不應**觸發。
- [ ] **電量**：連上後電量顯示非空。
- [ ] **六面重置**：把畫面弄亂（或實體與畫面不同步）→ 實體復原 → 按「六面重置」→
      畫面變六面，**之後再轉動追蹤仍正常**（GAN 原生重置；MoYu driver 重建歸零；
      QiYi 0x04 覆寫方塊內部狀態）。
- [ ] **陀螺儀**：連上後翻轉整顆方塊，3D 自動進 gyro 模式並跟著轉（GAN/MoYu 原生；
      QiYi 僅 Tornado V4 系列，QY-QYSC 無 gyro 開關應停用且文案說明）；
      「校正正面」按下即回正。
- [ ] **觸控環視**：gyro 模式下拖曳畫面可環視（平板手指、桌機滑鼠皆可）；
      未連線時拖曳環視照常。
- [ ] **斷線/重連**：按「斷線」後方塊能再次被搜到並重連（無死連線）；
      重連使用記住的 MAC（來源顯示「記住值」）且照常串流。

## 品牌特例

- [ ] **GAN 首連**（清 localStorage 後）：開旗標 → 自動抓 MAC；不開旗標 → 跳輸入框，
      輸入一次後重連不再問。
- [ ] **MoYu**：連線**不應**跳 MAC 輸入框（金鑰探測 + 名稱推導自動處理）；
      探測失敗時 6 秒看門狗須自動斷線並在 log 說明（防死連線佔住 GATT）。
- [ ] **QiYi 記住的 MAC 失效**（換過配對等）：連上但不串流 → 5 秒自動清除記憶並提示重整。

## 除錯工具（回報問題時附上）

- [ ] **🔴 錄製封包**：先按🔴再連線，計數器即時顯示 N 包；⬇ 下載 / 📋 複製可匯出
      （含解不開的原始封包 —— 計數 0 = 方塊零通知，非解密問題）。
- [ ] **🔍 診斷方塊**：抓 6 秒廣播（manufacturer data 含真 MAC）+ GATT 服務/特徵值/屬性
      dump，新型號分析用。

## 發佈前（npm publish）

- [ ] `npm run typecheck && npm test && npm run build` 全綠（`prepublishOnly` 會自動擋）。
- [ ] `npm pack --dry-run`：確認內容物 = `dist/` + `NOTICE.md` + README/LICENSE/package.json。
- [ ] 本清單「每品牌基本流程」至少在一台實機全過。
