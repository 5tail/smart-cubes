import { describe, it, expect, vi } from 'vitest';
import type { GanCubeConnection, GanCubeEvent } from 'gan-web-bluetooth';
import { GanDriver } from '../src/drivers/gan/GanDriver.js';
import type { CubeEvent } from '../src/core/types.js';

/**
 * 用假的 GanCubeConnection 驗證 GanDriver 的行為（無硬體）：
 * - RxJS events$ → 統一 CubeEvent，以 CustomEvent(detail) 投遞（決策層 Phase 1 定案）。
 * - requestState / requestBattery 送出正確 gan 指令。
 * - disconnect 會退訂、關閉底層連線、並投遞 disconnected。
 */

interface Observer {
  next: (e: GanCubeEvent) => void;
  error?: (err: unknown) => void;
}

function makeFakeConn() {
  let observer: Observer | null = null;
  const sendCubeCommand = vi.fn(async () => {});
  const disconnect = vi.fn(async () => {});
  const conn = {
    deviceName: 'GANi3-abcd',
    deviceMAC: 'AA:BB:CC:DD:EE:FF',
    events$: {
      subscribe(o: Observer) {
        observer = o;
        return { unsubscribe: vi.fn() };
      },
    },
    sendCubeCommand,
    disconnect,
  } as unknown as GanCubeConnection;
  return { conn, emit: (e: GanCubeEvent) => observer?.next(e), sendCubeCommand, disconnect };
}

function detailOf(e: Event): CubeEvent {
  return (e as CustomEvent<CubeEvent>).detail;
}

describe('GanDriver', () => {
  it('暴露 brand 與 deviceName', () => {
    const { conn } = makeFakeConn();
    const cube = new GanDriver(conn);
    expect(cube.brand).toBe('gan');
    expect(cube.deviceName).toBe('GANi3-abcd');
  });

  it('MOVE 事件以 CustomEvent(detail) 投遞給 move listener', () => {
    const { conn, emit } = makeFakeConn();
    const cube = new GanDriver(conn);
    const seen: CubeEvent[] = [];
    cube.addEventListener('move', (e) => seen.push(detailOf(e)));

    emit({
      type: 'MOVE',
      timestamp: 100,
      serial: 1,
      face: 1,
      direction: 0,
      move: 'R',
      localTimestamp: 99,
      cubeTimestamp: 42,
    });

    expect(seen).toEqual([
      { type: 'move', move: 'R', cubeTimestamp: 42, hostTimestamp: 99 },
    ]);
  });

  it('FACELETS 投遞給 facelets listener', () => {
    const { conn, emit } = makeFakeConn();
    const cube = new GanDriver(conn);
    const facelets = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
    let got: CubeEvent | null = null;
    cube.addEventListener('facelets', (e) => (got = detailOf(e)));
    emit({ type: 'FACELETS', timestamp: 1, serial: 0, facelets, state: {
      CP: [0, 1, 2, 3, 4, 5, 6, 7], CO: [0, 0, 0, 0, 0, 0, 0, 0],
      EP: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], EO: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    } });
    expect(got).toEqual({ type: 'facelets', facelets });
  });

  it('requestState / requestBattery 送出對應 gan 指令', async () => {
    const { conn, sendCubeCommand } = makeFakeConn();
    const cube = new GanDriver(conn);
    await cube.requestState();
    await cube.requestBattery();
    expect(sendCubeCommand).toHaveBeenNthCalledWith(1, { type: 'REQUEST_FACELETS' });
    expect(sendCubeCommand).toHaveBeenNthCalledWith(2, { type: 'REQUEST_BATTERY' });
  });

  it('disconnect 關閉底層連線並投遞 disconnected', async () => {
    const { conn, disconnect } = makeFakeConn();
    const cube = new GanDriver(conn);
    let disconnected = false;
    cube.addEventListener('disconnected', () => (disconnected = true));
    await cube.disconnect();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(disconnected).toBe(true);
  });

  it('連線後（macrotask）投遞一次 connected', async () => {
    vi.useFakeTimers();
    try {
      const { conn } = makeFakeConn();
      const cube = new GanDriver(conn);
      let connected = false;
      cube.addEventListener('connected', () => (connected = true));
      vi.runAllTimers();
      expect(connected).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
