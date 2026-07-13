import type { CubeEvent, ConnectOptions, SmartCube } from '../../core/types.js';
import {
  QIYI_SERVICE_UUID,
  QIYI_CHRCT_UUID,
  QIYI_NAME_PREFIXES,
  QIYI_CIC_LIST,
  buildMessage,
  buildHello,
  decodeNotification,
  parseCubeData,
  defaultMacFromName,
} from './protocol.js';
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
  /** 本次連線實際使用的 MAC（含由廣播取得的真值）；供 app 記住以利穩定重連。 */
  readonly mac: string;
  /** 本次 MAC 的來源（診斷用）：app=macProvider 記住值 / advertisement=廣播 / name=名稱推導 / manual=手動。 */
  macSource: 'app' | 'name' | 'advertisement' | 'manual' | 'unknown' = 'unknown';
  private readonly onValueChanged: (e: Event) => void;
  private readonly onGattDisconnected: () => void;

  // 協議狀態：lastTs 用於判斷歷史 move 是否已回報；battery 快取避免重複投遞。
  private lastTs = 0;
  private battery = -1;
  private closed = false;

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
    this.mac = mac;

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
    await this.chrct.writeValue(new Uint8Array(buildHello(this.mac)).buffer);
  }

  /** QiYi 未提供獨立電量查詢；hello 回應含電量，故等同 requestState。 */
  async requestBattery(): Promise<void> {
    await this.requestState();
  }

  /**
   * 重置為復原（六面）。QiYi 無 BLE 重置指令，facelets 由方塊自身回報；
   * 此處重送 hello 讓畫面與方塊當前狀態重新同步（方塊實體復原時即顯示六面）。
   */
  async resetToSolved(): Promise<void> {
    await this.requestState();
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
    const timer = setTimeout(() => finish(null), 3000);
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

/** 對「已選好的裝置」建立 QiYi 連線（統一選擇視窗 connectSmartCube 的分派目標）。 */
export async function connectQiyiDevice(
  device: BluetoothDevice,
  options: ConnectOptions = {},
): Promise<QiyiDriver> {
  const deviceName = (device.name ?? '').trim();

  // MAC fallback（SPEC §7）：macProvider 記住的值 → 廣播資料 → 名稱推導 → macProvider 手動輸入。
  let source: QiyiDriver['macSource'] = 'unknown';
  let mac = (options.macProvider && (await options.macProvider(device, false))) || null;
  if (mac) source = 'app';
  if (!mac) {
    mac = await readMacFromAdvertisement(device);
    if (mac) source = 'advertisement';
  }
  if (!mac) {
    mac = defaultMacFromName(deviceName);
    if (mac) source = 'name';
  }
  if (!mac && options.macProvider) {
    mac = await options.macProvider(device, true);
    if (mac) source = 'manual';
  }
  if (!mac) throw new Error('QiYi 方塊需要 MAC address 才能建立連線，且無法自動取得');

  const gatt = await device.gatt!.connect();
  const service = await gatt.getPrimaryService(QIYI_SERVICE_UUID);
  const chrct = await service.getCharacteristic(QIYI_CHRCT_UUID);
  await chrct.startNotifications();

  const driver = new QiyiDriver(device, chrct, deviceName, mac);
  driver.macSource = source;
  // 送出 hello 開始串流（方塊會回 hello 封包，內含 facelets + battery）。
  await chrct.writeValue(new Uint8Array(buildHello(mac)).buffer);
  return driver;
}
