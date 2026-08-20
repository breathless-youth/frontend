import { useCallback, useEffect, useRef, useState } from "react";

/** 토스트 노출 시간(ms) — 시각 스펙 미확정이라 임시값이다(SCR-S3-1·S3-2 Current Limitations). */
const DEFAULT_TOAST_DURATION_MS = 3000;

/** 한 번에 하나만 뜨는 세션 토스트. 같은 문구를 다시 띄우면 타이머가 새로 시작된다. */
export function useSessionToast(durationMs: number = DEFAULT_TOAST_DURATION_MS) {
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
