// 展示頁：透過套件的 connectSmartCube()（SPEC 3.1 統一選擇視窗，三家並陳）連線方塊，
// 把統一 CubeEvent 呈現為：轉動記錄、2D 展開圖 / 3D 立體方塊、電量。
//
// 直接引用套件原始碼（單一事實來源）；Phase 3 發佈後 demo 會改為 import 已發佈套件。
import { connectSmartCube, setCapture, getCaptured } from '../../src/index';
import { unifiedRequestDeviceOptions } from '../../src/core/chooser';
import type { CubeEvent, SmartCube } from '../../src/core/types';
import { CubieCube, moveCube, moveStringToIndex } from '../../src/utils/facelets';
import { renderFacelets, renderSolved } from './cubeMap';
import { createCube3d } from './cube3d';

const connectBtn = document.querySelector<HTMLButtonElement>('#connect-btn')!;
const disconnectBtn = document.querySelector<HTMLButtonElement>('#disconnect-btn')!;
const resetBtn = document.querySelector<HTMLButtonElement>('#reset-btn')!;
const fakeBtn = document.querySelector<HTMLButtonElement>('#fake-btn')!;
const clearBtn = document.querySelector<HTMLButtonElement>('#clear-btn')!;
const statusEl = document.querySelector<HTMLSpanElement>('#status')!;
const logEl = document.querySelector<HTMLOListElement>('#event-log')!;
const supportNote = document.querySelector<HTMLParagraphElement>('#support-note')!;
const mapEl = document.querySelector<HTMLDivElement>('#cube-map')!;
const cube3dEl = document.querySelector<HTMLDivElement>('#cube-3d')!;
const view3dBtn = document.querySelector<HTMLButtonElement>('#view-3d-btn')!;
const view2dBtn = document.querySelector<HTMLButtonElement>('#view-2d-btn')!;
const batteryEl = document.querySelector<HTMLSpanElement>('#battery')!;
const deviceNameEl = document.querySelector<HTMLParagraphElement>('#device-name')!;
const macDialog = document.querySelector<HTMLDialogElement>('#mac-dialog')!;
const macInput = document.querySelector<HTMLInputElement>('#mac-input')!;
const macError = document.querySelector<HTMLParagraphElement>('#mac-error')!;
const macRemember = document.querySelector<HTMLInputElement>('#mac-remember')!;
const macDeviceName = document.querySelector<HTMLParagraphElement>('#mac-device-name')!;
const macOkBtn = document.querySelector<HTMLButtonElement>('#mac-ok')!;
const macCancelBtn = document.querySelector<HTMLButtonElement>('#mac-cancel')!;
const recordBtn = document.querySelector<HTMLButtonElement>('#record-btn')!;
const downloadBtn = document.querySelector<HTMLButtonElement>('#download-btn')!;
const copyBtn = document.querySelector<HTMLButtonElement>('#copy-btn')!;
const diagnoseBtn = document.querySelector<HTMLButtonElement>('#diagnose-btn')!;
const gyroControls = document.querySelector<HTMLDivElement>('#gyro-controls')!;
const gyroBtn = document.querySelector<HTMLButtonElement>('#gyro-btn')!;
const gyroCalibrateBtn = document.querySelector<HTMLButtonElement>('#gyro-calibrate-btn')!;
const gyroHint = document.querySelector<HTMLSpanElement>('#gyro-hint')!;

renderSolved(mapEl);
const cube3d = createCube3d(cube3dEl);

// --- 2D / 3D 檢視切換（記住選擇；兩個元件都持續更新，只切顯示）---
const VIEW_KEY = 'maru-smartcube:view';
function setView(view: '2d' | '3d'): void {
  cube3dEl.hidden = view !== '3d';
  mapEl.hidden = view !== '2d';
  gyroControls.hidden = view !== '3d'; // gyro 姿態只對 3D 有意義
  view3dBtn.classList.toggle('active', view === '3d');
  view2dBtn.classList.toggle('active', view === '2d');
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    /* ignore */
  }
}
view3dBtn.addEventListener('click', () => setView('3d'));
view2dBtn.addEventListener('click', () => setView('2d'));
setView(localStorage.getItem(VIEW_KEY) === '2d' ? '2d' : '3d');

