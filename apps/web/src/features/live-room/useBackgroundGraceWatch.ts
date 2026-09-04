import { useCallback, useEffect, useRef } from "react";

import type { SystemPauseSource } from "@/features/study-session/adapters/systemPauseSource";
import { trackSocialRoomBackgroundReturned } from "@/lib/amplitude";

/**
 * 백엔드 룸 유예와 같은 값 — 이보다 오래 숨어 있었으면 서버가 자리를 회수했을 수 있다.
 * 클라이언트 판정이 서버보다 항상 먼저 온다(서버 유예는 연결 끊김 감지 시점에 시작).
 */
export const GRACE_MS = 30_000;

/**
 * 숨김(백그라운드·화면 꺼짐) 경과가 유예를 넘긴 복귀를 감지한다 — 라이브룸 전용.
 * 일시정지 감시(usePauseAutoEnd)와 다른 축이다: 저쪽은 일시정지 시작부터 공용 20분,
 * 이쪽은 숨은 시간만 본다. 카메라를 끄고 화면을 보고 있는 경우를 오판하지 않는다.
 *
 * `isExpiredNow`는 이동 시점의 재판정용이다. 숨어 있는 동안 다른 감시자(공용 20분)가
 * 세션을 먼저 끝내면 `enabled`가 꺼져 복귀 콜백이 오지 않는데, 그 경우에도 "숨김이
 * 유예를 넘겼는가"는 답할 수 있어야 안내와 이동이 빠지지 않는다. 그래서 숨김 시작
 * 시각은 구독 해제 후에도 ref에 남긴다.
 */
export function useBackgroundGraceWatch({
  enabled,
  onExpire,
  systemPause,
  graceMs = GRACE_MS,
  now,
}: {
  enabled: boolean;
  onExpire: () => void;
  systemPause: SystemPauseSource;
  graceMs?: number;
  now?: () => number;
}): { isExpiredNow: () => boolean } {
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  // Date.now 참조를 직접 담지 않고 호출 시점에 읽는다 — 렌더 시점 참조를 캡처하면
  // 리렌더 없는 일시정지 구간에서 가짜 시계 교체(테스트)가 반영되지 않는다.
  const nowFn = now ?? (() => Date.now());
  const nowRef = useRef(nowFn);
  nowRef.current = nowFn;
  const hiddenAtMsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    return systemPause.subscribe({
      // visibilitychange와 pagehide가 겹쳐 와도 첫 시각을 유지한다 — 뒤 신호로
      // 갱신하면 숨은 시간이 짧게 잡혀 만료를 놓친다.
      onLeave: () => {
        hiddenAtMsRef.current ??= nowRef.current();
      },
      onReturn: () => {
        const hiddenAt = hiddenAtMsRef.current;
        hiddenAtMsRef.current = null;
        if (hiddenAt === null) {
          return;
        }
        const hiddenMs = nowRef.current() - hiddenAt;
        const expired = hiddenMs >= graceMs;
        // 복귀마다 한 건(BY-616 확장) — 유예 이내 복귀 분포가 30초라는 값의 근거가 된다.
        trackSocialRoomBackgroundReturned({ hiddenSec: Math.round(hiddenMs / 1000), expired });
        if (expired) {
          onExpireRef.current();
        }
      },
    });
  }, [enabled, graceMs, systemPause]);

  const isExpiredNow = useCallback(() => {
    const hiddenAt = hiddenAtMsRef.current;
    return hiddenAt !== null && nowRef.current() - hiddenAt >= graceMs;
  }, [graceMs]);

  return { isExpiredNow };
}
