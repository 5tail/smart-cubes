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
  OPCODE_GYRO,
  deriveKeyIv,
  decode,
  encode,
  buildRequest,
  buildGyroControl,
  messageType,
  parseState,
  parseBattery,
  parseMovePacket,
  parseGyroQuaternion,
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
  /**
   * 本次連線實際使用的寫入模式（診斷用；探測期由 fallback 鏈定案，見 connectMoyuDevice；
   * 同 macSource 為可變診斷欄位 —— init 寫入丟例外時會就地改用 with-response 續行）。
   */
  writeMode: MoyuWriteMode;
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
    writeMode?: MoyuWriteMode,
  ) {
    super();
    this.device = device;
    this.chrctRead = chrctRead;
    this.chrctWrite = chrctWrite;
    this.deviceName = deviceName;
    this.mac = mac;
    this.writeMode = writeMode ?? preferredWriteMode(chrctWrite);
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
      case OPCODE_GYRO:
        // 高頻姿態封包（連線時 driver 已送 0xAC 開啟指令）；只透傳，消費在 demo（同 GAN/QiYi）。
        this.emit({ type: 'gyro', quaternion: parseGyroQuaternion(decoded) });
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
    await writeCommand(this.chrctWrite, encode(buildRequest(opcode), this.aes, this.iv), this.writeMode);
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

const MOYU_VALID_TYPES = new Set([OPCODE_INFO, OPCODE_STATE, OPCODE_BATTERY, OPCODE_MOVE, OPCODE_GYRO]);

/**
 * MoYu 寫入模式。兩個方向都有實機前科：Android 平板需要 without-response 才不沉默
 * （2026-07-16，commit 67db315），筆電（桌機藍牙堆疊）則相反 —— without-response 疑似被
 * 靜默丟包、with-response（桌機時代的 writeValue）才通（2026-07-19 實機回報「平板正常、
 * 筆電連上無訊號」）。故探測期以 fallback 鏈定案，連線全程沿用勝出的模式。
 */
export type MoyuWriteMode = 'withoutResponse' | 'withResponse';

/** 平台偏好的寫入模式：特徵值宣告支援且 API 存在 → without-response（平板實證），否則 with-response。 */
function preferredWriteMode(chrct: BluetoothRemoteGATTCharacteristic): MoyuWriteMode {
  const c = chrct as BluetoothRemoteGATTCharacteristic & {
    writeValueWithoutResponse?: (b: BufferSource) => Promise<void>;
  };
  return chrct.properties?.writeWithoutResponse && typeof c.writeValueWithoutResponse === 'function'
    ? 'withoutResponse'
    : 'withResponse';
}

/** 對 MoYu 以指定模式寫入指令（模式選擇見 MoyuWriteMode 說明）。 */
async function writeCommand(
  chrct: BluetoothRemoteGATTCharacteristic,
  bytes: readonly number[],
  mode: MoyuWriteMode,
): Promise<void> {
  const buf = new Uint8Array(bytes).buffer;
  const c = chrct as BluetoothRemoteGATTCharacteristic & {
    writeValueWithoutResponse?: (b: BufferSource) => Promise<void>;
  };
  if (mode === 'withoutResponse' && typeof c.writeValueWithoutResponse === 'function') {
    await c.writeValueWithoutResponse(buf);
  } else {
    await chrct.writeValue(buf);
  }
}

/**
 * 用候選 MAC 推導的金鑰探測是否正確：送一個 STATE 請求（以該金鑰加密），
 * 在 timeout 內若收到「解密後訊息型別合法」的通知即判定金鑰正確。
 * 錯金鑰 → 方塊收不懂請求（不回）或回的封包解出垃圾型別 → 逾時回 false。
 */
async function probeMoyuKey(
  chrctRead: BluetoothRemoteGATTCharacteristic,
  chrctWrite: BluetoothRemoteGATTCharacteristic,
  mac: string,
  writeMode: MoyuWriteMode,
  timeoutMs: number,
): Promise<boolean> {
  const { key, iv } = deriveKeyIv(mac);
  const aes = new Aes128(key);
  return new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (ok: boolean): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrctRead.removeEventListener('characteristicvaluechanged', onValue);
      resolve(ok);
    };
    const onValue = (e: Event): void => {
      const value = (e.target as BluetoothRemoteGATTCharacteristic).value;
      if (!value) return;
      const raw: number[] = [];
      for (let i = 0; i < value.byteLength; i++) raw[i] = value.getUint8(i);
      const decoded = decode(raw, aes, iv);
      recordPacket('moyu', raw, decoded); // 探測期的回應也進擷取緩衝（金鑰逆向素材）
      if (MOYU_VALID_TYPES.has(messageType(decoded))) finish(true);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    chrctRead.addEventListener('characteristicvaluechanged', onValue);
    // 照實機驗收過的握手順序：先 INFO 再 STATE（部分韌體可能要求先收到 INFO 才回話）。
    // 寫入丟例外 = 此寫入模式在本平台根本不可用 → 立即判失敗（不白等 timeout），
    // 讓 fallback 鏈馬上換下一種模式（舊版把例外靜默吞掉，會誤判成「方塊沒回話」）。
    void (async () => {
      await writeCommand(chrctWrite, encode(buildRequest(OPCODE_INFO), aes, iv), writeMode);
      await writeCommand(chrctWrite, encode(buildRequest(OPCODE_STATE), aes, iv), writeMode);
    })().catch(() => finish(false));
  });
}