// --- 陀螺儀姿態（GAN 有原生 gyro 事件；QiYi/MoYu 的 gyro 封包待逆向）---
let gyroOn = false;
let gyroUserToggled = false; // 使用者是否手動碰過開關（碰過就不再自動開）
let gyroSeen = false; // 本次連線是否收過 gyro 事件（診斷用）
function updateGyroHint(): void {
  if (gyroBtn.disabled) {
    gyroHint.textContent = '此方塊無陀螺儀資料（GAN/MoYu 原生支援；QiYi 僅 Tornado V4 系列）';
  } else if (!gyroSeen) {
    gyroHint.textContent = '轉一下方塊喚醒陀螺儀…（若一直停在這句，代表沒收到 gyro 事件）';
  } else if (gyroOn) {
    gyroHint.textContent = '✓ 陀螺儀運作中：翻轉方塊看 3D 跟著轉；拖曳畫面可環視、按「校正正面」歸正';
  } else {
    gyroHint.textContent = '✓ 偵測到陀螺儀，點「🧭 陀螺儀姿態」啟用';
  }
}
function setGyroAvailable(available: boolean): void {
  gyroBtn.disabled = !available;
  if (!available) {
    gyroSeen = false;
    gyroUserToggled = false;
    if (gyroOn) toggleGyro(false); // 斷線/換非 GAN 方塊時關閉
  }
  updateGyroHint();
}
function toggleGyro(on: boolean): void {
  gyroOn = on;
  cube3d.setGyroMode(on);
  gyroBtn.classList.toggle('active', on);
  gyroBtn.textContent = on ? '🧭 陀螺儀姿態（開）' : '🧭 陀螺儀姿態';
  gyroCalibrateBtn.hidden = !on;
  updateGyroHint();
}
// gyro 事件（高頻）：更新姿態；首次收到且使用者沒手動切換過 → 自動開啟（連上翻方塊即跟著轉）。
function onGyro(quaternion: [number, number, number, number]): void {
  cube3d.setOrientation(quaternion);
  if (!gyroSeen) {
    gyroSeen = true;
    // 事件驅動啟用：只要有 gyro 事件（不限品牌）就開放開關 —— 未來 QiYi/MoYu gyro 落地時自動生效。
    if (gyroBtn.disabled) gyroBtn.disabled = false;
    if (!gyroUserToggled) toggleGyro(true);
    else updateGyroHint();
  }
}
gyroBtn.addEventListener('click', () => {
  gyroUserToggled = true;
  toggleGyro(!gyroOn);
});
gyroCalibrateBtn.addEventListener('click', () => cube3d.calibrate());

// --- 瀏覽器支援偵測（SPEC §7）---
if (!('bluetooth' in navigator)) {
  supportNote.hidden = false;
  supportNote.textContent =
    '⚠️ 這個瀏覽器不支援 Web Bluetooth，無法連真方塊。請用桌機 Chrome / Edge，或 Android Chrome。' +
    '（仍可點「看假資料」預覽介面。）';
  connectBtn.disabled = true;
}

// --- 事件 log 呈現 ---
function describe(event: CubeEvent): string {
  switch (event.type) {
    case 'move':
      return `move  ${event.move.padEnd(3)}  cube=${event.cubeTimestamp ?? '—'}  host=${event.hostTimestamp.toFixed(0)}`;
    case 'facelets':
      return `facelets  ${event.facelets}`;
    case 'battery':
      return `battery  ${event.level}%`;
    case 'gyro':
      return `gyro  [${event.quaternion.map((n) => n.toFixed(2)).join(', ')}]`;
    case 'connected':
      return 'connected';
    case 'disconnected':
      return 'disconnected';
    case 'error':
      return `error  ${event.error.message}`;
  }
}

function appendEvent(event: CubeEvent): void {
  const li = document.createElement('li');
  li.className = `evt evt-${event.type}`;
  const time = document.createElement('span');
  time.className = 'evt-time';
  time.textContent = new Date().toLocaleTimeString('zh-Hant', { hour12: false });
  const body = document.createElement('span');
  body.className = 'evt-body';
  body.textContent = describe(event);
  li.append(time, body);
  logEl.prepend(li);
}

