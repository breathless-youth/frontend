import { useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { runFocusStartFlow } from "@/features/onboarding/focusStartFlow";
import type { OnboardingGuideEntry } from "@/features/onboarding/onboardingGuideSteps";
import { trackFocusStartTapped, type FocusStartSource } from "@/lib/amplitude";
import { slideNavigate } from "@/lib/pageTransition";
import { requestSessionStart } from "@/lib/sessionStart";

/**
 * 집중 시작 흐름
 *
 * 홈과 랭킹이 같은 분기(가이드 또는 세션)를 쓰고 누른 자리만 `source`로 가른다.
 * 분기는 `runFocusStartFlow`가 정하고, 여기서는 그 웹 구현만 준다.
 * 세션 시작은 서버에 옛 세션 마감을 먼저 보내고 기다리므로 그동안 다시 눌러도 무시한다.
 * 가이드는 현재 쿼리(`?userId=N`)를 지킨 채 `entry`만 더해 연다.
 * 쿼리를 잃으면 가이드가 미저장 모드로 뜬다.
 */
export function useFocusStart(userId: number | null): (source: FocusStartSource) => void {
  const navigate = useNavigate();
  const location = useLocation();
  const hasOpenedGuideRef = useRef(false);
  const isStartingRef = useRef(false);

  function openOnboardingGuide(entry: OnboardingGuideEntry) {
    if (hasOpenedGuideRef.current) {
      return;
    }
    hasOpenedGuideRef.current = true;
    const params = new URLSearchParams(location.search);
    params.set("entry", entry);
    slideNavigate("forward", () =>
      navigate({ pathname: "/onboarding-guide", search: params.toString() }),
    );
  }

  return function startFocus(source: FocusStartSource) {
    if (isStartingRef.current) {
      return;
    }
    isStartingRef.current = true;
    void runFocusStartFlow({
      openOnboardingGuide: (entry) => {
        trackFocusStartTapped("guide", source);
        openOnboardingGuide(entry);
      },
      startSession: async () => {
        trackFocusStartTapped("session", source);
        await requestSessionStart(userId, () =>
          navigate({ pathname: "/room/1", search: location.search }),
        );
      },
    })
      .catch((error: unknown) => {
        console.warn("[focus-start] 집중 시작 처리 실패", error);
      })
      .finally(() => {
        isStartingRef.current = false;
      });
  };
}