/**
 * 對「已選好的裝置」建立 MoYu 連線（統一選擇視窗 connectSmartCube 的分派目標）。
 *
 * MAC → 金鑰不再靠「名稱 vs 廣播誰優先」猜：連上後對每個候選 MAC 逐一探測，
 * 用「能解出合法封包」的那組（csTimer isWrongKey 精神，自我修正）。候選順序：
 * macProvider 記住值 → 名稱推導 → 廣播（**不含手動輸入**：魔域使用者無從得知 MAC）。
 *
 * 寫入模式 fallback 鏈（QiYi hello 驗證鏈同精神）：先以平台偏好模式（without-response）
 * 探測全候選；全滅時改用 with-response 重探一輪 —— 部分桌機藍牙堆疊會靜默丟棄
 * without-response 寫入（「平板正常、筆電連上無訊號」，2026-07-19 實機回報；
 * 正是 67db315「桌機能動、平板全滅」的鏡像）。哪種模式有回話，整條連線沿用該模式。
 *
 * 兩輪探測都沒通過但至少有候選 → 用最可能的（名稱推導優先）直接連上，不跳輸入框，
 * 交由畫面看門狗判斷是否真的沒串流。完全無候選 MAC → disconnect 釋放 GATT 再拋錯。
 *
 * @param probeTimeoutMs 每個候選金鑰的探測逾時（測試可縮短）。
 */
