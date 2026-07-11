// Adapted from csTimer (https://github.com/cs0x7f/cstimer), Copyright Chen Shuang, GPL-3.0
// 移植自 csTimer `src/js/hardware/qiyicube.js`（QiYi AI 3x3 協議）。
// 交叉比對過 Flying-Toast/qiyi_smartcube_protocol 文件與 agolovchuk/qy-cube 實作。
// 只搬協議邏輯（封包格式、AES-ECB、CRC、facelet/move 解析、ACK），csTimer 的 UI/狀態管理不搬。
//
// 純函式集中在此，方便用 fixture 直接測試（SPEC §10.3.3 測試即驗收）；BLE I/O 在 QiyiDriver.ts。

import { Aes128 } from '../../utils/crypto.js';

const UUID_SUFFIX = '-0000-1000-8000-00805f9b34fb';
export const QIYI_SERVICE_UUID = '0000fff0' + UUID_SUFFIX;
export const QIYI_CHRCT_UUID = '0000fff6' + UUID_SUFFIX;
export const QIYI_NAME_PREFIXES = ['QY-QYSC', 'XMD-TornadoV4-i'];
export const QIYI_CIC_LIST = [0x0504];

// 固定 AES-128 金鑰（csTimer 以 LZString 壓縮存放，此為解壓後的 16 bytes）。
// QiYi 的金鑰不含 MAC——MAC 只用於 hello 封包內容，不參與加解密。
export const QIYI_KEY: readonly number[] = [
  87, 177, 249, 171, 205, 90, 232, 167, 156, 185, 140, 231, 87, 140, 81, 8,
];

const OPCODE_HELLO = 0x02;
const OPCODE_STATE = 0x03;

/** CRC-16/MODBUS（QiYi 封包完整性校驗）。 */
export function crc16modbus(data: readonly number[]): number {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x1) > 0 ? (crc >> 1) ^ 0xa001 : crc >> 1;
    }
  }
  return crc;
}

/** 以固定金鑰做 AES-128-ECB 逐塊加密（16-byte 對齊）。 */
export function encryptEcb(bytes: readonly number[], key: readonly number[] = QIYI_KEY): number[] {
  const aes = new Aes128(key);
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const block = bytes.slice(i, i + 16);
    aes.encrypt(block);
    for (let j = 0; j < 16; j++) out[i + j] = block[j]!;
  }
  return out;
}

/** 以固定金鑰做 AES-128-ECB 逐塊解密。 */
export function decryptEcb(bytes: readonly number[], key: readonly number[] = QIYI_KEY): number[] {
  const aes = new Aes128(key);
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const block = bytes.slice(i, i + 16);
    aes.decrypt(block);
    for (let j = 0; j < 16; j++) out[i + j] = block[j]!;
  }
  return out;
}

/**
 * 把訊息內容（含 opcode）包成完整封包並加密：
 * [0xfe, length, ...content, crcLo, crcHi] → zero-pad 到 16 倍數 → AES-ECB。
 */
export function buildMessage(content: readonly number[], key: readonly number[] = QIYI_KEY): number[] {
  const msg = [0xfe, 4 + content.length, ...content];
  const crc = crc16modbus(msg);
  msg.push(crc & 0xff, crc >> 8);
  const npad = (16 - (msg.length % 16)) % 16;
  for (let i = 0; i < npad; i++) msg.push(0);
  return encryptEcb(msg, key);
}

/**
 * 建立 hello 封包（連線後必須送出，否則方塊不回報狀態）。
 * 內容尾端附上反序的 6-byte MAC。
 */
export function buildHello(mac: string, key: readonly number[] = QIYI_KEY): number[] {
  const content = [0x00, 0x6b, 0x01, 0x00, 0x00, 0x22, 0x06, 0x00, 0x02, 0x08, 0x00];
  for (let i = 5; i >= 0; i--) content.push(parseInt(mac.slice(i * 3, i * 3 + 2), 16));
  return buildMessage(content, key);
}

/**
 * 解密收到的通知並做 CRC 驗證，回傳有效的明文訊息（已裁到 msg[1] 長度）；
 * 非法（CRC 錯、長度不足）回傳 null。
 */
export function decodeNotification(
  enc: readonly number[],
  key: readonly number[] = QIYI_KEY,
): number[] | null {
  let msg = decryptEcb(enc, key);
  msg = msg.slice(0, msg[1]);
  if (msg.length < 3 || crc16modbus(msg) !== 0) return null;
  return msg;
}

