# SPEC — maru-smartcube 通用智能方塊連線套件 MVP（開源版）

> 撰寫日期：2026-07-11（v2，開源前提）
> 專案負責人：五尾（小丸號）
> 授權：GPL-3.0（決策理由見第 5 節）
> 本文件為完整開發規格，可直接交給 Claude Code 作為實作依據。

---

## 1. 專案目標

做一個**開源 TypeScript 套件**，讓瀏覽器（電腦藍牙，Web Bluetooth API）能連線三家智能方塊：

| 品牌 | 代表型號 | 主要參考來源 |
|------|---------|---------|
| 淦源 GAN | GAN12 UI / i4 / i Carry(Gen2/3/4) | `afedotov/gan-web-bluetooth`（MIT，可直接依賴） |
| 魔域 MoYu | WeiLong AI V10/V11、AoLong AI | csTimer `src/js/bluetooth.js`（GPL-3.0，**可直接移植改寫**） |
| 奇藝 QiYi | QiYi AI 3x3 | csTimer 同上 + `Flying-Toast/qiyi_smartcube_protocol`（協議文件）+ `agolovchuk/qy-cube`（參考實作） |

**MVP 定義**：一個 npm 套件 + 一個 GitHub Pages 展示頁。展示頁上點「連線」，選任一品牌方塊，畫面即時顯示：轉動記錄（含時間戳）、方塊當前狀態（2D 展開圖）、電量。

**非目標（MVP 不做）**：線上週賽整合、對戰、帳號系統、成績儲存、陀螺儀 3D 視覺化、iOS 支援。

**長期目標（影響設計決策，但不在 MVP 實作）**：套件成功後，另建一個**獨立的「藍牙方塊週賽」輕量專案**（僅支援智能方塊，與 comp.maru.tw 完全分離、不混排名 — 智能方塊計時基準與 Stackmat/鍵盤計時不同，不能同場比較）。所以 API 設計必須乾淨、無框架依賴、可 tree-shake。comp.maru.tw 不引用本套件，不受 GPL 影響。

---

## 2. 技術棧

- **語言**：TypeScript（strict mode）
- **打包**：tsup（輸出 ESM + CJS + `.d.ts`）
- **測試**：vitest（純 Node 環境，協議層用封包 fixture 重放測試）
- **展示頁**：Vite + 純 TypeScript（不用 React，降低框架色彩），部署 GitHub Pages
- **相依套件**：
  - `gan-web-bluetooth`（GAN driver 底層，MIT，GPL 相容）
  - AES 一律用 Web Crypto API，避免多帶依賴；Web Crypto 不支援的模式（如 AES-128-ECB）自行實作最小版本或移植 csTimer 的實作
  - 對外 API 只用原生 EventTarget / callback，RxJS 不外露
- **授權**：GPL-3.0
- **Repo 結構**：單一 repo，套件在根目錄，展示頁在 `/demo`

```
maru-smartcube/
├── src/
│   ├── core/
│   │   ├── types.ts          # 統一事件與介面定義
│   │   ├── SmartCube.ts      # 抽象基底
│   │   ├── connect.ts        # 品牌自動偵測 + 統一連線入口
│   │   └── timesync.ts       # 時間戳線性回歸校正
│   ├── drivers/
│   │   ├── gan/
│   │   ├── qiyi/
│   │   └── moyu/
│   ├── utils/
│   │   ├── crypto.ts         # AES 工具
│   │   └── facelets.ts       # 方塊狀態表示與驗證
│   └── index.ts
├── tests/
│   ├── fixtures/             # 真實封包記錄（hex dump）
│   └── *.test.ts
├── demo/
├── LICENSE                   # GPL-3.0 全文
├── NOTICE.md                 # 移植來源與致謝（csTimer / Chen Shuang 等）
├── CLAUDE.md
├── CHANGELOG.md
└── package.json
```

---

## 3. 核心 API 設計（先定案，所有 driver 遵守）

### 3.1 統一連線入口

