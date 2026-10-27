import { useEffect, useRef } from 'react';

// 轮询：立即执行一次，之后按 intervalMs 重复；页面隐藏时暂停，回到前台立即补一次
export function usePolling(run: () => void, intervalMs: number, key: string) {
  const saved = useRef(run);
  saved.current = run;

  useEffect(() => {
    let timer: number | undefined;

    const tick = () => saved.current();
    const start = () => {
      if (timer !== undefined) return;
      timer = window.setInterval(tick, intervalMs);
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
        tick();
        start();
      }
    };

    tick();
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs, key]);
}