/** 27 bytes（54 個 nibble）→ 54 字元 facelet（Kociemba URFDLB）。 */
export function parseFacelet(faceMsg: readonly number[]): string {
  const ret: string[] = [];
  for (let i = 0; i < 54; i++) {
    ret.push('LRDUFB'.charAt(((faceMsg[i >> 1]! >> ((i % 2) << 2)) & 0xf) as number));
  }
  return ret.join('');
}

/** QiYi 轉動碼（1–12）→ WCA 表記；未知碼回傳 null。 */
export function qiyiMoveToWca(code: number): string | null {
  if (code < 1 || code > 12) return null;
  const axis = [4, 1, 3, 0, 2, 5][(code - 1) >> 1]!;
  const suffix = code & 1 ? "'" : '';
  return 'URFDLB'.charAt(axis) + suffix;
}

// 解析結果的事件（hostTimestamp 由 driver 於投遞當下補上）。
export type ParsedQiyiEvent =
  | { type: 'move'; move: string; cubeTimestamp: number }
  | { type: 'facelets'; facelets: string }
  | { type: 'battery'; level: number };

export interface ParsedQiyiData {
  events: ParsedQiyiEvent[];
  // 需回送給方塊的 ACK 內容（未加密，driver 以 buildMessage 包裝送出）。漏送會被斷線。
  ack: number[] | null;
  // 更新後的 lastTs（供下一包判斷歷史 move 是否已回報過）。
  lastTs: number;
}

/**
 * 解析已驗證的明文訊息，產出統一事件 + ACK 內容。
 *
 * - opcode 0x02（hello）：facelets + battery。
 * - opcode 0x03（state change）：本次與尚未回報過的歷史 move（由舊到新）+ facelets(+battery)。
 *
 * QiYi 每包都直接帶 facelet，故不需 CubieCube 重建；歷史 move 用於補 BLE 漏包。
 */
export function parseCubeData(
  msg: readonly number[],
  lastTs: number,
  prevBattery: number,
): ParsedQiyiData {
  const events: ParsedQiyiEvent[] = [];
  if (msg[0] !== 0xfe) return { events, ack: null, lastTs };

  const opcode = msg[2]!;
  const ts = (msg[3]! << 24) | (msg[4]! << 16) | (msg[5]! << 8) | msg[6]!;
  const ack = msg.slice(2, 7);

  if (opcode === OPCODE_HELLO) {
    events.push({ type: 'facelets', facelets: parseFacelet(msg.slice(7, 34)) });
    events.push({ type: 'battery', level: msg[35]! });
    return { events, ack, lastTs: ts };
  }

  if (opcode === OPCODE_STATE) {
    // 收集本次 move（msg[34]）與較 lastTs 新的歷史 move。
    const todo: Array<[number, number]> = [[msg[34]!, ts]];
    while (todo.length < 10) {
      const off = 91 - 5 * todo.length;
      const hisTs = (msg[off]! << 24) | (msg[off + 1]! << 16) | (msg[off + 2]! << 8) | msg[off + 3]!;
      const hisMv = msg[off + 4]!;
      if (hisTs <= lastTs) break;
      todo.push([hisMv, hisTs]);
    }
    // 由舊到新投遞。
    for (let i = todo.length - 1; i >= 0; i--) {
      const move = qiyiMoveToWca(todo[i]![0]);
      if (move !== null) {
        events.push({ type: 'move', move, cubeTimestamp: Math.trunc(todo[i]![1] / 1.6) });
      }
    }
    events.push({ type: 'facelets', facelets: parseFacelet(msg.slice(7, 34)) });
    const battery = msg[35]!;
    if (battery !== prevBattery) events.push({ type: 'battery', level: battery });
    return { events, ack, lastTs: ts };
  }

  return { events, ack: null, lastTs };
}

/** 由 QiYi 裝置名稱推導預設 MAC（csTimer 的名稱規則）；無法推導回傳 null。 */
export function defaultMacFromName(deviceName: string): string | null {
  if (/^(QY-QYSC|XMD-TornadoV4-i)-.-[0-9A-F]{4}$/.exec(deviceName)) {
    return 'CC:A3:00:00:' + deviceName.slice(-4, -2) + ':' + deviceName.slice(-2);
  }
  return null;
}