```typescript
import { connectSmartCube } from 'maru-smartcube';

// 跳出瀏覽器藍牙選擇視窗，依裝置名稱自動判斷品牌並載入對應 driver
const cube = await connectSmartCube({
  // QiYi / GAN 需要 MAC 推導 AES 金鑰時的 fallback
  macProvider: async (device, isFallback) => {
    if (isFallback) return prompt('請輸入方塊 MAC address');
    return null; // null = 讓 driver 自行從廣播資料解析
  }
});

console.log(cube.brand);    // 'gan' | 'moyu' | 'qiyi'
console.log(cube.deviceName);
```

**品牌偵測規則**（藍牙裝置名稱前綴；2026-07-13 依實機確認定案）：
- `GAN`、`MG`、`AiCube` → GAN driver
- `QY-QYSC`、`XMD-TornadoV4` → QiYi driver
- `WCU_MY3` → MoYu driver（WeiLong AI；其他代號待實機確認後擴充）

`navigator.bluetooth.requestDevice` 的 filters 要一次涵蓋三家的名稱前綴與 service UUID，讓使用者在單一選擇視窗看到所有支援的方塊。
（✅ 已於 2026-07-13 實作：`src/core/chooser.ts` + `connect.ts`，實作方式見第 5 節 ADR。）

### 3.2 統一事件

```typescript
type CubeEvent =
  | { type: 'move';     move: string;          // WCA notation: "R", "U'", "F2"…
      cubeTimestamp: number | null;            // 方塊內部時鐘 (ms)，無則 null
      hostTimestamp: number }                  // performance.now()
  | { type: 'facelets'; facelets: string }     // 54 字元，Kociemba 順序 URFDLB
  | { type: 'battery';  level: number }        // 0–100
  | { type: 'gyro';     quaternion: [number, number, number, number] } // 僅 GAN，MVP 只透傳不使用
  | { type: 'connected' }
  | { type: 'disconnected' }
  | { type: 'error';    error: Error };

cube.addEventListener('move', (e) => { ... });
```

### 3.3 統一方法

```typescript
interface SmartCube {
  readonly brand: 'gan' | 'moyu' | 'qiyi';
  readonly deviceName: string;
  requestState(): Promise<void>;   // 主動要求方塊回報 facelets
  requestBattery(): Promise<void>;
  resetToSolved(): Promise<void>;  // 重置邏輯狀態為復原（六面）；2026-07-13 納入，見第 5 節 ADR
  disconnect(): Promise<void>;
}
```

`resetToSolved()` 語意：呼叫方宣告「實體方塊已復原」，driver 把軟體側的邏輯狀態同步為復原，
並投遞一次 `facelets` 事件反映重置後狀態。各品牌實作：GAN 送原生 `REQUEST_RESET`；
MoYu 無原生指令，driver 歸零內部重建狀態；QiYi 無 BLE 重置指令，重送 hello 與方塊自報狀態
重新同步（QiYi 方塊自身會追蹤實體復原）。

### 3.4 時間校正工具（獨立匯出）

```typescript
import { createTimestampFitter } from 'maru-smartcube';

const fitter = createTimestampFitter();
// 每次 move 事件餵入兩邊時間戳
fitter.add(event.cubeTimestamp, event.hostTimestamp);
// solve 結束後取得校正後的真實耗時
const elapsedMs = fitter.fit(startCubeTs, endCubeTs);
```

演算法：對 (cubeTimestamp, hostTimestamp) 序列做最小平方法線性回歸，消除方塊時鐘漂移。此為陳霜在 csTimer 首創的方法，可直接參考/移植 csTimer 與 gan-web-bluetooth 的 `cubeTimestampLinearFit()` 實作。**這個工具是未來週賽防作弊的核心，測試要寫足。**

---

## 4. csTimer 程式碼移植守則

開源（GPL-3.0）後可以直接移植 csTimer 程式碼，但要守規矩：

