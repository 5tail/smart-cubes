import type { CubeEvent, ConnectOptions, SmartCube } from '../../core/types.js';
import {
  QIYI_SERVICE_UUID,
  QIYI_CHRCT_UUID,
  QIYI_NAME_PREFIXES,
  QIYI_CIC_LIST,
  buildMessage,
  buildHello,
  buildSyncState,
  decodeNotification,
  parseCubeData,
  defaultMacFromName,
} from './protocol.js';
import { SOLVED_FACELET } from '../../utils/facelets.js';
import { recordPacket } from '../../utils/debug.js';

/**
 * QiYi AI 3x3 driver：實作統一 SmartCube 介面。
 *
 * 架構守則：
 * - driver 不得互相引用；只依賴 core/types 與 utils（經 protocol.ts）。
 * - 協議解析集中在 protocol.ts（fixture 測試覆蓋），本檔只做 BLE I/O 與事件投遞。
 *
 * ACK 機制（SPEC §6 Phase 2）：QiYi 每個 hello/state 封包都要回送 ACK，漏送會被斷線；
 * 此邏輯在 onNotification 內自動處理，對外透明。
 *
 * 事件投遞慣例（與 GAN driver 一致）：
 *   dispatchEvent(new CustomEvent(type, { detail: cubeEvent }))
 */
export class QiyiDriver extends EventTarget implements SmartCube {
  readonly brand = 'qiyi' as const;
  readonly deviceName: string;

  private readonly device: BluetoothDevice;
  private readonly chrct: BluetoothRemoteGATTCharacteristic;
  private _mac: string;
  /** 本次 MAC 的來源（診斷用）：app=macProvider 記住值 / advertisement=廣播 / name=名稱推導 / manual=手動。 */
  macSource: 'app' | 'name' | 'advertisement' | 'manual' | 'unknown' = 'unknown';
  private readonly onValueChanged: (e: Event) => void;
  private readonly onGattDisconnected: () => void;

  // 協議狀態：lastTs 用於判斷歷史 move 是否已回報；battery 快取避免重複投遞。
  private lastTs = 0;
  private battery = -1;
  private closed = false;
  // hello 驗證（_helloAndVerify）：等待「任何資料事件」的一次性喚醒鉤子。
  private notifyDataSeen: (() => void) | null = null;

  /** 本次連線實際使用的 MAC（含由廣播取得的真值）；供 app 記住以利穩定重連。 */
  get mac(): string {
    return this._mac;
  }

  constructor(
    device: BluetoothDevice,
    chrct: BluetoothRemoteGATTCharacteristic,
    deviceName: string,
    mac: string,
  ) {
    super();
    this.device = device;
    this.chrct = chrct;
    this.deviceName = deviceName;
    this._mac = mac;

    this.onValueChanged = (e) => this.handleNotification(e);
    this.onGattDisconnected = () => {
      if (this.closed) return;
      this.closed = true;
      this.emit({ type: 'disconnected' });
    };

    this.chrct.addEventListener('characteristicvaluechanged', this.onValueChanged);
    this.device.addEventListener('gattserverdisconnected', this.onGattDisconnected);

    // 以 macrotask 投遞 connected，確保呼叫端 await 後掛上的 listener 已註冊。
    setTimeout(() => this.emit({ type: 'connected' }), 0);
  }

  private emit(event: CubeEvent): void {
    this.dispatchEvent(new CustomEvent<CubeEvent>(event.type, { detail: event }));
  }

  private handleNotification(event: Event): void {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    const enc: number[] = [];
    for (let i = 0; i < value.byteLength; i++) enc[i] = value.getUint8(i);

    const msg = decodeNotification(enc);
    recordPacket('qiyi', enc, msg ?? undefined); // dev-only 擷取（預設 no-op）
    if (!msg) return; // CRC 失敗直接忽略（可能是雜訊封包）

    const { events, ack, lastTs } = parseCubeData(msg, this.lastTs, this.battery);
    this.lastTs = lastTs;
    const host = performance.now();
    for (const e of events) {
      // hello 驗證：方塊只在 hello 帶對 MAC 時才回話，任何狀態/電量/移動事件 = MAC 正確。
      // gyro 不算數（Tornado 系列姿態串流與 hello 驗證的關係未證實，保守排除）。
      if (e.type === 'facelets' || e.type === 'battery' || e.type === 'move') {
        this.notifyDataSeen?.();
      }
      if (e.type === 'battery') this.battery = e.level;
      if (e.type === 'move') {
        this.emit({ type: 'move', move: e.move, cubeTimestamp: e.cubeTimestamp, hostTimestamp: host });
      } else {
        this.emit(e);
      }
    }
    // 自動回送 ACK（不等待完成，避免阻塞後續通知）。
    if (ack) void this.chrct.writeValue(new Uint8Array(buildMessage(ack)).buffer).catch(() => {});
  }

