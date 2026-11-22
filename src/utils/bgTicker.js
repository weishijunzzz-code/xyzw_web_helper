let worker = null;
const tickListeners = new Set();

function ensureWorker() {
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./bgTicker.worker.js", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event) => {
      const data = event.data || {};
      if (data.type !== "tick") return;
      const tickAt = data.now || Date.now();
      for (const fn of tickListeners) {
        try {
          fn(tickAt);
        } catch {
          /* 单个回调异常不影响其它 */
        }
      }
    };
    worker.postMessage({ type: "start" });
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * 订阅 tick，返回取消函数。
 * @param {(now: number) => void} fn
 */
export function onBgTick(fn) {
  tickListeners.add(fn);
  ensureWorker();
  return () => {
    tickListeners.delete(fn);
    if (!tickListeners.size && worker) {
      worker.terminate();
      worker = null;
    }
  };
}

/**
 * 不受后台节流的 sleep。
 * 前台靠 setTimeout 唤醒，后台 setTimeout 被压后由 tick 补上。
 */
export function bgSleep(ms) {
  return new Promise((resolve) => {
    let done = false;
    const startedAt = Date.now();
    const finish = () => {
      if (done) return;
      done = true;
      offTick();
      clearTimeout(fallback);
      resolve();
    };
    const offTick = onBgTick((now) => {
      if (now - startedAt >= ms) finish();
    });
    const fallback = setTimeout(finish, ms);
  });
}