1. **保留版權聲明**：移植的每個檔案，開頭註明 `Adapted from csTimer (https://github.com/cs0x7f/cstimer), Copyright Chen Shuang, GPL-3.0`
2. **NOTICE.md 集中列出**所有移植來源、原作者、原始檔案路徑
3. **移植 ≠ 照抄**：csTimer 是十幾年的單體 JS，移植時要做的是「翻譯」— 抽出協議邏輯（封包格式、解密流程、狀態解析），改寫成 TypeScript + 本套件的 driver 介面。UI 相關、csTimer 內部狀態管理的程式碼一律不搬
4. GAN driver 優先用 `gan-web-bluetooth`（MIT 依賴），不從 csTimer 移植 — 減少維護面

---

## 5. 授權決策記錄（ADR）

- **選 GPL-3.0 的理由**：csTimer 是三家協議最完整、經過最多實戰驗證的實作。MIT 路線必須逐位元組 clean-room 重寫 MoYu/QiYi 協議（成本高、易出 bug）；GPL 路線可直接移植，MVP 時程約砍半，且與開源社群共生（未來社群幫忙加品牌、修韌體相容性的機會大得多）
- **代價**：所有引用本套件的下游專案發佈時必須 GPL 相容。已確認下游只有未來的「藍牙方塊週賽」輕量專案（天生規劃為開源），comp.maru.tw 不引用本套件，故 GPL 傳染實質無痛。若未來出現無法開源的下游需求，替代方案是另做 MIT clean-room 版本（本 SPEC 的 v1 路線），成本另計
- **對小丸號的品牌價值**：開源一個全品牌智能方塊套件，在方塊社群是強力的技術名片，與「小丸號 = 台灣方塊專業品牌」定位一致

### ADR 2026-07-13 — `resetToSolved()` 納入凍結介面（第 3.3 節）

- **決定**：`resetToSolved(): Promise<void>` 正式進 `SmartCube` 合約。
- **理由**：三家 driver 已各自長出具體實作且實機驗過（GAN 原生 `REQUEST_RESET`、MoYu 歸零重建、
  QiYi 重送 hello），demo 只能用型別守衛偷呼叫 —— 這正是「介面缺口」的訊號。未來週賽下游也
  必需此能力（打亂前把軟體狀態對齊實體復原）。統一語意為「呼叫方宣告實體已復原」，
  避免各 app 自行摸 driver 私有方法。
- **代價**：合約變大一格；新增品牌 driver 必須實作（無原生指令時可比照 MoYu/QiYi 的軟體側語意）。

### ADR 2026-07-13 — 3D 視覺化提前實作，仍放 demo、不進套件

- **決定**：把「呈現真實立體方塊」從 Phase 4 提前到現在做；視覺化元件放 `demo/`，核心套件不含
  任何 UI/渲染程式碼。SPEC 第 1 節「套件乾淨、可 tree-shake、零框架」不變。
- **理由**：3D 需要的資料（`facelets` 每步整顆狀態）Phase 2 已就緒且實機驗過，提前成本低、
  展示價值高（開源名片）。放 demo 是延續「2D 展開圖元件寫在 demo」的既有決策 —— 套件的職責是
  協議與事件，不是渲染。
- **範圍註記**：GAN `gyro` 陀螺儀姿態（quaternion）本輪**不用**，維持 SPEC 3.2「只透傳不使用」——
  只有 GAN 有此事件、且需校正/漂移處理，跨品牌不一致的姿態功能留在 Phase 4。

### ADR 2026-07-13 — 3D 技術選型：純 CSS 3D transforms（零依賴）

- **決定**：demo 3D 用純 CSS 3D transforms（26 個 cubie div + `preserve-3d` + `rotate3d` 動畫），
  不引入 Three.js 等 3D 函式庫。
- **理由**：需求只是「一顆 3×3 方塊、貼紙上色、轉層動畫、拖曳環視」，遠低於 WebGL 門檻；
  CSS 3D 零依賴、零打包成本，與 SPEC「零框架 demo」一致；Three.js（MIT，GPL 相容）帶來
  ~600KB 依賴與 WebGL context 管理，換到的光影效果對本用途非必要。
- **代價**：無真實光影/透視質感；若未來要做陀螺儀姿態 + 慣性動畫等進階效果，屆時再評估升級
  Three.js（本 ADR 不擋）。