// 錄製封包時同步收集 demo 端解出的事件（null = 未錄製），供下載時與原始封包對照。
let recordedEvents: CubeEvent[] | null = null;

// 依 CubeEvent 更新畫面（log + 2D 圖 + 電量），真假資料共用。
function handleEvent(event: CubeEvent): void {
  // gyro 為高頻事件：只驅動 3D 姿態，不進事件 log（避免洗版）。
  if (event.type === 'gyro') {
    onGyro(event.quaternion);
    return;
  }
  appendEvent(event);
  if (recordedEvents !== null) recordedEvents.push(event);
  // facelets 為權威狀態（2D 直接重繪、3D snap）；move 只驅動 3D 轉層動畫（ADR 2026-07-13）。
  if (event.type === 'facelets') {
    renderFacelets(mapEl, event.facelets);
    cube3d.setFacelets(event.facelets);
  }
  if (event.type === 'move') cube3d.applyMove(event.move);
  if (event.type === 'battery') batteryEl.textContent = `電量 ${event.level}%`;
}

function setConnected(connected: boolean, label: string): void {
  const noBluetooth = !('bluetooth' in navigator);
  connectBtn.disabled = connected || noBluetooth;
  fakeBtn.disabled = connected;
  disconnectBtn.disabled = !connected;
  resetBtn.disabled = !connected;
  statusEl.textContent = label;
  statusEl.classList.toggle('on', connected);
}

// --- 真方塊連線（Phase 1）---
let cube: SmartCube | null = null;
const EVENT_TYPES: CubeEvent['type'][] = [
  'move',
  'facelets',
  'battery',
  'gyro',
  'connected',
  'disconnected',
  'error',
];

function onCubeEvent(e: Event): void {
  const event = (e as CustomEvent<CubeEvent>).detail;
  handleEvent(event);
  // 收到第一個資料事件 = 這個 MAC 確實能串流 → 才存起來（避免存到連得上卻不串流的錯 MAC）。
  if (event.type === 'facelets' || event.type === 'move' || event.type === 'battery') {
    dataArrived = true;
    const resolvedMac = (cube as Partial<{ mac: string }> | null)?.mac;
    if (!macSaved && pendingDevice && typeof resolvedMac === 'string' && resolvedMac) {
      saveMac(pendingDevice, resolvedMac);
      macSaved = true;
    }
  }
  // 只對 GAN 每步主動要一次 facelets（GAN 不逐步回報）。MoYu/QiYi 每步已自帶 facelets 事件，
  // 再要一次既浪費 BLE 往返，MoYu 重置後還會引來自報狀態與 driver 重建之爭（ADR 2026-07-13）。
  if (event.type === 'move' && cube?.brand === 'gan') void cube.requestState();
  if (event.type === 'disconnected') teardown();
}

function teardown(): void {
  if (cube) {
    for (const t of EVENT_TYPES) cube.removeEventListener(t, onCubeEvent);
    cube = null;
  }
  deviceNameEl.textContent = '';
  setConnected(false, '未連線');
  setGyroAvailable(false); // 斷線：停用陀螺儀（若開著會一併關閉）
}

// --- MAC 記憶（SPEC §7 三層 fallback 的 localStorage 層）+ 友善輸入對話框 ---
// 以 device.id（origin 內穩定的裝置識別）為 key，某顆方塊輸入一次後永久記住。
const macKey = (device: BluetoothDevice): string => `maru-smartcube:mac:${device.id}`;

function loadSavedMac(device: BluetoothDevice): string | null {
  try {
    return localStorage.getItem(macKey(device));
  } catch {
    return null;
  }
}
function saveMac(device: BluetoothDevice, mac: string): void {
  try {
    localStorage.setItem(macKey(device), mac);
  } catch {
    /* 隱私模式等情境無法寫入時忽略 */
  }
}
function clearSavedMac(device: BluetoothDevice): void {
  try {
    localStorage.removeItem(macKey(device));
  } catch {
    /* ignore */
  }
}

