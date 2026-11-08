import { useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { sessionGuideState } from "@/features/study-session/sessionGuide";
import { trackFocusStartTapped, type FocusStartSource } from "@/lib/amplitude";
import { haptic } from "@/lib/haptics";
import { requestSessionStart } from "@/lib/sessionStart";

/**
 * 집중 시작 흐름
 *
 * 홈과 랭킹이 같은 흐름을 쓰고 누른 자리만 `source`로 구분한다.
 * 세션 시작은 서버에 옛 세션 마감을 먼저 보내고 기다리므로 그동안 다시 눌러도 무시한다.
 * 가이드를 안 본 계정은 세션 대신 가이드로 보낸다. 세션과 카메라 권한 요청은 가이드의 `순공 시작하기` 뒤에 일어난다.
 */
export function useFocusStart(
  userId: number | null,
): (source: FocusStartSource, options?: { subjectId?: number }) => Promise<Error | null> {
  const navigate = useNavigate();
  const location = useLocation();
  const isStartingRef = useRef(false);

  return async function startFocus(source: FocusStartSource, options: { subjectId?: number } = {}) {
    if (isStartingRef.current) {
      return null;
    }
    const subjectId = options.subjectId;
    if (subjectId !== undefined && (!Number.isSafeInteger(subjectId) || subjectId <= 0))
      return new RangeError("invalid initial subject");
    if (userId !== null && sessionGuideState(userId) !== "seen") {
      haptic("medium");
      void navigate(
        { pathname: "/session-guide", search: location.search },
        { state: { source, ...(subjectId === undefined ? {} : { initialSubjectId: subjectId }) } },
      );
      return null;
    }
    isStartingRef.current = true;
    haptic("medium");
    trackFocusStartTapped(source);
    const openRoom = () => {
      const search = new URLSearchParams(location.search);
      search.delete("initialSubjectId");
      if (subjectId !== undefined) search.set("initialSubjectId", String(subjectId));
      void navigate({ pathname: "/room/1", search: search.toString() ? `?${search}` : "" });
    };
    try {
      if (subjectId === undefined) await requestSessionStart(userId, openRoom);
      else await requestSessionStart(userId, openRoom, { subjectId });
      return null;
    } catch (error: unknown) {
      console.warn("[focus-start] failed to handle focus start", error);
      return error instanceof Error ? error : new Error("study start failed");
    } finally {
      isStartingRef.current = false;
    }
  };
}
