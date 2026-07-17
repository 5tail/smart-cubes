import { describe, it, expect, vi } from 'vitest';
import {
  buildMessage,
  buildSyncState,
  decryptEcb,
  crc16modbus,
  encodeFacelet,
  parseFacelet,
  parseCubeData,
} from '../src/drivers/qiyi/protocol.js';
import { QiyiDriver } from '../src/drivers/qiyi/QiyiDriver.js';
import { SOLVED_FACELET } from '../src/utils/facelets.js';
import type { CubeEvent } from '../src/core/types.js';
import packets from './fixtures/qiyi-packets.json' with { type: 'json' };

// QiYi 狀態覆寫（opcode 0x04，resetToSolved）fixture 測試（SPEC §10.3.3 測試即驗收）。
//
// csTimer 未實作；由 Flying-Toast qiyi_smartcube_protocol 文件記載，三個獨立來源交叉驗證：
// huizhiLLL/DCTimer-BLE（SYNC_STATE_PREFIX + 2-byte 尾墊）、maggnus/CubeZX3（官方 app
// 實機抓包「FE 26 04 …」與復原態 27-byte hex）、KittatamSaisaard/qiyi_smartcube_protocol_web。

// CubeZX3 實機抓包文件記載的「復原態」27-byte facelet 編碼（外部行為錨）。
const SOLVED_NIBBLES = [
  0x33, 0x33, 0x33, 0x33, 0x13, 0x11, 0x11, 0x11, 0x11, 0x44, 0x44, 0x44, 0x44, 0x24,
  0x22, 0x22, 0x22, 0x22, 0x00, 0x00, 0x00, 0x00, 0x50, 0x55, 0x55, 0x55, 0x55,
];

describe('encodeFacelet（parseFacelet 的逆）', () => {
  it('復原態編碼 = CubeZX3 實機抓包記載的 27 bytes', () => {
    expect(encodeFacelet(SOLVED_FACELET)).toEqual(SOLVED_NIBBLES);
  });

  it('與 parseFacelet 互為逆函數（復原態 + 實機打亂態）', () => {
    expect(parseFacelet(encodeFacelet(SOLVED_FACELET))).toBe(SOLVED_FACELET);
    const scrambled = packets.hello.expect.facelets; // 實機 fixture 的非復原狀態
    expect(parseFacelet(encodeFacelet(scrambled))).toBe(scrambled);
  });
});

describe('buildSyncState（opcode 0x04 狀態覆寫封包）', () => {
  it('解密後 framing 與官方 app 抓包一致：FE 26 04 + 前綴 + facelet + CRC', () => {
    const enc = buildSyncState(SOLVED_FACELET);
    expect(enc.length % 16).toBe(0); // AES-ECB 對齊
    const msg = decryptEcb(enc);
    expect(msg[0]).toBe(0xfe);
    expect(msg[1]).toBe(0x26); // len=38 —— CubeZX3 抓包的「FE 26 04」重置封包
    expect(msg[2]).toBe(0x04);
    expect(msg.slice(3, 7)).toEqual([0x17, 0x88, 0x8b, 0x31]); // 各實作共用的固定前綴
    expect(msg.slice(7, 34)).toEqual(SOLVED_NIBBLES);
    expect(msg.slice(34, 36)).toEqual([0x00, 0x00]); // DCTimer-BLE 的 2-byte 尾墊
    expect(crc16modbus(msg.slice(0, msg[1]!))).toBe(0); // CRC 自洽（含 CRC bytes 驗證為 0）
  });
});

describe('parseCubeData：方塊的 0x04 覆寫確認包', () => {
  // 方塊回應與 hello/state 同 framing：[0xfe, len, 0x04, ts:4B, facelet:27B, …]。
  const ts = 0x00000064; // 覆寫後方塊內部計數重新起算
  const content = [0x04, 0x00, 0x00, 0x00, 0x64, ...encodeFacelet(SOLVED_FACELET)];

  it('投遞覆寫後的 facelets、不需 ACK、lastTs 重設為本包 ts', () => {
    const msg = decryptEcb(buildMessage(content)).slice(0, 4 + content.length);
    const { events, ack, lastTs } = parseCubeData(msg, 99999, -1);
    expect(events).toContainEqual({ type: 'facelets', facelets: SOLVED_FACELET });
    expect(ack).toBeNull(); // DCTimer-BLE：0x04 不回 ACK（僅 0x02/0x03 需要）
    expect(lastTs).toBe(ts); // 舊 lastTs（99999）被覆蓋，避免誤補投歷史 move
  });
});

// --- driver 層：resetToSolved 真的送出覆寫指令、收到確認包畫面更新 ---

class MockChrct extends EventTarget {
  value: DataView | null = null;
  writeValue = vi.fn((_bytes: BufferSource) => Promise.resolve());
  stopNotifications = vi.fn(() => Promise.resolve(this));
  notify(bytes: number[]): void {
    this.value = new DataView(new Uint8Array(bytes).buffer);
    this.dispatchEvent(new Event('characteristicvaluechanged'));
  }
}
class MockDevice extends EventTarget {
  gatt = { disconnect: vi.fn() };
}

describe('QiyiDriver.resetToSolved', () => {
  function makeDriver(): { driver: QiyiDriver; chrct: MockChrct; events: CubeEvent[] } {
    const chrct = new MockChrct();
    const driver = new QiyiDriver(
      new MockDevice() as unknown as BluetoothDevice,
      chrct as unknown as BluetoothRemoteGATTCharacteristic,
      'QY-QYSC-A-1234',
      'CC:A3:00:00:12:34',
    );
    const events: CubeEvent[] = [];
    for (const t of ['facelets', 'battery'] as const) {
      driver.addEventListener(t, (e) => events.push((e as CustomEvent<CubeEvent>).detail));
    }
    return { driver, chrct, events };
  }

  it('送出 0x04 覆寫封包（非舊的 hello 重同步）', async () => {
    const { driver, chrct } = makeDriver();
    await driver.resetToSolved();
    expect(chrct.writeValue).toHaveBeenCalledTimes(1);
    const written = Array.from(new Uint8Array(chrct.writeValue.mock.calls[0]![0] as ArrayBuffer));
    const msg = decryptEcb(written);
    expect(msg[2]).toBe(0x04); // 覆寫指令（舊做法送 hello 的 msg[2] 是 0x00 開頭內容）
    expect(msg.slice(7, 34)).toEqual(SOLVED_NIBBLES);
  });

  it('收到方塊 0x04 確認包 → 投遞復原 facelets 且不回 ACK', () => {
    const { chrct, events } = makeDriver();
    const response = buildMessage([0x04, 0, 0, 0, 0x64, ...encodeFacelet(SOLVED_FACELET)]);
    chrct.notify(response);
    expect(events).toContainEqual({ type: 'facelets', facelets: SOLVED_FACELET });
    expect(chrct.writeValue).not.toHaveBeenCalled(); // 0x04 不需 ACK
  });
});
