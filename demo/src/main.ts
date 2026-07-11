// Phase 1 展示頁：透過套件的 connectSmartCube() 連線 GAN 真方塊，
// 把統一 CubeEvent 呈現為：轉動記錄、2D 展開圖、電量。
//
// 直接引用套件原始碼（單一事實來源）；Phase 3 發佈後 demo 會改為 import 已發佈套件。
import { connectSmartCube, connectQiyiCube, connectMoyuCube } from '../../src/index';
import type { CubeEvent, SmartCube } from '../../src/core/types';
import { renderFacelets, renderSolved } from './cubeMap';

const connectBtn = document.querySelector<HTMLButtonElement>('#connect-btn')!;
const connectQiyiBtn = document.querySelector<HTMLButtonElement>('#connect-qiyi-btn')!;
const connectMoyuBtn = document.querySelector<HTMLButtonElement>('#connect-moyu-btn')!;
const disconnectBtn = document.querySelector<HTMLButtonElement>('#disconnect-btn')!;
const fakeBtn = document.querySelector<HTMLButtonElement>('#fake-btn')!;
const clearBtn = document.querySelector<HTMLButtonElement>('#clear-btn')!;
const statusEl = document.querySelector<HTMLSpanElement>('#status')!;
const logEl = document.querySelector<HTMLOListElement>('#event-log')!;
const supportNote = document.querySelector<HTMLParagraphElement>('#support-note')!;
const mapEl = document.querySelector<HTMLDivElement>('#cube-map')!;
const batteryEl = document.querySelector<HTMLSpanElement>('#battery')!;
const deviceNameEl = document.querySelector<HTMLParagraphElement>('#device-name')!;
const macDialog = document.querySelector<HTMLDialogElement>('#mac-dialog')!;
const macInput = document.querySelector<HTMLInputElement>('#mac-input')!;
const macError = document.querySelector<HTMLParagraphElement>('#mac-error')!;
const macRemember = document.querySelector<HTMLInputElement>('#mac-remember')!;
const macDeviceName = document.querySelector<HTMLParagraphElement>('#mac-device-name')!;
const macOkBtn = document.querySelector<HTMLButtonElement>('#mac-ok')!;
const macCancelBtn = document.querySelector<HTMLButtonElement>('#mac-cancel')!;

renderSolved(mapEl);

// --- 瀏覽器支援偵測（SPEC §7）---
if (!('bluetooth' in navigator)) {
  supportNote.hidden = false;
  supportNote.textContent =
    '⚠️ 這個瀏覽器不支援 Web Bluetooth，無法連真方塊。請用桌機 Chrome / Edge，或 Android Chrome。' +
    '（仍可點「看假資料」預覽介面。）';
  connectBtn.disabled = true;
  connectQiyiBtn.disabled = true;
  connectMoyuBtn.disabled = true;
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

// 依 CubeEvent 更新畫面（log + 2D 圖 + 電量），真假資料共用。
function handleEvent(event: CubeEvent): void {
  appendEvent(event);
  if (event.type === 'facelets') renderFacelets(mapEl, event.facelets);
  if (event.type === 'battery') batteryEl.textContent = `電量 ${event.level}%`;
}

function setConnected(connected: boolean, label: string): void {
  const noBluetooth = !('bluetooth' in navigator);
  connectBtn.disabled = connected || noBluetooth;
  connectQiyiBtn.disabled = connected || noBluetooth;
  connectMoyuBtn.disabled = connected || noBluetooth;
  fakeBtn.disabled = connected;
  disconnectBtn.disabled = !connected;
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
  // 每次轉動主動要一次 facelets，讓 2D 圖跟上（demo 用；套件不強制）。
  if (event.type === 'move') void cube?.requestState();
  if (event.type === 'disconnected') teardown();
}

function teardown(): void {
  if (cube) {
    for (const t of EVENT_TYPES) cube.removeEventListener(t, onCubeEvent);
    cube = null;
  }
  deviceNameEl.textContent = '';
  setConnected(false, '未連線');
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

// 三層 fallback：先給記住的 MAC（免詢問）→ 讓 driver 試廣播/名稱自動偵測 → 最後才跳對話框。
const macProvider = async (device: BluetoothDevice, isFallback: boolean): Promise<string | null> =>
  isFallback ? promptMac(device) : loadSavedMac(device);

async function doConnect(connectFn: () => Promise<SmartCube>): Promise<void> {
  setConnected(false, '連線中…');
  try {
    cube = await connectFn();
    for (const t of EVENT_TYPES) cube.addEventListener(t, onCubeEvent);
    deviceNameEl.textContent = `已連線：${cube.deviceName}（${cube.brand}）`;
    setConnected(true, '已連線');
    await cube.requestBattery();
    await cube.requestState();
  } catch (err) {
    appendEvent({ type: 'error', error: err instanceof Error ? err : new Error(String(err)) });
    teardown();
  }
}

connectBtn.addEventListener('click', () => void doConnect(() => connectSmartCube({ macProvider })));
connectQiyiBtn.addEventListener('click', () => void doConnect(() => connectQiyiCube({ macProvider })));
connectMoyuBtn.addEventListener('click', () => void doConnect(() => connectMoyuCube({ macProvider })));

disconnectBtn.addEventListener('click', async () => {
  await cube?.disconnect();
  teardown();
});

clearBtn.addEventListener('click', () => {
  logEl.replaceChildren();
});

// --- 假資料（無方塊時預覽介面用）---
const FAKE_MOVES = ['R', "U'", 'F2', 'L', "D'", 'B', "R'", 'U', 'F', "L'"];
const FAKE_SOLVED =
  'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
let fakeTimer: ReturnType<typeof setInterval> | null = null;
let fakeClock = 0;

fakeBtn.addEventListener('click', () => {
  if (fakeTimer !== null) {
    clearInterval(fakeTimer);
    fakeTimer = null;
    handleEvent({ type: 'disconnected' });
    setConnected(false, '未連線');
    return;
  }
  fakeClock = 0;
  setConnected(true, '已連線（假資料）');
  disconnectBtn.disabled = true; // 假資料用同一顆按鈕切換
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
  }, 1200);
});
