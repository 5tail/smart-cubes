import type { CubeEvent, ConnectOptions, SmartCube } from '../../core/types.js';
import { Aes128 } from '../../utils/crypto.js';
import { CubieCube, moveCube } from '../../utils/facelets.js';
import {
  MOYU_SERVICE_UUID,
  MOYU_CHRCT_READ,
  MOYU_CHRCT_WRITE,
  MOYU_NAME_PREFIXES,
  MOYU_CIC_LIST,
  OPCODE_INFO,
  OPCODE_STATE,
  OPCODE_BATTERY,
  OPCODE_MOVE,
  deriveKeyIv,
  decode,
  encode,
  buildRequest,
  messageType,
  parseState,
  parseBattery,
  parseMovePacket,
  defaultMacFromName,
} from './protocol.js';
import { recordPacket } from '../../utils/debug.js';

/**
 * MoYu WeiLong AI driver（加密協議，WCU_MY3 前綴）：實作統一 SmartCube 介面。
 *
 * 架構守則：driver 不得互相引用；只依賴 core/types 與 utils（經 protocol.ts）。
 * 協議解析集中在 protocol.ts（fixture 測試覆蓋）；本檔做 BLE I/O 與轉動代數重建 facelet。
 *
 * MoYu 只在初始狀態封包帶一次 facelet，之後每步只回報轉動碼；本 driver 以 CubieCube
 * 代數重建每步後的 facelet，讓事件行為與 GAN driver 一致（每步 move + facelets）。
 */
export class MoyuDriver extends EventTarget implements SmartCube {
  readonly brand = 'moyu' as const;
  readonly deviceName: string;

  private readonly device: BluetoothDevice;
  private readonly chrctRead: BluetoothRemoteGATTCharacteristic;
  private readonly chrctWrite: BluetoothRemoteGATTCharacteristic;
  private readonly aes: Aes128;
  private readonly iv: number[];
  /** 本次連線實際使用的 MAC；供 app 記住以利穩定重連。 */
  readonly mac: string;
  /** 本次 MAC 的來源（診斷用）：app=macProvider 記住值 / name=名稱推導 / advertisement=廣播 / manual=手動。 */
  macSource: 'app' | 'name' | 'advertisement' | 'manual' | 'unknown' = 'unknown';
  private readonly onValueChanged: (e: Event) => void;
  private readonly onGattDisconnected: () => void;

  private cubie = new CubieCube();
  private prevMoveCnt = -1;
  private cubeTime = 0; // 方塊內部累積時鐘（ms），供 SPEC 3.4 時間校正使用
  private closed = false;

  constructor(
    device: BluetoothDevice,
    chrctRead: BluetoothRemoteGATTCharacteristic,
    chrctWrite: BluetoothRemoteGATTCharacteristic,
    deviceName: string,
    mac: string,
  ) {
    super();
    this.device = device;
    this.chrctRead = chrctRead;
    this.chrctWrite = chrctWrite;
    this.deviceName = deviceName;
    this.mac = mac;
    const { key, iv } = deriveKeyIv(mac);
    this.aes = new Aes128(key);
    this.iv = iv;

    this.onValueChanged = (e) => this.handleNotification(e);
    this.onGattDisconnected = () => {
      if (this.closed) return;
      this.closed = true;
      this.emit({ type: 'disconnected' });
    };
    this.chrctRead.addEventListener('characteristicvaluechanged', this.onValueChanged);
    this.device.addEventListener('gattserverdisconnected', this.onGattDisconnected);

    setTimeout(() => this.emit({ type: 'connected' }), 0);
  }

  private emit(event: CubeEvent): void {
    this.dispatchEvent(new CustomEvent<CubeEvent>(event.type, { detail: event }));
  }

