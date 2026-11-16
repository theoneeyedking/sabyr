import { useEffect, useRef } from 'react';

/** Периодический опрос: вызывает fn сразу и затем каждые intervalMs, пока enabled. */
export function usePolling(fn: () => void | Promise<void>, intervalMs: number, enabled: boolean, immediate = true) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    if (!enabled) return;
    let busy = false;
    const tick = async () => {
      if (busy) return; // предыдущий запрос ещё не вернулся
      busy = true;
      try {
        await saved.current();
      } catch {
        // ошибки опроса не показываем: следующая попытка через intervalMs
      } finally {
        busy = false;
      }
    };
    if (immediate) void tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled, immediate]);
}