  /** QiYi 每個狀態封包都自帶 facelets；重送 hello 可主動取回當前 facelets + battery。 */
  async requestState(): Promise<void> {
    await this.chrct.writeValue(new Uint8Array(buildHello(this._mac)).buffer);
  }

  /**
   * @internal 切換目前使用的 MAC 候選（僅供 connectQiyiDevice 的 hello 驗證鏈使用）。
   */
  _setMac(mac: string, source: QiyiDriver['macSource']): void {
    this._mac = mac;
    this.macSource = source;
  }

  /**
   * @internal hello 驗證（僅供 connectQiyiDevice 使用）：以目前 MAC 送出 hello，
   * 在時限內收到任何資料事件（facelets/battery/move）才算方塊接受這個 MAC。
   * 機制：QiYi 方塊對「MAC 錯的 hello」完全沉默（0 封包），因此有回話 = MAC 正確。
   */
  async _helloAndVerify(timeoutMs: number): Promise<boolean> {
    const seen = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.notifyDataSeen = null;
        resolve(false);
      }, timeoutMs);
      this.notifyDataSeen = () => {
        clearTimeout(timer);
        this.notifyDataSeen = null;
        resolve(true);
      };
    });
    await this.requestState();
    return seen;
  }

  /** QiYi 未提供獨立電量查詢；hello 回應含電量，故等同 requestState。 */
  async requestBattery(): Promise<void> {
    await this.requestState();
  }

  /**
   * 重置為復原（六面）：送 0x04 狀態覆寫指令，把方塊**內部**狀態改寫為復原態
   * （與 GAN 原生 REQUEST_RESET 同語意；請在實體已復原時按）。方塊會回 0x04 確認包
   * （帶新 facelets，parseCubeData 投遞 facelets 事件，畫面隨之更新）。
   * 舊做法「重送 hello 重新同步」在方塊內部追蹤器已亂時無效（同步回來的還是亂的），
   * 已改為真覆寫（0x04 由 Flying-Toast 協議文件記載、多實作交叉驗證）。
   */
  async resetToSolved(): Promise<void> {
    await this.chrct.writeValue(new Uint8Array(buildSyncState(SOLVED_FACELET)).buffer);
  }

  async disconnect(): Promise<void> {
    this.closed = true;
    this.chrct.removeEventListener('characteristicvaluechanged', this.onValueChanged);
    this.device.removeEventListener('gattserverdisconnected', this.onGattDisconnected);
    try {
      await this.chrct.stopNotifications();
    } catch {
      /* 已斷線時忽略 */
    }
    this.device.gatt?.disconnect();
    this.emit({ type: 'disconnected' });
  }
}

/** 從廣播 manufacturer data 讀取 QiYi 硬體 MAC（best-effort，逾時回 null）。 */
async function readMacFromAdvertisement(device: BluetoothDevice): Promise<string | null> {
  // watchAdvertisements 為實驗性 API，非所有瀏覽器支援。
  const dev = device as BluetoothDevice & {
    watchAdvertisements?: () => Promise<void>;
    unwatchAdvertisements?: () => void;
  };
  if (typeof dev.watchAdvertisements !== 'function') return null;
  return new Promise<string | null>((resolve) => {
    let done = false;
    const finish = (mac: string | null): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      device.removeEventListener('advertisementreceived', onAdv as EventListener);
      try {
        dev.unwatchAdvertisements?.();
      } catch {
        /* ignore */
      }
      resolve(mac);
    };
    const onAdv = (e: BluetoothAdvertisingEvent): void => {
      const md = e.manufacturerData;
      for (const cic of QIYI_CIC_LIST) {
        const dv = md.get(cic);
        if (dv && dv.byteLength >= 6) {
          const parts: string[] = [];
          for (let i = 5; i >= 0; i--) parts.push((dv.getUint8(i) + 0x100).toString(16).slice(1));
          finish(parts.join(':'));
          return;
        }
      }
    };
    // 5 秒：QiYi「含 MAC 的掃描回應」可能比第一包廣播晚到（診斷工具因此收 6 秒），
    // 3 秒在部分 Android 平板上等不到。廣播只能在 gatt.connect() 前讀（連線中不廣播）。
    const timer = setTimeout(() => finish(null), 5000);
    device.addEventListener('advertisementreceived', onAdv as EventListener);
    dev.watchAdvertisements().catch(() => finish(null));
  });
}

