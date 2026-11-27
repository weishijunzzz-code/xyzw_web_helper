export function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException('操作已取消', 'AbortError');
  }
}