export async function connectMoyuDevice(
  device: BluetoothDevice,
  options: ConnectOptions = {},
  probeTimeoutMs = 900,
): Promise<MoyuDriver> {
  const deviceName = (device.name ?? '').trim();

  // 錯誤標明失敗階段（2026-07-20 筆電實機回報「零封包 + 連線中途拋例外」，遠端只能靠
  // log 裡的錯誤文字定位炸點 —— 各平台藍牙堆疊在不同階段失敗的訊息原文常常難以區分）。
  const stage = async <T>(label: string, run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (err) {
      throw new Error(`MoYu 連線失敗於「${label}」：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const gatt = await stage('連線 GATT', () => device.gatt!.connect());
  try {
    const service = await stage('找服務', () => gatt.getPrimaryService(MOYU_SERVICE_UUID));
    const chrctRead = await stage('找讀特徵值', () => service.getCharacteristic(MOYU_CHRCT_READ));
    const chrctWrite = await stage('找寫特徵值', () => service.getCharacteristic(MOYU_CHRCT_WRITE));
    await stage('開啟通知', () => chrctRead.startNotifications());

    // 候選 MAC（**不含手動輸入**：魔域金鑰用推導 MAC，使用者無從得知真 MAC，跳輸入框只會困惑）。
    const specs: Array<{ source: MoyuDriver['macSource']; get: () => Promise<string | null> }> = [
      { source: 'app', get: async () => (options.macProvider ? options.macProvider(device, false) : null) },
      { source: 'name', get: async () => defaultMacFromName(deviceName) },
      { source: 'advertisement', get: async () => readMacFromAdvertisement(device) },
    ];

    let writeMode = preferredWriteMode(chrctWrite);
    const resolved: Array<{ mac: string; source: MoyuDriver['macSource'] }> = [];
    let chosen: { mac: string; source: MoyuDriver['macSource'] } | null = null;
    for (const s of specs) {
      const mac = await s.get();
      if (!mac) continue;
      resolved.push({ mac, source: s.source });
      if (await probeMoyuKey(chrctRead, chrctWrite, mac, writeMode, probeTimeoutMs)) {
        chosen = { mac, source: s.source };
        break;
      }
    }
    // 第二輪：候選全滅且第一輪走 without-response → 改 with-response 重探（桌機丟包嫌疑）。
    // 第一輪全滅時 specs 已全數 resolve，直接重用 resolved（避免廣播再等一次 3 秒）。
    if (!chosen && writeMode === 'withoutResponse') {
      for (const r of resolved) {
        if (await probeMoyuKey(chrctRead, chrctWrite, r.mac, 'withResponse', probeTimeoutMs)) {
          chosen = r;
          writeMode = 'withResponse';
          break;
        }
      }
    }
    if (!chosen) {
      if (resolved.length === 0) {
        throw new Error('MoYu 方塊需要 MAC 推導金鑰，但名稱推導與廣播都無法取得。');
      }
      // 探測都沒通過：**不跳輸入框**，改用最可能的候選（名稱推導優先）直接連上；
      // 若真的沒串流，畫面看門狗會 6 秒後報出並斷線 —— 那代表此韌體金鑰算法尚未支援（需錄封包逆向）。
      chosen = resolved.find((r) => r.source === 'name') ?? resolved[0]!;
      writeMode = preferredWriteMode(chrctWrite); // 盲連時回到平台偏好模式（現行行為不變）
    }

    const driver = new MoyuDriver(device, chrctRead, chrctWrite, deviceName, chosen.mac, writeMode);
    driver.macSource = chosen.source;
    // init 寫入：without-response 丟例外 = 本平台此模式不可用 → 就地改 with-response 重寫這筆並沿用。
    const initWrite = async (bytes: readonly number[]): Promise<void> => {
      try {
        await writeCommand(chrctWrite, bytes, driver.writeMode);
      } catch (err) {
        if (driver.writeMode !== 'withoutResponse') throw err;
        driver.writeMode = 'withResponse';
        await writeCommand(chrctWrite, bytes, 'withResponse');
      }
    };
    // 依序要求硬體資訊、初始狀態、電量（初始狀態封包提供 facelet 基準與 move 計數起點）。
    const { key, iv } = deriveKeyIv(chosen.mac);
    const aes = new Aes128(key);
    await stage('初始化請求', async () => {
      for (const opcode of [OPCODE_INFO, OPCODE_STATE, OPCODE_BATTERY]) {
        await initWrite(encode(buildRequest(opcode), aes, iv));
      }
      // 開啟陀螺儀串流（opcode 172）：方塊預設不送 gyro，須主動開啟。放在三個請求之後，
      // 即使個別韌體不認得此指令，state/battery 已請求完畢、基本功能不受影響。
      await initWrite(encode(buildGyroControl(true), aes, iv));
    });
    return driver;
  } catch (err) {
    // 任何中途失敗都釋放 GATT：BLE 裝置連線中不廣播，死連線會讓方塊之後「完全連不到」
    //（2026-07-13 看門狗層修過的同款病，這裡補上連線流程自身的釋放）。
    try {
      gatt.disconnect();
    } catch {
      /* ignore */
    }
    throw err;
  }
}
