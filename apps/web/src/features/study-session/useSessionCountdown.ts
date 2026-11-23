import { useEffect, useEffectEvent, useState } from "react";

/**
 * 공부 시작 카운트다운의 남은 초
 *
 * 1초마다 줄고 다 세면 `onDone`을 한 번 부른다. 0초면 세지 않는다(이어받은 세션).
 * 화면이 가려진 동안에는 세지 않는다. 가려진 채로 끝나면 세션이 가려진 상태로 시작돼 일시정지가 걸리지 않는다.
 */
export function useSessionCountdown(seconds: number, onDone: () => void): number {
  const [left, setLeft] = useState(seconds);
  const finish = useEffectEvent(onDone);

  useEffect(() => {
    if (seconds <= 0) {
      return;
    }
    let remaining = seconds;
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") {
        return;
      }
      remaining -= 1;
      setLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        finish();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [seconds]);

  return left;
}