// 正規化為 XX:XX:XX:XX:XX:XX（接受 : - 空白或無分隔）；非 12 個 16 進位字元回傳 null。
function normalizeMac(input: string): string | null {
  const hex = input.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hex.length !== 12) return null;
  return (hex.match(/.{2}/g) ?? []).join(':');
}

// 顯示引導對話框取回 MAC；取消回傳 null，勾選「記住」時存入 localStorage。
function promptMac(device: BluetoothDevice): Promise<string | null> {
  return new Promise((resolve) => {
    macInput.value = loadSavedMac(device) ?? '';
    macError.textContent = '';
    macRemember.checked = true;
    macDeviceName.textContent = device.name ? `方塊：${device.name}` : '';

    const cleanup = (): void => {
      macOkBtn.removeEventListener('click', onOk);
      macCancelBtn.removeEventListener('click', onCancel);
      macDialog.removeEventListener('cancel', onCancel);
      macDialog.close();
    };
    const onOk = (): void => {
      const norm = normalizeMac(macInput.value);
      if (!norm) {
        macError.textContent = '格式不對，需要 12 個 16 進位字元，例如 AB:CD:EF:12:34:56';
        return; // 保持開啟讓使用者修正
      }
      if (macRemember.checked) saveMac(device, norm);
      cleanup();
      resolve(norm);
    };
    const onCancel = (e: Event): void => {
      e.preventDefault();
      cleanup();
      resolve(null);
    };
    macOkBtn.addEventListener('click', onOk);
    macCancelBtn.addEventListener('click', onCancel);
    macDialog.addEventListener('cancel', onCancel); // Esc 鍵
    macDialog.showModal();
  });
}

// 記住本次選到的裝置；連上並「確認有串流」後才把 driver 實際用的 MAC 存起來，
// 讓下次重連直接用記住的 MAC，不必再靠 watchAdvertisements（修復「重連需重整」問題）。
// 只在收到資料事件後才存，避免把「連得上但不串流」的錯 MAC 存進去。
let pendingDevice: BluetoothDevice | null = null;
let usedSavedMac = false; // 本次連線是否採用了 localStorage 記住的 MAC
let dataArrived = false; // 本次連線是否收到過資料事件（facelets/move/battery）
let macSaved = false; // 本次連線是否已存過 MAC

// 三層 fallback：先給記住的 MAC（免詢問）→ 讓 driver 試廣播/名稱自動偵測 → 最後才跳對話框。
const macProvider = async (device: BluetoothDevice, isFallback: boolean): Promise<string | null> => {
  if (!isFallback) {
    pendingDevice = device;
    const saved = loadSavedMac(device);
    usedSavedMac = saved !== null;
    return saved;
  }
  return promptMac(device);
};