### ADR 2026-07-13 — 3D 狀態模型：facelets 事件為權威、move 只驅動動畫；MoYu 以 driver 重建為權威

- **決定**：
  1. 視覺元件（2D/3D）的顯示狀態以最後一個 `facelets` 事件為權威。`move` 事件只用來驅動
     轉層動畫與本地預測（CubieCube 代數）；當權威 facelets 與本地預測不符時，以權威覆蓋（snap）。
  2. **MoYu**：建立基準（第一個狀態封包）後，driver 的 `facelets` 事件一律投遞「driver 以轉動
     代數重建」的狀態；方塊自報狀態只作初始基準。理由：MoYu 方塊自身的追蹤器不知道
     `resetToSolved()`，重置後自報狀態永遠與真實狀態差一個固定偏移，會與重建狀態打架；
     正常操作下兩者逐步一致（`moyu-real.json` 實機交叉驗證 5/5）。
  3. demo 只對 **GAN** 在每步 move 後 `requestState()`（GAN 不主動逐步回報 facelets）；
     MoYu/QiYi driver 每步已自帶 facelets 事件，逐步再要一次既浪費 BLE 往返、又在 MoYu
     重置後引入自報/重建之爭。
- **代價**：MoYu 若 BLE 掉包超過移動封包內建歷史長度，重建可能漂移且不再能靠自報狀態自動復原
  （記 BACKLOG：必要時提供顯式 `recoverState()`；實務上移動封包帶多步歷史，短暫掉包可自癒）。

### ADR 2026-07-13 — 統一選擇視窗（SPEC 3.1）實作方式

- **決定**：`connectSmartCube()` 依 3.1 合約改為三家並陳的單一選擇視窗：自建 `requestDevice`
  （filters = 三家名稱前綴聯集；optionalServices = GAN Gen2/3/4 + QiYi + MoYu；
  optionalManufacturerData = 三家 CIC 聯集），依裝置名稱前綴分派品牌。
- **GAN 分派技法**：gan-web-bluetooth 的 `connectGanCube()` 內部自帶 `requestDevice`、
  吃不下外部已選裝置。不 fork 上游、不重寫 GAN 協議，改在呼叫期間**暫時覆寫**
  `navigator.bluetooth.requestDevice` 回傳已選裝置、`finally` 還原（`withRequestDeviceOverride`，
  有覆寫/還原/拋錯還原的單元測試）。若上游未來開放傳入 device，屆時移除此 shim。
- **QiYi / MoYu**：抽出 `connectQiyiDevice` / `connectMoyuDevice`（接受已選裝置），
  原 `connect*Cube()` 專用入口保留 —— 單品牌下游可 tree-shake，不被統一入口拖進三家程式碼。
- **GAN MAC 限制不變**：Web Bluetooth 刻意不給網頁 MAC；GAN 裝置名稱不含 MAC（QiYi/MoYu 有，
  故可名稱推導）。GAN 首連仍需「開實驗旗標自動抓」或「手動輸入一次 + app 記住」；
  真零設定需桌面 App（Phase 4 週賽專案再議）。

### ADR 2026-07-13 — 陀螺儀 3D 姿態提前實作（demo，純 CSS，僅 GAN）

- **決定**：把「gyro quaternion 驅動 3D 方塊跟實體翻轉」從 Phase 4 提前到現在做；沿用前述
  3D 元件的技術路線（純 CSS 3D transforms、放 demo、不進套件）。套件層對 `gyro` 事件仍
  **只透傳不解讀**（SPEC 3.2 不變），姿態的座標對齊與渲染全在 demo 消費。
- **座標對齊**：GAN quaternion 為右手系 +X=Red(R)、+Y=Blue(B)、+Z=White(U)
  （gan-web-bluetooth 文件），本專案 3D 方塊座標為 +X=R、+Y=U、+Z=F，兩者差一個固定基變換
  C（繞 X 軸 −90°：GAN +Y→ours −Z、+Z→ours +Y）。姿態四元數在基變換下向量部跟著變換、
  純量不變；再套既有 y-down 鏡射後輸出 CSS `matrix3d`。全鏈為純函式，有 9 例單元測
  （四元數代數、基變換各軸映射、繞 U 軸 90°、identity、校正回正不變式）。
