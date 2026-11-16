import { useEffect, useRef, useState } from "react";

const DURATION_MS = 700;

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * 늘어난 숫자를 이전 값에서 새 값까지 세어 올리기
 *
 * 포인트를 받았다는 것이 잔액에서 바로 보이게 한다.
 * 처음 받은 값과 줄어든 값은 세지 않고 바로 바꾼다. 쓴 포인트는 구매 창이 이미 알려 준다.
 * 움직임 줄이기를 켠 기기에서도 바로 바꾼다.
 */
export function useCountUp(value: number | undefined): number | undefined {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (value === undefined || start === undefined || value <= start || prefersReducedMotion()) {
      setShown(value);
      return;
    }
    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / DURATION_MS);
      const eased = 1 - (1 - progress) ** 3;
      setShown(Math.round(start + (value - start) * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return shown;
}