async function doConnect(connectFn: () => Promise<SmartCube>): Promise<void> {
  setConnected(false, '連線中…');
  pendingDevice = null;
  usedSavedMac = false;
  dataArrived = false;
  macSaved = false;
  try {
    cube = await connectFn();
    for (const t of EVENT_TYPES) cube.addEventListener(t, onCubeEvent);
    // MAC 診斷資訊（QiYi/MoYu/GAN driver 皆暴露 mac；QiYi/MoYu 另有來源）。
    const diag = cube as Partial<{ mac: string; macSource: string }>;
    const SOURCE_LABEL: Record<string, string> = {
      app: '記住值',
      name: '名稱推導',
      advertisement: '廣播',
      manual: '手動輸入',
      unknown: '不明',
    };
    const macInfo = diag.mac
      ? ` · MAC ${diag.mac}${diag.macSource ? `（${SOURCE_LABEL[diag.macSource] ?? diag.macSource}）` : ''}`
      : '';
    // 看門狗（所有品牌、所有 MAC 來源）：連上 6 秒沒任何資料 = 金鑰/MAC 幾乎肯定不對，
    // 直接把用到的 MAC 與下一步顯示在 log，不再靜默。用了記住值時順便清除讓下次重抓。
    const deviceForRecovery = pendingDevice;
    const connectedCube = cube;
    window.setTimeout(() => {
      if (dataArrived || cube !== connectedCube) return;
      if (usedSavedMac && deviceForRecovery) clearSavedMac(deviceForRecovery);
      appendEvent({
        type: 'error',
        error: new Error(
          `已連線 6 秒但沒收到任何資料（連電量都沒有）。本次使用 MAC ${diag.mac ?? '（不明）'}` +
            `（來源：${SOURCE_LABEL[diag.macSource ?? 'unknown'] ?? diag.macSource}）——金鑰可能不對。` +
            '已自動斷線（釋放藍牙連線，避免方塊被卡住之後連不到）；請重整網頁再連一次。',
        ),
      });
      // 關鍵：主動斷線釋放 GATT。BLE 裝置連線中不會廣播，若留著死連線，方塊之後就「完全連不到」。
      void connectedCube.disconnect();
      teardown();
    }, 6000);
    lastCubeBrand = cube.brand;
    lastCubeName = cube.deviceName;
    deviceNameEl.textContent = `已連線：${cube.deviceName}（${cube.brand}）${macInfo}`;
    setConnected(true, '已連線');
    // GAN 原生串流；MoYu 由 driver 送開啟指令（0xAC）後串流；QiYi 僅 Tornado V4 系列有
    // 姿態封包 → 靠事件驅動啟用（首個 gyro 事件到達時自動開放開關）。
    setGyroAvailable(cube.brand === 'gan' || cube.brand === 'moyu');
    await cube.requestBattery();
    await cube.requestState();
  } catch (err) {
    appendEvent({ type: 'error', error: err instanceof Error ? err : new Error(String(err)) });
    teardown();
  }
}

connectBtn.addEventListener('click', () => void doConnect(() => connectSmartCube({ macProvider })));

disconnectBtn.addEventListener('click', async () => {
  await cube?.disconnect();
  teardown();
});

// 重置為復原（六面）。resetToSolved 已納入 SmartCube 凍結合約（SPEC §3.3，ADR 2026-07-13）。
resetBtn.addEventListener('click', async () => {
  if (!cube) return;
  try {
    await cube.resetToSolved();
    // 各 driver 會投遞更新後的 facelets 事件，2D 圖隨之更新（不在此強制上色）。
    appendEvent({ type: 'error', error: new Error('已送出重置為復原；請確認方塊實體已復原六面。') });
  } catch (err) {
    appendEvent({ type: 'error', error: err instanceof Error ? err : new Error(String(err)) });
  }
});

clearBtn.addEventListener('click', () => {
  logEl.replaceChildren();
});

// --- 封包錄製（實機 fixture 擷取）---
let recording = false;
let recordTimer: ReturnType<typeof setInterval> | null = null;
// 斷線 teardown 會清掉 cube，記住錄製當下的品牌/名稱讓匯出仍有標記。
let lastCubeBrand: string | null = null;
let lastCubeName: string | null = null;

recordBtn.addEventListener('click', () => {
  recording = !recording;
  setCapture(recording); // 開啟時清空 driver 端緩衝
  recordedEvents = recording ? [] : recordedEvents;
  recordBtn.classList.toggle('recording', recording);
  downloadBtn.disabled = recording; // 停止後才能匯出
  copyBtn.disabled = recording;
  if (recording) {
    // 即時封包計數：平板上不必匯出檔案，看數字就知道「方塊到底有沒有送資料」。
    recordBtn.textContent = '⏹ 停止錄製（0 包）';
    recordTimer = setInterval(() => {
      recordBtn.textContent = `⏹ 停止錄製（${getCaptured().length} 包）`;
    }, 500);
  } else {
    if (recordTimer !== null) clearInterval(recordTimer);
    recordTimer = null;
    recordBtn.textContent = `🔴 錄製封包（上次 ${getCaptured().length} 包）`;
  }
});

// --- 診斷（未知方塊型號除錯）：抓廣播 manufacturer data（含真 MAC）+ 已授權服務的特徵值 ---
function dvToHex(dv: DataView): string {
  return Array.from({ length: dv.byteLength }, (_, i) => dv.getUint8(i).toString(16).padStart(2, '0')).join('');
}