- **UI 互動**：3D 元件同時支援「手動拖曳環視（orbit）」與「陀螺儀姿態（gyro）」，二者互斥。
  gyro 開關只在連 GAN 時啟用；開啟即把當前姿態設為「正面」基準（顯示相對基準的旋轉，故一開
  就回正），拖曳停用，並提供「校正正面」按鈕隨時重設基準。QiYi/MoYu 無 gyro 事件故停用開關。
- **範圍註記**：`gyro` 事件高頻，demo 只驅動姿態、不進事件 log。陀螺儀漂移校正（長時間累積
  誤差）與慣性平滑留待 Phase 4 週賽專案；本輪只做「即時 1:1 姿態鏡射 + 手動歸正」。

---

## 6. 分階段實作計畫

每個 Phase = 一個獨立的 Claude Code 任務（開新對話），完成後 commit + 更新 CHANGELOG。

### Phase 0 — 骨架（半天）

- 建 repo `maru-smartcube`（public），LICENSE = GPL-3.0，tsup + vitest + TypeScript strict 設定
- 寫 `src/core/types.ts` 完整型別（照本 SPEC 第 3 節）
- 寫 `CLAUDE.md`：專案簡介、指令（build/test）、架構規則（driver 不得互相引用、RxJS 不得外露、csTimer 移植守則見 SPEC 第 4 節）
- 建 `NOTICE.md` 骨架
- demo 頁骨架：連線按鈕 + 事件 log 區塊（先接假資料）
- GitHub Pages workflow（demo 自動部署）

**驗收**：`npm run build` 產出 ESM/CJS/d.ts；demo 頁上線。

### Phase 1 — GAN driver（1 天）

最快能跑通的一條路，用它來驗證統一介面設計是否合理。

- 包裝 `gan-web-bluetooth`：把它的 RxJS Observable 事件轉成本套件的 CubeEvent
- MAC 處理：gan-web-bluetooth 內建從 manufacturer data 解析，失敗時走 `macProvider` fallback
- demo 頁接真方塊：轉動記錄、2D 展開圖（54 貼紙上色）、電量顯示
- 2D 展開圖元件寫在 demo，不進套件

**驗收（實機）**：GAN 方塊連線後，demo 頁即時顯示每一步轉動與正確的方塊狀態；打亂後照記錄逆推可還原。

### Phase 2 — QiYi + MoYu driver（1.5–2 天，可拆兩個對話）

開源後兩家都以 csTimer 為主要移植來源，工序相同，合併規劃：

- 先通讀 csTimer `bluetooth.js` 中 QiYi 與 MoYu 段落，整理出各自的：service/characteristic UUID、金鑰推導、封包格式、ACK 機制（QiYi 漏回 ACK 會斷線，ACK 邏輯進 driver 內部自動處理）
- 逐段翻譯成 TypeScript driver，遵守第 4 節移植守則
- 交叉比對 `qiyi_smartcube_protocol` 文件與 `qy-cube` 實作，確認 csTimer 的理解無誤
- 實機連線時把原始封包 hex dump 存進 `tests/fixtures/{qiyi,moyu}/`，解密與解析邏輯全部用 fixture 寫 vitest 測試
- 魔域各代協議有差異（WeiLong AI 舊版 vs V10/V11），以五尾手上實機型號為準，其他列 backlog

**驗收（實機）**：兩家方塊各自連線穩定 5 分鐘以上，事件行為與 GAN driver 一致；解析層測試覆蓋。

### Phase 3 — 開源收尾與發佈（半天–1 天）

- `README.md`（中英雙語）：安裝、快速上手、API 文件、瀏覽器支援矩陣、各品牌已驗證型號清單、致謝
- `CONTRIBUTING.md`：如何新增品牌 driver、如何提交封包 fixture（社群擴充的入口）
- npm publish `0.1.0`（GPL-3.0），CHANGELOG 補齊
- demo 頁加品牌支援清單與已知限制說明
- 在方塊社群（小丸號粉專 / 相關論壇）發佈，收集回饋

