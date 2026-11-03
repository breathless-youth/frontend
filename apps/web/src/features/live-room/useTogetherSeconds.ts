import { useCallback, useEffect, useRef } from "react";

import type { SystemPauseSource } from "@/features/study-session/adapters/systemPauseSource";

interface TogetherClock {
  totalMs: number;
  /** 열린 구간이 시작한 시각이고 닫혀 있으면 null이다. */
  since: number | null;
}

function closeSegment(clock: TogetherClock, atMs: number): void {
  if (clock.since !== null) {
    clock.totalMs += Math.max(0, atMs - clock.since);
    clock.since = null;
  }
}

/**
 * 공부방에서 함께한 시간
 *
 * 내가 측정 중이고 나 말고 카메라를 켠 멤버가 한 명 이상인 동안을 센다.
 * 타이머는 늦게 돌거나 멈출 수 있어서 타이머로 세지 않고 함께인 구간이 열리고 닫힌 시각의 차이를 더한다.
 * 화면이 가려지면 그 신호를 받은 때 구간을 닫는다.
 * 멈춤을 그린 뒤에 닫으면 웹뷰가 그 사이 얼었을 때 가려진 시간 전체가 더해지기 때문이다.
 * 공부방은 돌아와도 스스로 다시 측정하지 않아서, 다시 측정을 시작하면 그때 새 구간이 열린다.
 * 돌려준 함수는 부를 때마다 지금까지 쌓인 초를 정수로 주고, 다시 그려도 같은 함수다.
 */
export function useTogetherSeconds({
  counting,
  othersWithCamera,
  systemPause,
}: {
  /** 측정 중이고 내가 멈추지 않은 동안이다. */
  counting: boolean;
  /** 나를 뺀 멤버 중 카메라를 켰고 차단하지 않은 사람 수다. */
  othersWithCamera: number;
  /** 세션이 화면 가려짐을 듣는 것과 같은 신호원이다. */
  systemPause: SystemPauseSource;
}): () => number {
  const together = counting && othersWithCamera > 0;
  const clockRef = useRef<TogetherClock>({ totalMs: 0, since: null });

  useEffect(() => {
    if (!together) {
      return;
    }
    const clock = clockRef.current;
    clock.since = Date.now();
    return () => closeSegment(clock, Date.now());
  }, [together]);

  useEffect(
    () =>
      systemPause.subscribe({
        onLeave: () => closeSegment(clockRef.current, Date.now()),
        onReturn: () => {},
      }),
    [systemPause],
  );

  return useCallback(() => {
    const { totalMs, since } = clockRef.current;
    const openMs = since === null ? 0 : Date.now() - since;
    return Math.round((totalMs + openMs) / 1000);
  }, []);
}
