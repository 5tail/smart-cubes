import { describe, it, expect } from 'vitest';
import {
  deriveKeyIv,
  decode,
  encode,
  parseFacelet,
  parseState,
  parseBattery,
  parseMovePacket,
  messageType,
  buildRequest,
  defaultMacFromName,
} from '../src/drivers/moyu/protocol.js';
import { Aes128 } from '../src/utils/crypto.js';
import { SOLVED_FACELET } from '../src/utils/facelets.js';
import oracle from './fixtures/cstimer-oracle.json' with { type: 'json' };
import packets from './fixtures/moyu-packets.json' with { type: 'json' };

// 期望值皆由 csTimer `moyu32cube.js` 的邏輯在 Node 產生（同源 oracle）：
// - cstimer-oracle.json：金鑰/IV 推導、decode 往返、bit facelet 解析。
// - moyu-packets.json：以 csTimer 的 coder 產生的加密 state/battery/move 封包 + 期望解析。

describe('MoYu protocol — 加解密', () => {
  it('金鑰/IV 由 MAC 推導符合 csTimer', () => {
    const { key, iv } = deriveKeyIv(oracle.moyuKeyIv.mac);
    expect(key).toEqual(oracle.moyuKeyIv.key);
    expect(iv).toEqual(oracle.moyuKeyIv.iv);
  });

  it('decode 對 csTimer 產生的密文還原出明文', () => {
    const { key, iv } = deriveKeyIv(oracle.moyuDecode.mac);
    const aes = new Aes128(key);
    expect(decode(oracle.moyuDecode.encoded, aes, iv)).toEqual(oracle.moyuDecode.expectedPlain);
  });

  it('encode 與 decode 互逆（round-trip）', () => {
    const { key, iv } = deriveKeyIv('CF:30:16:AB:CD:EF');
    const plain = Array.from({ length: 20 }, (_, i) => (i * 13 + 1) & 0xff);
    const enc = encode(plain, new Aes128(key), iv);
    expect(enc).not.toEqual(plain);
    expect(decode(enc, new Aes128(key), iv)).toEqual(plain);
  });
});

describe('MoYu protocol — bit 欄位解析', () => {
  it('parseFacelet 對 solved 狀態產生 SOLVED_FACELET', () => {
    expect(parseFacelet(oracle.moyuFaceletSolved.bits144)).toBe(SOLVED_FACELET);
  });

  it('parseFacelet 對任意 144-bit 符合 csTimer', () => {
    expect(parseFacelet(oracle.moyuFacelet.bits144)).toBe(oracle.moyuFacelet.out);
  });
});

describe('MoYu protocol — 完整封包（csTimer oracle）', () => {
  function decodePacket(enc: number[]): number[] {
    const { key, iv } = deriveKeyIv(packets.mac);
    return decode(enc, new Aes128(key), iv);
  }

  it('state 封包（163）：解出 solved facelets + moveCnt', () => {
    const d = decodePacket(packets.state.enc);
    expect(messageType(d)).toBe(163);
    const { facelets, moveCnt } = parseState(d);
    expect(facelets).toBe(packets.state.expect.facelets);
    expect(facelets).toBe(SOLVED_FACELET);
    expect(moveCnt).toBe(packets.state.expect.moveCnt);
  });

  it('battery 封包（164）：解出電量', () => {
    const d = decodePacket(packets.battery.enc);
    expect(messageType(d)).toBe(164);
    expect(parseBattery(d)).toBe(packets.battery.expect.level);
  });

  it('move 封包（165）：解出 moveCnt 與各 move 的碼/時間/表記', () => {
    const d = decodePacket(packets.move.enc);
    expect(messageType(d)).toBe(165);
    const { moveCnt, moves } = parseMovePacket(d);
    expect(moveCnt).toBe(packets.move.expect.moveCnt);
    expect(moves.map((m) => m.code)).toEqual(packets.move.expect.codes);
    expect(moves.map((m) => m.timeOff)).toEqual(packets.move.expect.timeOffs);
    expect(moves.map((m) => m.move)).toEqual(packets.move.expect.wca);
    expect(moves.map((m) => m.moveIndex)).toEqual(packets.move.expect.moveIndex);
  });
});

describe('MoYu protocol — 雜項', () => {
  it('buildRequest 產生 20-byte、req[0]=opcode', () => {
    const req = buildRequest(161);
    expect(req.length).toBe(20);
    expect(req[0]).toBe(161);
  });

  it('由裝置名稱推導預設 MAC', () => {
    expect(defaultMacFromName('WCU_MY32_1234')).toBe('CF:30:16:00:12:34');
    expect(defaultMacFromName('Nope')).toBeNull();
  });
});