// 連續蒐集 6 秒的廣播並合併（含 MAC 的「掃描回應」可能在較晚的封包才到）。
async function readAdvertisement(device: BluetoothDevice): Promise<unknown> {
  const dev = device as BluetoothDevice & { watchAdvertisements?: (o?: { signal: AbortSignal }) => Promise<void> };
  if (typeof dev.watchAdvertisements !== 'function') return 'watchAdvertisements 不支援（未開實驗旗標？）';
  return new Promise((resolve) => {
    const ac = new AbortController();
    let events = 0;
    const manufacturerData: Record<string, string> = {};
    const serviceData: Record<string, string> = {};
    const uuids = new Set<string>();
    let lastRssi: number | undefined;
    const onAdv = (e: BluetoothAdvertisingEvent): void => {
      events += 1;
      lastRssi = e.rssi ?? lastRssi;
      e.manufacturerData.forEach((v, k) => (manufacturerData[`cic_0x${k.toString(16).padStart(4, '0')}`] = dvToHex(v)));
      e.serviceData.forEach((v, k) => (serviceData[k] = dvToHex(v)));
      (e.uuids ?? []).forEach((u) => uuids.add(String(u)));
    };
    const finish = (): void => {
      clearTimeout(timer);
      device.removeEventListener('advertisementreceived', onAdv as EventListener);
      ac.abort();
      if (events === 0) {
        resolve('逾時：6 秒內沒收到廣播（先轉一下方塊喚醒、靠近一點再試）');
        return;
      }
      resolve({
        eventsSeen: events,
        rssi: lastRssi,
        uuids: [...uuids],
        manufacturerData,
        serviceData,
        hasManufacturerData: Object.keys(manufacturerData).length > 0,
      });
    };
    const timer = setTimeout(finish, 6000);
    device.addEventListener('advertisementreceived', onAdv as EventListener);
    dev.watchAdvertisements({ signal: ac.signal }).catch(() => {
      clearTimeout(timer);
      resolve('watchAdvertisements 失敗');
    });
  });
}

// 已知可能用到的服務 UUID（Web Bluetooth 只能列舉事先宣告的服務）。
const KNOWN_SERVICES = [
  '0000fff0-0000-1000-8000-00805f9b34fb', // QiYi
  '00001000-0000-1000-8000-00805f9b34fb', // MoYu（舊版 MHC）
  '0783b03e-7735-b5a0-1760-a305d2795cb0', // MoYu WeiLong AI
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART（常見備援）
  'battery_service',
  'device_information',
];

