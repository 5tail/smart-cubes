import { describe, it, expect } from 'vitest';
import {
  crc16modbus,
  buildMessage,
  buildHello,
  decodeNotification,
  parseFacelet,
  qiyiMoveToWca,
  parseCubeData,
  defaultMacFromName,
  QIYI_KEY,
} from '../src/drivers/qiyi/protocol.js';
import { SOLVED_FACELET } from '../src/utils/facelets.js';
import oracle from './fixtures/cstimer-oracle.json' with { type: 'json' };
import packets from './fixtures/qiyi-packets.json' with { type: 'json' };

// 期望值皆由 csTimer `qiyicube.js` 的邏輯在 Node 直接產生（同源 oracle）：
// - cstimer-oracle.json：CRC、facelet 解析、轉動碼對應。
// - qiyi-packets.json：以 csTimer 的 crc+AES 產生的完整加密封包 + 期望解析結果。

describe('QiYi protocol — 基本元件', () => {
  it('crc16modbus 符合 csTimer', () => {
    for (const { data, crc } of oracle.crc) {
      expect(crc16modbus(data)).toBe(crc);
    }
  });

  it('parseFacelet 對任意 27 bytes 符合 csTimer', () => {
    expect(parseFacelet(oracle.qiyiFacelet.bytes)).toBe(oracle.qiyiFacelet.out);
  });

  it('parseFacelet 對 solved 狀態產生 SOLVED_FACELET', () => {
    expect(parseFacelet(oracle.qiyiFaceletSolved.bytes)).toBe(SOLVED_FACELET);
    expect(oracle.qiyiFaceletSolved.out).toBe(SOLVED_FACELET);
  });

  it('轉動碼 1–12 → WCA 表記符合 csTimer', () => {
    for (const [code, { wca }] of Object.entries(oracle.qiyiMoves)) {
      expect(qiyiMoveToWca(Number(code))).toBe(wca);
    }
    expect(qiyiMoveToWca(0)).toBeNull();
    expect(qiyiMoveToWca(13)).toBeNull();
  });

  it('buildMessage：CRC 正確且 16-byte 對齊，可自我 decode', () => {
    const enc = buildMessage([0x02, 0x00, 0x00, 0x06, 0x40]);
    expect(enc.length % 16).toBe(0);
    const msg = decodeNotification(enc);
    expect(msg).not.toBeNull();
    expect(msg![2]).toBe(0x02);
  });

  it('decodeNotification 對壞封包回傳 null', () => {
    const enc = buildMessage([0x03, 1, 2, 3, 4]);
    enc[0] = (enc[0]! ^ 0xff) & 0xff; // 破壞密文 → CRC 失敗
    expect(decodeNotification(enc)).toBeNull();
  });
});

describe('QiYi protocol — 完整封包（csTimer oracle）', () => {
  it('hello 封包：解密→解析出 facelets + battery，並回正確 ACK', () => {
    const msg = decodeNotification(packets.hello.enc, QIYI_KEY);
    expect(msg).not.toBeNull();
    const { events, ack, lastTs } = parseCubeData(msg!, 0, -1);
    expect(events).toContainEqual({ type: 'facelets', facelets: packets.hello.expect.facelets });
    expect(events).toContainEqual({ type: 'battery', level: packets.hello.expect.battery });
    expect(ack).toEqual(packets.helloAck);
    expect(lastTs).toBe(1600);
  });

  it('state 封包：解出 move + facelets + battery，ACK 正確，lastTs 更新', () => {
    const msg = decodeNotification(packets.state.enc, QIYI_KEY);
    expect(msg).not.toBeNull();
    const { events, ack, lastTs } = parseCubeData(
      msg!,
      packets.state.lastTs,
      packets.state.prevBattery,
    );
    expect(events[0]).toEqual({
      type: 'move',
      move: packets.state.expect.move,
      cubeTimestamp: packets.state.expect.moveCubeTs,
    });
    expect(events).toContainEqual({ type: 'facelets', facelets: packets.state.expect.facelets });
    expect(events).toContainEqual({ type: 'battery', level: packets.state.expect.battery });
    expect(ack).toEqual(packets.stateAck);
    expect(lastTs).toBe(packets.state.expect.newLastTs);
  });

  it('state 封包：battery 未變時不重複投遞 battery 事件', () => {
    const msg = decodeNotification(packets.state.enc, QIYI_KEY);
    const { events } = parseCubeData(msg!, 0, packets.state.expect.battery);
    expect(events.some((e) => e.type === 'battery')).toBe(false);
  });

  it('buildHello 產生 16-byte 對齊、可 decode 的封包', () => {
    const enc = buildHello('CC:A3:00:00:12:34');
    expect(enc.length % 16).toBe(0);
    expect(decodeNotification(enc)).not.toBeNull();
  });
});

describe('QiYi protocol — MAC 推導', () => {
  it('由裝置名稱推導預設 MAC', () => {
    expect(defaultMacFromName('QY-QYSC-A-1234')).toBe('CC:A3:00:00:12:34');
    expect(defaultMacFromName('SomethingElse')).toBeNull();
  });
});
