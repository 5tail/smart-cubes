import { describe, it, expect } from 'vitest';
import {
  decodeNotification,
  parseCubeData,
  parseGyroQuaternion,
} from '../src/drivers/qiyi/protocol.js';

// Tornado V4 姿態封包（0xcc 框架）行為錨：真實加密封包取自 XMD-TornadoV4LE-00F9 實機
// 「整顆在空間翻轉」擷取（2026-07-16）。走完整路徑：AES-ECB 解密 → CRC 驗證 → 框架辨識 → 四元數解析。

function hex(s: string): number[] {
  const a: number[] = [];
  for (let i = 0; i < s.length; i += 2) a.push(parseInt(s.slice(i, i + 2), 16));
  return a;
}

// 實機原始加密封包（raw）。
const RAW_GYRO = [
  'f7e7aa32d6ba52b733f9b3213dc06ad0',
  'd8bccfebd06c8c09f8581fbca80c8409',
  '30322ce429341f58eec6d6fe56cf50be',
  'b2d1d905ee8831b40f07ce309deb98e4',
];

describe('QiYi Tornado V4 陀螺儀（0xcc 框架，實機封包逆向）', () => {
  it('解密+CRC 通過，0xcc 封包 → 單位四元數 gyro 事件、無 ACK', () => {
    for (const r of RAW_GYRO) {
      const msg = decodeNotification(hex(r));
      expect(msg).not.toBeNull();
      expect(msg![0]).toBe(0xcc); // 姿態框架
      const { events, ack } = parseCubeData(msg!, 0, -1);
      expect(ack).toBeNull(); // 姿態封包不回 ACK（實機連續串流未斷線佐證）
      expect(events).toHaveLength(1);
      const e = events[0]!;
      expect(e.type).toBe('gyro');
      if (e.type === 'gyro') {
        expect(Math.hypot(...e.quaternion)).toBeCloseTo(1, 6); // 正規化為單位四元數
      }
    }
  });

  it('parseGyroQuaternion：offset 6 起 4×int16 BE、逐包正規化', () => {
    // cc1052 7c8d 5f | fe1b ff23 fd3b fe38 | 2bf8 → raw int16 BE [-485,-221,-709,-456]
    const q = parseGyroQuaternion(hex('cc10527c8d5ffe1bff23fd3bfe382bf8'));
    expect(q.map((x) => Math.round(x * 1000))).toEqual([-486, -222, -711, -457]);
  });

  it('非 0xcc/0xfe 框架不誤判為 gyro', () => {
    // 一個 0xfe hello 封包不應產生 gyro 事件（回歸保護）。
    const { events } = parseCubeData([0xfe, 0x10, 0x02, 0, 0, 0, 0], 0, -1);
    expect(events.some((e) => e.type === 'gyro')).toBe(false);
  });
});
