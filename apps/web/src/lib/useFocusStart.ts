import { useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { trackFocusStartTapped, type FocusStartSource } from "@/lib/amplitude";
import { haptic } from "@/lib/haptics";
import { requestSessionStart } from "@/lib/sessionStart";

/**
 * 집중 시작 흐름
 *
 * 홈과 랭킹이 같은 흐름을 쓰고 누른 자리만 `source`로 구분한다.
 * 홈 과목 재생 버튼은 `subjectId`로 그 과목을 고른 채 시작하게 한다.
 * 세션 시작은 서버에 옛 세션 마감을 먼저 보내고 기다리므로 그동안 다시 눌러도 무시한다.
 */
export function useFocusStart(
  userId: number | null,
): (source: FocusStartSource, subjectId?: number) => void {
  const navigate = useNavigate();
  const location = useLocation();
  const isStartingRef = useRef(false);

  return function startFocus(source: FocusStartSource, subjectId?: number) {
    if (isStartingRef.current) {
      return;
    }
    isStartingRef.current = true;
    haptic("medium");
    trackFocusStartTapped(source);
    requestSessionStart(
      userId,
      () => navigate({ pathname: "/room/1", search: location.search }),
      subjectId ?? null,
    )
      .catch((error: unknown) => {
        console.warn("[focus-start] 집중 시작 처리 실패", error);
      })
      .finally(() => {
        isStartingRef.current = false;
      });
  };
}
