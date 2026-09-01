import { useCallback, useEffect, useRef, useState } from "react";

/** 토스트 노출 시간(ms) — 3초는 읽기 전에 사라진다는 피드백으로 5초로 늘렸다. */
const DEFAULT_TOAST_DURATION_MS = 5000;

/**
 * 한 번에 하나만 뜨는 토스트. 같은 문구를 다시 띄우면 타이머가 새로 시작된다.
 */
export function useToast(durationMs: number = DEFAULT_TOAST_DURATION_MS) {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const showToast = useCallback(
    (next: string) => {
      clear();
      setMessage(next);
      timerRef.current = setTimeout(() => {
        setMessage(null);
        timerRef.current = null;
      }, durationMs);
    },
    [clear, durationMs],
  );

  useEffect(() => clear, [clear]);

  return { message, showToast };
}
