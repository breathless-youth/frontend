import { useCallback, useSyncExternalStore } from "react";

/**
 * 간격마다 바뀌는 현재 시각
 *
 * 간격 단위로 내린 값이라 같은 간격 안에서는 같은 값이 나온다.
 * `null`이면 타이머를 두지 않고 그릴 때의 시각만 준다.
 */
export function useNow(intervalMs: number | null): number {
  const step = intervalMs ?? 1000;
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (intervalMs === null) {
        return () => {};
      }
      const id = window.setInterval(onChange, intervalMs);
      return () => window.clearInterval(id);
    },
    [intervalMs],
  );
  const getSnapshot = useCallback(() => Math.floor(Date.now() / step) * step, [step]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