diagnoseBtn.addEventListener('click', async () => {
  appendEvent({ type: 'error', error: new Error('診斷開始：請在瀏覽器視窗選擇方塊…') });
  const report: Record<string, unknown> = { at: new Date().toISOString() };
  try {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'XMD-TornadoV4' }, { namePrefix: 'QY-QYSC' }, { namePrefix: 'WCU_MY3' }],
      optionalServices: KNOWN_SERVICES,
      // 必須宣告三家製造商 ID，Chrome 才會在廣播中交出 manufacturer data（含真實 MAC）。
      // 先前只宣告 QiYi 0x0504 → MoYu/GAN 的廣播資料被 Chrome 濾掉，診斷抓不到魔域真 MAC。
      optionalManufacturerData: unifiedRequestDeviceOptions().optionalManufacturerData,
    });
    report.deviceName = device.name;
    report.deviceId = device.id;
    report.advertisement = await readAdvertisement(device);
    const gatt = await device.gatt!.connect();
    const PROP_NAMES = [
      'broadcast',
      'read',
      'writeWithoutResponse',
      'write',
      'notify',
      'indicate',
      'authenticatedSignedWrites',
      'reliableWrite',
      'writableAuxiliaries',
    ] as const;
    const services: unknown[] = [];
    for (const uuid of KNOWN_SERVICES) {
      try {
        const svc = await gatt.getPrimaryService(uuid);
        const chars = await svc.getCharacteristics();
        const characteristics: unknown[] = [];
        for (const c of chars) {
          const props = c.properties as unknown as Record<string, boolean>;
          const properties = PROP_NAMES.filter((k) => props[k]);
          // 可讀特徵值就讀出來（MAC / 裝置資訊常藏在這裡）。
          let value: string | undefined;
          if (c.properties.read) {
            try {
              value = dvToHex(await c.readValue());
            } catch (e) {
              value = `read failed: ${e instanceof Error ? e.message : String(e)}`;
            }
          }
          characteristics.push({ uuid: c.uuid, properties, ...(value !== undefined ? { value } : {}) });
        }
        services.push({ service: svc.uuid, characteristics });
      } catch {
        /* 該服務不存在，略過 */
      }
    }
    report.services = services;
    gatt.disconnect();
    appendEvent({ type: 'error', error: new Error('診斷完成，正在下載 JSON…') });
  } catch (err) {
    report.error = err instanceof Error ? err.message : String(err);
    appendEvent({ type: 'error', error: err instanceof Error ? err : new Error(String(err)) });
  }
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `maru-diagnose-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

function buildCaptureDump(): { brand: string | null; json: string } {
  const brand = cube?.brand ?? lastCubeBrand;
  const dump = {
    brand,
    deviceName: cube?.deviceName ?? lastCubeName,
    capturedAt: new Date().toISOString(),
    note: '實機封包擷取（raw=原始加密, decoded=driver 解密後）；events=demo 解出的事件。不含 MAC。',
    packets: getCaptured(),
    events: recordedEvents ?? [],
  };
  return { brand, json: JSON.stringify(dump, null, 2) };
}

downloadBtn.addEventListener('click', () => {
  const { brand, json } = buildCaptureDump();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `maru-capture-${brand ?? 'cube'}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// 平板（無法下載檔案）：複製到剪貼簿，直接貼進聊天室/文件即可回傳。
copyBtn.addEventListener('click', async () => {
  const { json } = buildCaptureDump();
  try {
    await navigator.clipboard.writeText(json);
    appendEvent({ type: 'error', error: new Error(`已複製 ${getCaptured().length} 包封包 JSON 到剪貼簿，直接貼上回傳即可。`) });
  } catch (err) {
    appendEvent({ type: 'error', error: new Error(`複製失敗：${err instanceof Error ? err.message : String(err)}`) });
  }
});

// --- 假資料（無方塊時預覽介面用）---
const FAKE_MOVES = ['R', "U'", 'F2', 'L', "D'", 'B', "R'", 'U', 'F', "L'"];
const FAKE_SOLVED =
  'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
let fakeTimer: ReturnType<typeof setInterval> | null = null;
let fakeClock = 0;
let fakeCubie = new CubieCube(); // 假資料也維護整顆狀態，讓 move 後跟著權威 facelets（同真 driver 行為）

fakeBtn.addEventListener('click', () => {
  if (fakeTimer !== null) {
    clearInterval(fakeTimer);
    fakeTimer = null;
    handleEvent({ type: 'disconnected' });
    setConnected(false, '未連線');
    return;
  }
  fakeClock = 0;
  fakeCubie = new CubieCube();
  setConnected(true, '已連線（假資料）');
  disconnectBtn.disabled = true; // 假資料用同一顆按鈕切換
  resetBtn.disabled = true; // 假資料無真方塊可重置
  handleEvent({ type: 'connected' });
  handleEvent({ type: 'battery', level: 87 });
  handleEvent({ type: 'facelets', facelets: FAKE_SOLVED });
  fakeTimer = setInterval(() => {
    fakeClock += 200 + Math.floor(Math.random() * 800);
    const move = FAKE_MOVES[Math.floor(Math.random() * FAKE_MOVES.length)]!;
    handleEvent({
      type: 'move',
      move,
      cubeTimestamp: fakeClock,
      hostTimestamp: performance.now(),
    });
    const next = new CubieCube();
    CubieCube.cubeMult(fakeCubie, moveCube[moveStringToIndex(move)]!, next);
    fakeCubie = next;
    handleEvent({ type: 'facelets', facelets: fakeCubie.toFaceCube() });
  }, 1200);
});