**驗收**：在一個全新的空專案 `npm install` 後，照 README 十行程式碼內連上方塊。

### Phase 4（未來，不在本次範圍）

- 建立獨立的「藍牙方塊週賽」輕量專案（開源，僅支援智能方塊，與 comp.maru.tw 分離不混排名）。智能方塊的逐步記錄讓防作弊成本趨近於零：打亂步驟自動驗證、成績自動判定、還原過程重播
- 陀螺儀 3D 姿態的**進階部分**：長時間漂移校正、慣性平滑動畫（本輪已做即時 1:1 姿態鏡射 +
  手動歸正，見第 5 節 ADR 2026-07-13）
- 更多品牌（雨花石等，歡迎社群 PR）、iOS（Bluefy）測試
- 註：facelets 驅動的 3D 立體方塊（貼紙上色 + 轉層動畫 + 拖曳環視）與 gyro 即時姿態均已於
  2026-07-13 提前在 demo 實作完成（見第 5 節 ADR）

---

## 7. 已知風險與對策

| 風險 | 對策 |
|------|------|
| Web Bluetooth 不提供 MAC，GAN/QiYi 金鑰推導失敗 | 三層 fallback：廣播資料解析 → localStorage 記住上次輸入 → `macProvider` 手動輸入 |
| 硬體無法進 CI | 解密/解析層全部用真實封包 fixture 測試；藍牙 I/O 層維護手動測試 checklist（`TESTING.md`） |
| GPL 傳染影響未來閉源整合 | 已知且接受（第 5 節 ADR）；真有需要時另做 MIT clean-room 版 |
| csTimer 程式碼年代久、無型別 | 移植時逐段寫 fixture 測試鎖行為，翻譯不照抄 |
| 魔域/奇藝韌體版本差異 | 每個 driver 記錄「已驗證型號 + 韌體版本」於 README；未知版本 emit error 而非 silent fail |
| iOS Safari 不支援 Web Bluetooth | MVP 明示僅支援桌機 Chrome/Edge 與 Android Chrome，demo 頁偵測到不支援時顯示引導文字 |

---

## 8. 實機測試需求（五尾準備）

每家至少一顆，測試時記錄型號與韌體版本：

- [ ] GAN 智能方塊（任一代，Gen3/Gen4 佳）
- [ ] QiYi AI 3x3
- [ ] 魔域 WeiLong AI（註明手上是哪一版）

---

## 9. 給 Claude Code 的工作守則

1. 每個 Phase 開新對話，開場先讀 `CLAUDE.md` 與本 SPEC 對應章節
2. 統一介面（第 3 節）是合約：driver 實作若發現介面設計有問題，先停下來回報，不要私自改介面
3. 移植 csTimer 程式碼必須遵守第 4 節守則（版權標頭 + NOTICE.md）
4. 所有解析/解密邏輯必須有 fixture 測試才算完成
5. 完成後：commit（訊息含 Phase 編號）→ 更新 CHANGELOG → 回報驗收項目狀態與建議的下一步

---

## 10. 模型分工與長期治理（決策/執行分離）

> 背景：本 SPEC 的所有架構決策由 Claude Fable 5 前置完成。Fable 5 退役後，開發改採「決策用聰明模型、執行用高 CP 值模型」的雙層分工。本節是這套分工的操作規則。

### 10.1 核心原則

**判斷力前置，執行去判斷化。** 貴的模型只在「需要做決定」的時刻出場，便宜的模型負責大量、明確、可驗收的工作。走偏的根源是讓執行模型自行判斷 — 所以規則是：執行階段遇到任何需要判斷的事，一律停下升級，不自行決定。

| 層級 | 用途 | 模型建議 | 出場頻率 |
|------|------|---------|---------|
| 決策層 | 架構、介面變更、code review、卡關診斷 | 當下最強模型（Opus 系列） | 每 Phase 頭尾各一次 |
| 執行層 | 照工單實作、寫測試、移植翻譯、文件 | Sonnet 系列（大量）/ Haiku（瑣事） | 日常 |

