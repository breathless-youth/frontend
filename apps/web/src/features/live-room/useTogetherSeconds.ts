import { useCallback, useEffect, useRef } from "react";

/**
 * 공부방에서 함께한 시간
 *
 * 내가 측정 중이고 나 말고 카메라를 켠 멤버가 한 명 이상인 동안을 센다.
 * 백그라운드 웹뷰는 타이머를 멈추므로 타이머로 세지 않고 함께인 구간이 열리고 닫힌 시각의 차이를 더한다.
 * 돌려준 함수는 부를 때마다 지금까지 쌓인 초를 정수로 주고, 다시 그려도 같은 함수다.
 */
export function useTogetherSeconds({
  counting,
  othersWithCamera,
}: {
  /** 측정 중이고 내가 멈추지 않은 동안이다. */
  counting: boolean;
  /** 나를 뺀 멤버 중 카메라를 켰고 차단하지 않은 사람 수다. */
  othersWithCamera: number;
}): () => number {
  const together = counting && othersWithCamera > 0;
  const clockRef = useRef<{ totalMs: number; since: number | null }>({ totalMs: 0, since: null });

  useEffect(() => {
    if (!together) {
      return;
    }
    const clock = clockRef.current;
    clock.since = Date.now();
    return () => {
      if (clock.since !== null) {
        clock.totalMs += Date.now() - clock.since;
        clock.since = null;
      }
    };
  }, [together]);

  return useCallback(() => {
    const { totalMs, since } = clockRef.current;
    const openMs = since === null ? 0 : Date.now() - since;
    return Math.round((totalMs + openMs) / 1000);
  }, []);
}
