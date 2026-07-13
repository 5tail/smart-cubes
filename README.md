# maru-smartcube

> 讓瀏覽器（Web Bluetooth）用一套統一介面連線 **GAN / MoYu / QiYi** 三家智能方塊，
> 即時輸出轉動記錄（含時間戳）、方塊狀態與電量。
>
> A TypeScript package that connects **GAN / MoYu / QiYi** smart cubes over Web
> Bluetooth and emits one unified event stream (moves with timestamps, cube state, battery).

[![CI](https://github.com/5tail/smart-cubes/actions/workflows/ci.yml/badge.svg)](https://github.com/5tail/smart-cubes/actions/workflows/ci.yml)
授權 License: **GPL-3.0** ｜ 展示頁 Live demo: **https://5tail.github.io/smart-cubes/**

**語言 / Language**：[繁體中文](#繁體中文) ｜ [English](#english)

> ⚠️ **狀態（v0.1.0 前）**：GAN、MoYu WeiLong AI、QiYi（QY-QYSC / Tornado V4-i / V4 LE）
> 三家皆已實機驗收通過；0.1.0 準備發佈，尚未上 npm。詳見 [已驗證型號](#已驗證型號)。

---

## 繁體中文

### 安裝

```bash
npm install maru-smartcube
```

> 尚未發佈到 npm（三家已實機驗過，0.1.0 準備發佈）。現在要試可直接以 git 依賴安裝，
> 或 clone 後跑本機 [展示頁](#展示頁demo)。

### 快速上手（十行以內連上方塊）

```ts
import { connectSmartCube } from 'maru-smartcube';

// 點按鈕觸發（Web Bluetooth 必須由使用者手勢啟動）
const cube = await connectSmartCube();          // 跳出瀏覽器藍牙選擇視窗 → 選 GAN 方塊
cube.addEventListener('move', (e) => {
  const { move, cubeTimestamp, hostTimestamp } = (e as CustomEvent).detail;
  console.log(move, cubeTimestamp, hostTimestamp); // 例："R'" 12345 6789.0
});
cube.addEventListener('facelets', (e) =>
  console.log((e as CustomEvent).detail.facelets),  // 54 字元 URFDLB
);
await cube.requestState();                       // 主動要一次目前狀態
```

QiYi / MoYu 各有專用連線入口（filters 不同，故目前分開；三家並陳單一視窗為決策層待辦）：

```ts
import { connectQiyiCube, connectMoyuCube } from 'maru-smartcube';

const qiyi = await connectQiyiCube();
const moyu = await connectMoyuCube();
```

### 事件（統一格式）

用 `cube.addEventListener(type, handler)`，事件內容在 `(e as CustomEvent).detail`：

| type | detail 欄位 | 說明 |
|------|------------|------|
| `move` | `move: string`、`cubeTimestamp: number \| null`、`hostTimestamp: number` | WCA 轉動記號（`R` / `U'` / `F2`…）。`cubeTimestamp` 為方塊內部時鐘(ms)，`hostTimestamp` 為 `performance.now()` |
| `facelets` | `facelets: string` | 54 字元，Kociemba `URFDLB` 順序 |
| `battery` | `level: number` | 0–100 |
| `gyro` | `quaternion: [number, number, number, number]` | 僅 GAN；MVP 只透傳不使用 |
| `connected` / `disconnected` | — | 連線狀態 |
| `error` | `error: Error` | 未知韌體版本等錯誤以事件回報，而非 silent fail |

### API

| 匯出 | 型別 | 用途 |
|------|------|------|
| `connectSmartCube(options?)` | `Promise<SmartCube>` | GAN 連線入口（SPEC 3.1） |
| `connectQiyiCube(options?)` | `Promise<SmartCube>` | QiYi 連線入口 |
| `connectMoyuCube(options?)` | `Promise<SmartCube>` | MoYu 連線入口 |
| `createTimestampFitter()` | `TimestampFitter` | 用最小平方法線性回歸校正方塊時鐘漂移，還原真實耗時（週賽防作弊核心） |

`SmartCube` 介面：

```ts
interface SmartCube extends EventTarget {
  readonly brand: 'gan' | 'moyu' | 'qiyi';
  readonly deviceName: string;
  requestState(): Promise<void>;   // 主動要求方塊回報 facelets
  requestBattery(): Promise<void>;
  resetToSolved(): Promise<void>;  // 重置邏輯狀態為復原（六面）—— 於實體方塊已復原時呼叫
  disconnect(): Promise<void>;
}
```

`resetToSolved()`：呼叫方宣告「實體方塊已復原」，driver 把軟體側邏輯狀態同步為復原並投遞一次
`facelets` 事件。GAN 用原生重置指令；MoYu 歸零 driver 重建狀態；QiYi 重送 hello 與方塊自報同步。

`ConnectOptions.macProvider`（處理 Web Bluetooth 拿不到 MAC 的情況，見下）：

```ts
type MacProvider = (device: BluetoothDevice, isFallback: boolean) => Promise<string | null>;
// 回傳 null＝讓 driver 自行從廣播資料解析；回傳 "AB:CD:EF:12:34:56" 手動指定。

await connectSmartCube({
  macProvider: async (device, isFallback) => localStorage.getItem(`mac:${device.id}`) ?? null,
});
```

`createTimestampFitter()` 用法：

```ts
const fit = createTimestampFitter();
cube.addEventListener('move', (e) => {
  const d = (e as CustomEvent).detail;
  fit.add(d.cubeTimestamp, d.hostTimestamp);   // 每步餵入兩邊時間戳
});
const realMs = fit.fit(startCubeTs, endCubeTs); // solve 結束後取校正後真實耗時
```

### 瀏覽器支援

本套件靠 [Web Bluetooth API](https://caniuse.com/web-bluetooth)，僅在支援的環境可用：

| 平台 | 瀏覽器 | 支援 |
|------|--------|------|
| Windows / macOS / Linux / ChromeOS | Chrome、Edge | ✅ |
| Android | Chrome | ✅ |
| iOS / iPadOS | Safari | ❌（不支援 Web Bluetooth；可用 Bluefy App，未測） |
| 任何平台 | Firefox | ❌ |

展示頁會偵測 `navigator.bluetooth`，不支援時顯示引導文字。

### 已驗證型號

| 品牌 | 型號 | 狀態 |
|------|------|------|
| **GAN** | GAN12 UI / i4 / i Carry（Gen2/3/4，透過 `gan-web-bluetooth`） | ✅ 實機驗收通過 |
| **MoYu** | WeiLong AI（`WCU_MY32`，加密協議） | ✅ 實機驗收通過（R U F' R' U' 逐步逐字元對上方塊自報狀態） |
| **QiYi** | QiYi AI 3x3（`QY-QYSC…`）、Tornado V4-i（`XMD-TornadoV4-i…`） | ✅ 實機驗收通過（B U R' U' B' 逐步驗證：解密→CRC→解析→ACK，move↔facelet 內部一致） |
| **QiYi** | Tornado V4 LE（`XMD-TornadoV4LE…`） | ✅ 實機驗收通過（與標準款同協議） |

未知韌體版本一律 emit `error` 事件，不會 silent fail。手上型號沒列到？歡迎依
[CONTRIBUTING.md](CONTRIBUTING.md) 用內建「診斷 / 錄製封包」工具擷取封包回傳，協助擴充。

### GAN 需要 MAC（開一次旗標或輸入一次）

GAN（與 QiYi）用藍牙 MAC 推導 AES 金鑰，但 Web Bluetooth **不直接提供 MAC**。三層 fallback：

1. **廣播資料自動解析** — 需在 Chrome 開啟實驗旗標：
   開 `chrome://flags/#enable-experimental-web-platform-features` → 設為 **Enabled** → 重開瀏覽器。
   啟用後瀏覽器才允許 `watchAdvertisements`，driver 便能自動抓到 MAC，零手動輸入。
2. **手動輸入一次** — 沒開旗標時，透過 `macProvider` 提供 MAC（展示頁會跳輸入框，並記在
   localStorage，之後同一顆方塊不再詢問）。MAC 可在系統藍牙裝置內容 / GAN 官方 App「Cube Station」查到。
3. **記憶** — app 自行決定要不要存（套件保持純粹；展示頁存在 localStorage）。

> MoYu WeiLong AI 也用 MAC 推導金鑰，但其廣播/名稱多半可推導，通常不需手動輸入。

### 展示頁（demo）

```bash
cd demo && npm install && npm run dev     # 本機開發
cd demo && npm run build                  # 產出 demo/dist（GitHub Pages 部署用）
```

點「連線」選任一品牌方塊，即時顯示轉動記錄（含時間戳）、2D 展開圖與電量；無方塊時可看「假資料」預覽。
另附「🔍 診斷方塊」「🔴 錄製封包」工具供社群交封包 fixture（見 [CONTRIBUTING.md](CONTRIBUTING.md)）。

### 開發

```bash
npm run build       # tsup 打包 → dist/ 的 ESM(.js) + CJS(.cjs) + .d.ts
npm test            # vitest run
npm run typecheck   # tsc --noEmit
```

解密 / 解析邏輯全部以真實封包 fixture 測試鎖住（硬體無法進 CI 的對策）。

### 致謝

- [csTimer](https://github.com/cs0x7f/cstimer)（陳霜 / Chen Shuang，GPL-3.0）— QiYi / MoYu
  協議、`CubieCube` 狀態代數、AES-128、時間戳線性回歸的移植來源。
- [gan-web-bluetooth](https://github.com/afedotov/gan-web-bluetooth)（Andy Fedotov）— GAN driver 底層。
- 完整移植來源與版權標頭見 [NOTICE.md](NOTICE.md)。

---

## English

### Install

```bash
npm install maru-smartcube
```

> Not on npm yet — all three brands are verified on hardware and 0.1.0 is ready to ship.
> Until then, install as a git dependency or run the local [demo](#demo).

### Quick start (connect a cube in under ten lines)

```ts
import { connectSmartCube } from 'maru-smartcube';

// Must be triggered by a user gesture (Web Bluetooth requirement)
const cube = await connectSmartCube();          // opens the browser BT chooser → pick a GAN cube
cube.addEventListener('move', (e) => {
  const { move, cubeTimestamp, hostTimestamp } = (e as CustomEvent).detail;
  console.log(move, cubeTimestamp, hostTimestamp); // e.g. "R'" 12345 6789.0
});
cube.addEventListener('facelets', (e) =>
  console.log((e as CustomEvent).detail.facelets),  // 54 chars, URFDLB
);
await cube.requestState();
```

QiYi / MoYu have dedicated entry points (their BT filters differ, so they are separate
for now; a single combined chooser is a design-owner TODO):

```ts
import { connectQiyiCube, connectMoyuCube } from 'maru-smartcube';

const qiyi = await connectQiyiCube();
const moyu = await connectMoyuCube();
```

### Events (unified)

Use `cube.addEventListener(type, handler)`; the payload is on `(e as CustomEvent).detail`:

| type | detail fields | notes |
|------|--------------|-------|
| `move` | `move: string`, `cubeTimestamp: number \| null`, `hostTimestamp: number` | WCA notation (`R` / `U'` / `F2`…). `cubeTimestamp` is the cube's internal clock (ms); `hostTimestamp` is `performance.now()` |
| `facelets` | `facelets: string` | 54 chars, Kociemba `URFDLB` order |
| `battery` | `level: number` | 0–100 |
| `gyro` | `quaternion: [number, number, number, number]` | GAN only; passed through, unused in MVP |
| `connected` / `disconnected` | — | connection state |
| `error` | `error: Error` | unknown firmware etc. are reported as events, never a silent fail |

### API

| Export | Type | Purpose |
|--------|------|---------|
| `connectSmartCube(options?)` | `Promise<SmartCube>` | GAN entry point |
| `connectQiyiCube(options?)` | `Promise<SmartCube>` | QiYi entry point |
| `connectMoyuCube(options?)` | `Promise<SmartCube>` | MoYu entry point |
| `createTimestampFitter()` | `TimestampFitter` | Least-squares linear fit that cancels cube-clock drift to recover true solve time (anti-cheat core for online comps) |

```ts
interface SmartCube extends EventTarget {
  readonly brand: 'gan' | 'moyu' | 'qiyi';
  readonly deviceName: string;
  requestState(): Promise<void>;   // ask the cube to report its facelets
  requestBattery(): Promise<void>;
  resetToSolved(): Promise<void>;  // sync the logical state to solved — call when the physical cube IS solved
  disconnect(): Promise<void>;
}

// Handles the case where Web Bluetooth won't expose the MAC (see below).
type MacProvider = (device: BluetoothDevice, isFallback: boolean) => Promise<string | null>;
// return null → let the driver parse it from advertisement data;
// return "AB:CD:EF:12:34:56" → supply it manually.
```

### Browser support

Relies on the [Web Bluetooth API](https://caniuse.com/web-bluetooth):

| Platform | Browser | Supported |
|----------|---------|-----------|
| Windows / macOS / Linux / ChromeOS | Chrome, Edge | ✅ |
| Android | Chrome | ✅ |
| iOS / iPadOS | Safari | ❌ (no Web Bluetooth; Bluefy app may work, untested) |
| Any | Firefox | ❌ |

### Verified models

| Brand | Model | Status |
|-------|-------|--------|
| **GAN** | GAN12 UI / i4 / i Carry (Gen2/3/4, via `gan-web-bluetooth`) | ✅ verified on hardware |
| **MoYu** | WeiLong AI (`WCU_MY32`, encrypted protocol) | ✅ verified — step-by-step facelets matched the cube's self-reported state |
| **QiYi** | QiYi AI 3x3 (`QY-QYSC…`), Tornado V4-i (`XMD-TornadoV4-i…`) | ✅ verified on hardware (B U R' U' B': decrypt → CRC → parse → ACK, move↔facelet self-consistent) |
| **QiYi** | Tornado V4 LE (`XMD-TornadoV4LE…`) | ✅ verified on hardware (same protocol as the standard model) |

Unknown firmware always emits an `error` event rather than failing silently. Model not
listed? Use the built-in diagnose / packet-capture tools and follow
[CONTRIBUTING.md](CONTRIBUTING.md) to submit a fixture.

### GAN needs a MAC (flip one flag, or type it once)

GAN (and QiYi) derive their AES key from the Bluetooth MAC, but Web Bluetooth **does not
expose the MAC**. Three-tier fallback:

1. **Auto-parse from advertisements** — needs a Chrome flag: open
   `chrome://flags/#enable-experimental-web-platform-features` → **Enabled** → restart.
   This unlocks `watchAdvertisements` so the driver grabs the MAC with zero typing.
2. **Type it once** — without the flag, supply the MAC through `macProvider` (the demo pops
   a dialog and remembers the cube in localStorage). Find the MAC in the OS Bluetooth device
   details or GAN's "Cube Station" app.
3. **Remembering** is the app's choice — the package stays pure and leaves storage to you.

> MoYu WeiLong AI also derives its key from the MAC, but can usually infer it from the
> advertisement/name, so manual entry is rarely needed.

### Demo

```bash
cd demo && npm install && npm run dev     # local dev
cd demo && npm run build                  # build demo/dist for GitHub Pages
```

### Development

```bash
npm run build       # tsup → dist/ ESM(.js) + CJS(.cjs) + .d.ts
npm test            # vitest run
npm run typecheck   # tsc --noEmit
```

Decryption / parsing logic is locked by real-packet fixtures (hardware can't run in CI).

### Acknowledgements

- [csTimer](https://github.com/cs0x7f/cstimer) (Chen Shuang, GPL-3.0) — source for the QiYi /
  MoYu protocols, `CubieCube` state algebra, AES-128, and the timestamp linear fit.
- [gan-web-bluetooth](https://github.com/afedotov/gan-web-bluetooth) (Andy Fedotov) — GAN driver backend.
- Full list of ported sources and copyright headers in [NOTICE.md](NOTICE.md).

---

## License

[GPL-3.0](LICENSE) © 2026 五尾（小丸號）