/**
 * 連線 QiYi 智能方塊：跳出僅含 QiYi filters 的藍牙選擇視窗，連線後回傳 QiyiDriver。
 * 統一選擇視窗（SPEC 3.1）請用 `connectSmartCube()`；本函式為 QiYi 專用入口（可 tree-shake）。
 */
export async function connectQiyiCube(options: ConnectOptions = {}): Promise<QiyiDriver> {
  const device = await navigator.bluetooth.requestDevice({
    filters: QIYI_NAME_PREFIXES.map((namePrefix) => ({ namePrefix })),
    optionalServices: [QIYI_SERVICE_UUID],
    // 必須宣告製造商 ID，Chrome 才會在廣播事件中交出 manufacturer data（含真實 MAC）。
    optionalManufacturerData: [...QIYI_CIC_LIST],
  });
  return connectQiyiDevice(device, options);
}

// hello 驗證每個 MAC 候選的等待時間：實機正確 MAC 的 hello 回應通常 <300ms，
// 1.5 秒已含餘裕；三候選全跑最壞 4.5 秒，仍在 demo 的 6 秒看門狗之內。
const HELLO_VERIFY_MS = 1500;

/**
 * 對「已選好的裝置」建立 QiYi 連線（統一選擇視窗 connectSmartCube 的分派目標）。
 *
 * MAC fallback（SPEC §7）改為「hello 驗證鏈」（2026-07-17 決策層）：
 * macProvider 記住值 → 廣播 → 名稱推導 依序當**候選**，每個候選送 hello 後等回話，
 * 有資料才算數；全部沉默才走 macProvider 手動輸入（app 層對話框含旗標引導）。
 * 動機：QiYi 對錯 MAC 的 hello 完全沉默（0 封包），而名稱推導是 best-effort 猜測
 * （csTimer 原作僅當 prompt 預設值）——舊版把它當權威來源，猜錯時手動 fallback
 * 永遠不可達，在「無記憶、無廣播（旗標未開）」的新裝置上變成死路。
 */
export async function connectQiyiDevice(
  device: BluetoothDevice,
  options: ConnectOptions = {},
): Promise<QiyiDriver> {
  const deviceName = (device.name ?? '').trim();

  // 蒐集候選（廣播必須在 gatt.connect() 前讀——BLE 裝置連線中不廣播）。
  const candidates: Array<{ mac: string; source: QiyiDriver['macSource'] }> = [];
  const push = (mac: string | null, source: QiyiDriver['macSource']): void => {
    if (mac && !candidates.some((c) => c.mac === mac)) candidates.push({ mac, source });
  };
  push((options.macProvider && (await options.macProvider(device, false))) || null, 'app');
  push(await readMacFromAdvertisement(device), 'advertisement');
  push(defaultMacFromName(deviceName), 'name');
  if (candidates.length === 0 && !options.macProvider) {
    throw new Error('QiYi 方塊需要 MAC address 才能建立連線，且無法自動取得');
  }

  const gatt = await device.gatt!.connect();
  const service = await gatt.getPrimaryService(QIYI_SERVICE_UUID);
  const chrct = await service.getCharacteristic(QIYI_CHRCT_UUID);
  await chrct.startNotifications();

  const driver = new QiyiDriver(device, chrct, deviceName, candidates[0]?.mac ?? '');

  // hello 驗證鏈：依序試每個候選，方塊有回話（facelets/battery/move）即定案。
  for (const cand of candidates) {
    driver._setMac(cand.mac, cand.source);
    if (await driver._helloAndVerify(HELLO_VERIFY_MS)) return driver;
  }

  // 自動候選全部沉默 → 手動輸入（app 層對話框；使用者可循引導開旗標後重連）。
  if (options.macProvider) {
    const manual = await options.macProvider(device, true);
    if (manual) {
      driver._setMac(manual, 'manual');
      await driver.requestState(); // 送 hello；成敗交由 app 層（如 demo 看門狗）回報
      return driver;
    }
  }

  if (candidates.length === 0) {
    // 連手動都沒有：釋放連線再丟錯（死連線會讓方塊之後完全連不到）。
    await driver.disconnect();
    throw new Error('QiYi 方塊需要 MAC address 才能建立連線，且無法自動取得');
  }
  // 有候選但全部無回應且使用者未手動輸入：回傳 driver（保留最後一個候選），
  // 由 app 層看門狗以 mac/macSource 診斷資訊提示下一步。
  return driver;
}
