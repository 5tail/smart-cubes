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
- **移植範圍**：`src/js/bluetooth.js` 中 MoYu 與 QiYi 段落（service/characteristic UUID、
  金鑰推導、封包格式、ACK 機制、狀態解析），以及時間戳線性回歸 `cubeTimestampLinearFit()`。
- **標頭格式**：移植檔案開頭註明
  `Adapted from csTimer (https://github.com/cs0x7f/cstimer), Copyright Chen Shuang, GPL-3.0`
- **對應本專案檔案**：`src/drivers/moyu/`、`src/drivers/qiyi/`、`src/core/timesync.ts`（Phase 1–2 補上）

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
