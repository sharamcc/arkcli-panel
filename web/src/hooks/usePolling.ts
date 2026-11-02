import { useEffect, useRef } from 'react';

// 轮询：立即执行一次，之后按 intervalMs 重复；页面隐藏时暂停，回到前台立即补一次
// single-flight：上一次 run 未结束时不触发下一次，避免慢请求叠加
export function usePolling(run: () => void | Promise<void>, intervalMs: number, key: string) {
  const saved = useRef(run);
  saved.current = run;

  useEffect(() => {
    let timer: number | undefined;
    let inFlight = false;
    let disposed = false;

    const tick = async () => {
      if (inFlight || disposed) return;
      inFlight = true;
      try {
        await saved.current();
      } catch {
        // run 负责把错误写入界面；这里兜住异步异常，避免轮询产生未处理 rejection
      } finally {
        if (!disposed) inFlight = false;
      }
    };
    const start = () => {
      if (timer !== undefined) return;
      timer = window.setInterval(() => void tick(), intervalMs);
    };
    const stop = () => {
      if (timer === undefined) return;
      window.clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        void tick();
        start();
      }
    };

    void tick();
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      disposed = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs, key]);
}