  private handleNotification(event: Event): void {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    const raw: number[] = [];
    for (let i = 0; i < value.byteLength; i++) raw[i] = value.getUint8(i);
    const decoded = decode(raw, this.aes, this.iv);
    recordPacket('moyu', raw, decoded); // dev-only 擷取（預設 no-op）

    switch (messageType(decoded)) {
      case OPCODE_STATE: {
        const { facelets, moveCnt } = parseState(decoded);
        // 僅以第一個狀態封包當作基準（與 csTimer 一致，避免延遲封包擾亂計數）。
        // 基準後以 driver 重建為權威（SPEC §5 ADR 2026-07-13）：方塊自身的追蹤器
        // 不知道 resetToSolved()，重置後自報狀態會與重建狀態打架；正常操作下
        // 兩者逐步一致（moyu-real fixture 交叉驗證）。
        if (this.prevMoveCnt === -1) {
          this.cubie.fromFacelet(facelets);
          this.prevMoveCnt = moveCnt;
          this.emit({ type: 'facelets', facelets });
        } else {
          this.emit({ type: 'facelets', facelets: this.cubie.toFaceCube() });
        }
        break;
      }
      case OPCODE_BATTERY:
        this.emit({ type: 'battery', level: parseBattery(decoded) });
        break;
      case OPCODE_MOVE:
        this.handleMovePacket(decoded);
        break;
      case OPCODE_INFO:
      default:
        // 161 硬體資訊與其他型別無對應統一事件，忽略。
        break;
    }
  }

  private handleMovePacket(decoded: number[]): void {
    if (this.prevMoveCnt === -1) return; // 尚無基準（等初始狀態封包）
    const { moveCnt, moves } = parseMovePacket(decoded);
    let moveDiff = (moveCnt - this.prevMoveCnt) & 0xff;
    if (moveDiff === 0) return;
    if (moveDiff > moves.length) moveDiff = moves.length;
    // 任一將套用的 move 非法 → 整包放棄（與 csTimer 一致，避免狀態錯亂）。
    for (let i = moveDiff - 1; i >= 0; i--) {
      if (!moves[i]!.valid) return;
    }
    const host = performance.now();
    // 由舊到新套用（index moveDiff-1 為最舊、0 為最新）。
    for (let i = moveDiff - 1; i >= 0; i--) {
      const mv = moves[i]!;
      this.cubeTime += mv.timeOff;
      const next = new CubieCube();
      CubieCube.cubeMult(this.cubie, moveCube[mv.moveIndex]!, next);
      this.cubie = next;
      this.emit({ type: 'move', move: mv.move, cubeTimestamp: this.cubeTime, hostTimestamp: host });
      this.emit({ type: 'facelets', facelets: this.cubie.toFaceCube() });
    }
    this.prevMoveCnt = moveCnt;
  }

  private async sendRequest(opcode: number): Promise<void> {
    const enc = encode(buildRequest(opcode), this.aes, this.iv);
    await this.chrctWrite.writeValue(new Uint8Array(enc).buffer);
  }

  /** 主動要求方塊回報 facelets（opcode 163）。 */
  async requestState(): Promise<void> {
    await this.sendRequest(OPCODE_STATE);
  }

  /** 主動要求電量（opcode 164）。 */
  async requestBattery(): Promise<void> {
    await this.sendRequest(OPCODE_BATTERY);
  }

  /**
   * 重置為復原（六面）。MoYu 無原生重置指令，driver 以轉動代數重建狀態，
   * 故把內部 cubie 歸零為復原、投遞復原 facelets；請在方塊「實體已復原」時按。
   */
  async resetToSolved(): Promise<void> {
    this.cubie = new CubieCube();
    this.emit({ type: 'facelets', facelets: this.cubie.toFaceCube() });
    return Promise.resolve();
  }

  async disconnect(): Promise<void> {
    this.closed = true;
    this.chrctRead.removeEventListener('characteristicvaluechanged', this.onValueChanged);
    this.device.removeEventListener('gattserverdisconnected', this.onGattDisconnected);
    try {
      await this.chrctRead.stopNotifications();
    } catch {
      /* 已斷線時忽略 */
    }
    this.device.gatt?.disconnect();
    this.emit({ type: 'disconnected' });
  }
}

