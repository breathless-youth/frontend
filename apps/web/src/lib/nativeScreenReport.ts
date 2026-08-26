import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { isLiveRoomState } from "@/features/live-room/liveRoomEntryState";

import { postToNative } from "./bridge";

/**
 * 현재 화면을 네이티브에 보고한다(`report-screen`, BY-436). `App`에서 한 번만 마운트한다.
 *
 * 웹 렌더러 프로세스가 죽으면 네이티브가 웹뷰를 다시 띄우는데, 그때 필요한 두 가지 —
 * 돌아갈 경로(Android 재마운트는 탭 루트로 리셋된다)와 복구 스플래시의 톤(어두운 룸에서
 * 라이트 스켈레톤이 덮이면 흰 번쩍임) — 는 웹만 안다. `useNativeTabBarSync`와 같은 이유로
 * 화면마다가 아니라 여기 한 곳에서 라우트 목록으로 파생시킨다.
 *
 * 브라우저 단독 모드에서는 `postToNative`가 무동작이라 안전하다.
 */

/** 어두운 전체 화면(세션 서피스) 라우트 — 싱글룸 `/room/:id`와 소셜룸. 결과 화면은 일반 테마다. */
function isDarkScreenPath(pathname: string): boolean {
  return pathname.startsWith("/social/room/") || /^\/room\/[^/]+$/.test(pathname);
}

export function useNativeScreenReport(): void {
  const location = useLocation();

  useEffect(() => {
    // 복원에 필요한 화면별 쿼리 — 라우트마다 유실되면 동작이 달라지는 값만 명시적으로 싣는다.
    let restoreQuery: Record<string, string> | undefined;
    if (location.pathname.startsWith("/social/room/")) {
      // 소셜룸 초대코드. 정상 SPA 흐름은 router state에 있고, 복원된 문서(state 소실)는
      // `?code` 쿼리로 입장했으므로 그쪽에서 읽는다 — 어느 쪽이든 다음 복원을 위해 다시
      // 보고해야 한다.
      const state: unknown = location.state;
      const code = isLiveRoomState(state)
        ? state.inviteCode
        : new URLSearchParams(location.search).get("code");
      if (code !== null) {
        restoreQuery = { code };
      }
    } else if (location.pathname === "/onboarding-guide") {
      // 진입 경로(`?entry=focus-start` 등) — 유실되면 복원된 가이드가 home-card 기본값으로
      // 떨어져 완료가 세션을 시작하지 않는다. 값 검증은 페이지의 parseOnboardingGuideEntry가
      // 이미 하므로 여기서는 그대로 나른다.
      const entry = new URLSearchParams(location.search).get("entry");
      if (entry !== null) {
        restoreQuery = { entry };
      }
    }
    postToNative({
      type: "report-screen",
      path: location.pathname,
      ...(restoreQuery !== undefined ? { restoreQuery } : {}),
      dark: isDarkScreenPath(location.pathname),
      atMs: Date.now(),
    });
  }, [location]);
}
