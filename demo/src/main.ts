// Phase 0 展示頁：連線按鈕 + 事件 log 區，先接假資料。
// 真實藍牙連線（connectSmartCube）於 Phase 1 起接入。
//
// 這裡直接引用套件的合約型別（單一事實來源），確保假資料與未來真資料同型。
import type { CubeEvent } from '../../src/core/types.js';

const connectBtn = document.querySelector<HTMLButtonElement>('#connect-btn')!;
const disconnectBtn = document.querySelector<HTMLButtonElement>('#disconnect-btn')!;
const clearBtn = document.querySelector<HTMLButtonElement>('#clear-btn')!;
const statusEl = document.querySelector<HTMLSpanElement>('#status')!;
const logEl = document.querySelector<HTMLOListElement>('#event-log')!;
const supportNote = document.querySelector<HTMLParagraphElement>('#support-note')!;

// --- 瀏覽器支援偵測（SPEC §7：不支援時顯示引導文字）---
if (!('bluetooth' in navigator)) {
  supportNote.hidden = false;
  supportNote.textContent =
    '⚠️ 這個瀏覽器不支援 Web Bluetooth。請用桌機 Chrome / Edge，或 Android Chrome。' +
    '（下方為假資料展示，仍可操作。）';
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

// --- 假資料產生器（Phase 0）---
const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const FAKE_MOVES = ['R', "U'", 'F2', 'L', "D'", 'B', "R'", 'U', 'F', "L'"];

let timer: ReturnType<typeof setInterval> | null = null;
let cubeClock = 0;

function startFakeStream(): void {
  appendEvent({ type: 'connected' });
  appendEvent({ type: 'battery', level: 87 });
  appendEvent({ type: 'facelets', facelets: SOLVED });

  timer = setInterval(() => {
    cubeClock += 200 + Math.floor(Math.random() * 800);
    const move = FAKE_MOVES[Math.floor(Math.random() * FAKE_MOVES.length)]!;
    appendEvent({
      type: 'move',
      move,
      cubeTimestamp: cubeClock,
      hostTimestamp: performance.now(),
    });
  }, 1200);
}

function stopFakeStream(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
  appendEvent({ type: 'disconnected' });
}

// --- 連線狀態機（Phase 0：模擬）---
function setConnected(connected: boolean): void {
  connectBtn.disabled = connected;
  disconnectBtn.disabled = !connected;
  statusEl.textContent = connected ? '已連線（假資料）' : '未連線';
  statusEl.classList.toggle('on', connected);
}

connectBtn.addEventListener('click', () => {
  setConnected(true);
  cubeClock = 0;
  startFakeStream();
});

disconnectBtn.addEventListener('click', () => {
  stopFakeStream();
  setConnected(false);
});

clearBtn.addEventListener('click', () => {
  logEl.replaceChildren();
});
