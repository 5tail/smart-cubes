import type { GanCubeConnection } from 'gan-web-bluetooth';
import type { CubeEvent, SmartCube } from '../../core/types.js';
import { ganEventToCubeEvent } from './mapEvent.js';

/**
 * GAN driver：包裝 gan-web-bluetooth 的連線物件，實作本套件的統一 SmartCube 介面。
 *
 * 架構守則：
 * - RxJS 不外露 — 在此訂閱 gan 的 events$（Observable），轉成 CubeEvent 後以
 *   原生 CustomEvent 投遞；RxJS 型別不出現在公開 API。
 * - driver 不得互相引用 — 本檔只依賴 gan-web-bluetooth 與 core/types。
 *
 * 事件投遞慣例（決策層 Phase 1 定案）：
 *   dispatchEvent(new CustomEvent(type, { detail: cubeEvent }))
 *   消費端：cube.addEventListener('move', e => (e as CustomEvent<CubeEvent>).detail)
 */
export class GanDriver extends EventTarget implements SmartCube {
  readonly brand = 'gan' as const;
  readonly deviceName: string;
  /** 本次連線實際使用的 MAC（gan-web-bluetooth 解析/輸入的值）；供 app 記住以利穩定重連。 */
  readonly mac: string;

  private readonly conn: GanCubeConnection;
  // 用結構型別避免把 RxJS 的 Subscription 型別帶進來。
  private sub: { unsubscribe(): void } | null;

  constructor(conn: GanCubeConnection) {
    super();
    this.conn = conn;
    this.deviceName = conn.deviceName;
    this.mac = conn.deviceMAC;

    this.sub = conn.events$.subscribe({
      next: (e) => {
        const ce = ganEventToCubeEvent(e);
        if (ce) this.emit(ce);
      },
      error: (err: unknown) => {
        this.emit({
          type: 'error',
          error: err instanceof Error ? err : new Error(String(err)),
        });
      },
    });

    // 以 macrotask 投遞 connected，確保呼叫端在 await connectSmartCube() 之後
    // 掛上的 listener 已註冊完成。
    setTimeout(() => this.emit({ type: 'connected' }), 0);
  }

  private emit(event: CubeEvent): void {
    this.dispatchEvent(new CustomEvent<CubeEvent>(event.type, { detail: event }));
  }

  async requestState(): Promise<void> {
    await this.conn.sendCubeCommand({ type: 'REQUEST_FACELETS' });
  }

  async requestBattery(): Promise<void> {
    await this.conn.sendCubeCommand({ type: 'REQUEST_BATTERY' });
  }

  /** 重置方塊內部狀態為復原（六面）。GAN 有原生 REQUEST_RESET 指令；重置後再要一次 facelets 更新畫面。 */
  async resetToSolved(): Promise<void> {
    await this.conn.sendCubeCommand({ type: 'REQUEST_RESET' });
    await this.conn.sendCubeCommand({ type: 'REQUEST_FACELETS' });
  }

  async disconnect(): Promise<void> {
    // 主動斷線：先退訂避免重覆收到 DISCONNECT 事件，再關閉底層連線，
    // 最後自行投遞一次 disconnected。
    this.sub?.unsubscribe();
    this.sub = null;
    await this.conn.disconnect();
    this.emit({ type: 'disconnected' });
  }
}