/** 從廣播 manufacturer data 讀取 MoYu 硬體 MAC（best-effort，逾時回 null）。 */
async function readMacFromAdvertisement(device: BluetoothDevice): Promise<string | null> {
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
      for (const cic of MOYU_CIC_LIST) {
        const dv = e.manufacturerData.get(cic);
        if (dv && dv.byteLength >= 6) {
          const parts: string[] = [];
          // MoYu 廣播 MAC 為反序（由末端往前）。
          for (let i = 0; i < 6; i++) {
            parts.push((dv.getUint8(dv.byteLength - i - 1) + 0x100).toString(16).slice(1));
          }
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
 * 連線 MoYu 智能方塊：跳出僅含 MoYu filters 的藍牙選擇視窗，連線後回傳 MoyuDriver。
 * 統一選擇視窗（SPEC 3.1）請用 `connectSmartCube()`；本函式為 MoYu 專用入口（可 tree-shake）。
 */
export async function connectMoyuCube(options: ConnectOptions = {}): Promise<MoyuDriver> {
  const device = await navigator.bluetooth.requestDevice({
    filters: MOYU_NAME_PREFIXES.map((namePrefix) => ({ namePrefix })),
    optionalServices: [MOYU_SERVICE_UUID],
  });
  return connectMoyuDevice(device, options);
}

/** 對「已選好的裝置」建立 MoYu 連線（統一選擇視窗 connectSmartCube 的分派目標）。 */
export async function connectMoyuDevice(
  device: BluetoothDevice,
  options: ConnectOptions = {},
): Promise<MoyuDriver> {
  const deviceName = (device.name ?? '').trim();

  // MAC 為金鑰推導必需（SPEC §7）。
  // ⚠️ 名稱推導必須**優先於廣播**（決策層 2026-07-13 複查定案）：
  //    名稱推導值（固定前綴 CF:30:16:…，csTimer 同式）已由實機 fixture 證實可解密；
  //    統一選擇視窗宣告三家 CIC 後廣播路徑首次啟用，實機回報其解析值導致金鑰錯 →
  //    連上卻零事件（可能解析到非 MAC 的 manufacturer data 封包；csTimer 雖廣播優先，
  //    但其失敗時有 wrong-key 重問機制，我們沒有）。QiYi 相反：金鑰固定、hello 需
  //    真實 MAC、名稱推導不可靠，故 QiYi 維持廣播優先。
  // 順序：macProvider 記住值 → 名稱推導 → 廣播（名稱無法推導時的兜底）→ macProvider 手動。
  let source: MoyuDriver['macSource'] = 'unknown';
  let mac = (options.macProvider && (await options.macProvider(device, false))) || null;
  if (mac) source = 'app';
  if (!mac) {
    mac = defaultMacFromName(deviceName);
    if (mac) source = 'name';
  }
  if (!mac) {
    mac = await readMacFromAdvertisement(device);
    if (mac) source = 'advertisement';
  }
  if (!mac && options.macProvider) {
    mac = await options.macProvider(device, true);
    if (mac) source = 'manual';
  }
  if (!mac) throw new Error('MoYu 方塊需要 MAC address 推導金鑰，且無法自動取得');

  const gatt = await device.gatt!.connect();
  const service = await gatt.getPrimaryService(MOYU_SERVICE_UUID);
  const chrctRead = await service.getCharacteristic(MOYU_CHRCT_READ);
  const chrctWrite = await service.getCharacteristic(MOYU_CHRCT_WRITE);
  await chrctRead.startNotifications();

  const driver = new MoyuDriver(device, chrctRead, chrctWrite, deviceName, mac);
  driver.macSource = source;
  // 依序要求硬體資訊、初始狀態、電量（初始狀態封包提供 facelet 基準與 move 計數起點）。
  const { key, iv } = deriveKeyIv(mac);
  const aes = new Aes128(key);
  for (const opcode of [OPCODE_INFO, OPCODE_STATE, OPCODE_BATTERY]) {
    await chrctWrite.writeValue(new Uint8Array(encode(buildRequest(opcode), aes, iv)).buffer);
  }
  return driver;
}
