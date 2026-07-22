/**
 * 讓「可能永久 hang」的 Promise 在時限內被拒絕。
 *
 * Web Bluetooth 的 GATT 操作（`gatt.connect()` / `getPrimaryService` / `startNotifications` …）
 * 沒有內建逾時：方塊卡死時這些 Promise 會永遠不 settle，導致連線流程整個掛住、
 * 半開的連線佔住 adapter、下一次連線噴 `GATT operation already in progress`。
 * 包上本工具後，逾時即拒絕，呼叫端可在 catch 內斷線清理，把「永久卡住」變成「失敗可重試」。
 *
 * 註：逾時只讓「等待」提早結束，底層操作本身不會被取消——呼叫端須在 catch 內
 * 主動 `gatt.disconnect()` 釋放連線。
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}逾時（${ms}ms 內無回應）`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}