### 10.2 決策層任務清單（只有這些事值得用貴模型）

1. 修改第 3 節統一介面（合約變更）— 唯一有權限改 `src/core/types.ts` 的層級
2. 新增或修改第 5 節 ADR（授權、架構等重大取捨）
3. 每個 Phase 開工前：把 SPEC 章節展開成「執行工單」（見 10.5）
4. 每個 Phase 完成後：對照 SPEC 驗收項目做 code review，確認沒有偏移
5. 卡關升級：執行層連續兩次無法通過驗收，或回報介面問題時
6. 未來新品牌 driver 的協議分析與設計

### 10.3 執行層護欄（寫進 CLAUDE.md，每對話生效）

1. **禁改合約**：`src/core/types.ts` 與所有公開 API 唯讀。發現介面設計有問題 → 停下、寫清楚問題、結束對話，交決策層處理
2. **開場必讀**：CLAUDE.md + 本 SPEC 的當前 Phase 章節（不用讀整份）
3. **測試即驗收**：fixture 測試不過不准 commit；不准為了讓測試通過而修改測試
4. **禁止順手重構**：工單範圍外的程式碼一行都不動，看不順眼記進 `BACKLOG.md` 就好
5. **不確定就停**：任何「兩種做法都好像可以」的時刻 = 需要判斷 = 升級決策層

### 10.4 防走偏三道錨

長期多對話開發最怕邏輯漂移，用三道錨鎖住最初設計：

1. **SPEC = 憲法**：統一介面（第 3 節）+ ADR（第 5 節）只有決策層能改，每次修改必須在 ADR 留下記錄與理由
2. **fixture 測試 = 行為錨**：真實封包 hex dump + 期望輸出鎖住協議邏輯的正確行為。任何模型（不管多笨）改壞了邏輯，測試會直接擋下 — 這是最可靠的防線，因為它不依賴模型的自覺
3. **CHANGELOG + Phase 編號 commit = 進度錨**：任何新對話冷啟動時，讀 CHANGELOG 最後三條 + `git log --oneline -10` 就能還原「做到哪、下一步是什麼」，不需要翻舊對話

### 10.5 Token 節省戰術

1. **一對話一工單**：做完 commit 就收，不在同一對話裡連做多件事（context 越長，token 越貴、模型越容易漂）
2. **執行工單格式**（決策層產出，執行層照做）：
   ```
   目標：一句話
   檔案範圍：只准動這些檔案
   步驟：3–7 條
   驗收：可機械檢查的條件（測試綠燈、build 通過…）
   禁區：明確列出不准動的東西
   ```
   執行層拿到工單就不需要重讀全 SPEC，這是最大的 token 節省來源
3. **測試先行**：決策層先定測試案例（或由實機 fixture 直接生成），執行層的任務簡化成「實作到綠燈」— 目標明確的任務便宜模型也做得好
4. **章節引用**：需要 SPEC 上下文時指定「讀第 X 節」，永遠不整份塞進 context

### 10.6 決策凍結清單（Fable 5 已定案，執行階段不得重議）

以下決策已完成充分評估，後續任何模型不得以「我覺得有更好的做法」為由推翻。真要改，必須走決策層 + 更新 ADR：

- ✅ 統一介面設計（第 3 節）：事件格式、方法簽名、macProvider 機制
- ✅ GPL-3.0 授權 + csTimer 移植路線（第 4、5 節）
- ✅ 技術棧與 repo 結構（第 2 節）：TypeScript strict、tsup、vitest、零框架 demo
- ✅ Phase 順序與驗收標準（第 6 節）：GAN 先行驗證介面 → QiYi/MoYu 移植 → 開源發佈
- ✅ 定位（第 1 節）：獨立套件，comp.maru.tw 不引用；未來下游是獨立的藍牙方塊週賽
- ✅ 計時策略：cubeTimestamp + hostTimestamp 雙記錄 + 線性回歸校正（第 3.4 節）
