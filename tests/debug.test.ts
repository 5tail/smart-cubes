import { describe, it, expect, afterEach } from 'vitest';
import { setCapture, isCapturing, recordPacket, getCaptured, clearCaptured } from '../src/utils/debug.js';

describe('封包擷取（dev-only）', () => {
  afterEach(() => {
    setCapture(false);
    clearCaptured();
  });

  it('預設關閉時 recordPacket 為 no-op', () => {
    expect(isCapturing()).toBe(false);
    recordPacket('qiyi', [1, 2, 3]);
    expect(getCaptured()).toHaveLength(0);
  });

  it('開啟後記錄 raw 與 decoded 的 hex', () => {
    setCapture(true);
    recordPacket('qiyi', [0xfe, 0x0a, 0xff], [0x01, 0x2b]);
    const [p] = getCaptured();
    expect(p!.brand).toBe('qiyi');
    expect(p!.raw).toBe('fe0aff');
    expect(p!.decoded).toBe('012b');
    expect(typeof p!.t).toBe('number');
  });

  it('未帶 decoded 時省略該欄位', () => {
    setCapture(true);
    recordPacket('moyu', [0, 255]);
    const [p] = getCaptured();
    expect(p!.raw).toBe('00ff');
    expect(p!.decoded).toBeUndefined();
  });

  it('setCapture(true) 清空既有緩衝；clearCaptured 清空', () => {
    setCapture(true);
    recordPacket('qiyi', [1]);
    expect(getCaptured()).toHaveLength(1);
    setCapture(true); // 重新開始清空
    expect(getCaptured()).toHaveLength(0);
    recordPacket('qiyi', [2]);
    clearCaptured();
    expect(getCaptured()).toHaveLength(0);
  });
});
