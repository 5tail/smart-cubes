# NOTICE

maru-smartcube
Copyright (C) 2026 五尾（小丸號）

本專案以 **GPL-3.0** 授權，完整條款見 `LICENSE`。

本檔案集中列出所有移植來源、原作者與原始檔案路徑（SPEC 第 4 節移植守則）。
移植的每個原始碼檔案，其開頭也會個別註明來源版權標頭。

---

## 移植來源（Ported / Adapted Sources）

> Phase 0 尚未移植任何協議程式碼；下列為已規劃、後續 Phase 將移植/依賴的來源。
> 每完成一段移植，於此表補上原始檔案路徑與對應的本專案檔案。

### csTimer — MoYu / QiYi 協議

- **原作者**：Chen Shuang（陳霜）
- **原始專案**：https://github.com/cs0x7f/cstimer
- **授權**：GPL-3.0
- **移植範圍**：`src/js/hardware/{qiyicube,moyu32cube}.js` 的協議段落（service/characteristic
  UUID、金鑰/IV 推導、封包格式、CRC、ACK 機制、facelet/move 狀態解析）、
  `src/js/lib/mathlib.js` 的 `CubieCube`（方塊狀態表示與轉動代數）、
  `src/js/lib/sha256.js` 的 `AES128`，以及時間戳線性回歸 `cubeTimestampLinearFit()`。
- **標頭格式**：移植檔案開頭註明
  `Adapted from csTimer (https://github.com/cs0x7f/cstimer), Copyright Chen Shuang, GPL-3.0`
- **對應本專案檔案**：
  - `src/core/timesync.ts` —— 時間戳線性回歸校正（源 `mathlib.js`）
  - `src/utils/crypto.ts` —— 最小 AES-128（源 `sha256.js` 的 `AES128`）
  - `src/utils/facelets.ts` —— `CubieCube` 狀態/轉動代數（源 `mathlib.js`）
  - `src/drivers/qiyi/protocol.ts` —— QiYi AI 3x3 協議（源 `qiyicube.js`）
  - `src/drivers/moyu/protocol.ts` —— MoYu WeiLong AI 協議（源 `moyu32cube.js`）
- **fixture 測試向量**：`tests/fixtures/*.json` 由 csTimer 上述模組在 Node 直接產生，
  作為解密/解析邏輯的行為錨（SPEC §10.4）。

### gan-web-bluetooth — GAN driver 底層依賴

- **原作者**：Andy Fedotov（afedotov）
- **原始專案**：https://github.com/afedotov/gan-web-bluetooth
- **授權**：MIT（GPL 相容）
- **使用方式**：作為 npm 依賴，包裝其 RxJS Observable 事件轉為本套件的 `CubeEvent`
  （非移植，直接依賴）。
- **對應本專案檔案**：`src/drivers/gan/`（Phase 1 補上）

### 參考文件（未移植程式碼，僅比對協議理解）

- **qiyi_smartcube_protocol** — Flying-Toast，QiYi 協議文件
  https://github.com/Flying-Toast/qiyi_smartcube_protocol
- **qy-cube** — agolovchuk，QiYi 參考實作
  https://github.com/agolovchuk/qy-cube

---

## 致謝

- Chen Shuang（陳霜）／csTimer — 三家智能方塊協議最完整、經最多實戰驗證的實作，
  時間戳線性回歸校正方法亦為其首創。
- Andy Fedotov ／gan-web-bluetooth — 乾淨的 GAN driver 實作。
- Flying-Toast、agolovchuk — QiYi 協議文件與參考實作。
