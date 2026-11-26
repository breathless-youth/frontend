import { useEffect, useEffectEvent, useRef, useState } from "react";

/**
 * 공부 시작 카운트다운의 남은 초
 *
 * 1초마다 줄고 다 세면 `onDone`을 한 번 부른다. 0초면 세지 않는다(이어받은 세션).
 * 화면이 가려진 동안과 `held`인 동안에는 세지 않고, 다시 보이거나 풀리면 남은 초부터 이어서 센다.
 * `seconds`는 처음 받은 값만 쓴다. 도중에 바뀌어도 남은 초를 다시 잡지 않는다.
 */
export function useSessionCountdown(seconds: number, onDone: () => void, held = false): number {
  const [left, setLeft] = useState(seconds);
  const remainingRef = useRef(seconds);
  const finish = useEffectEvent(onDone);

  useEffect(() => {
    if (held || remainingRef.current <= 0) {
      return;
    }
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") {
        return;
      }
      remainingRef.current -= 1;
      setLeft(remainingRef.current);
      if (remainingRef.current <= 0) {
        clearInterval(timer);
        finish();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [held]);

  return left;
}
