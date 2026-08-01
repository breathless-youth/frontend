import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { postToNative } from "./bridge";

/**
 * 네이티브 하단 탭 바 가시성을 현재 웹 라우트에 맞춘다(`set-tab-bar` 브리지 메시지).
 *
 * 탭 바는 네이티브가 웹뷰 **바깥**에 그리므로 웹이 직접 가릴 수 없고, 반대로 "지금 전체 화면
 * 라우트인지"는 웹만 안다 — 그래서 웹이 알려주고 네이티브가 실행한다.
 *
 * ## 왜 화면마다가 아니라 여기 한 곳인가
 *
 * 전체 화면 라우트가 자기 마운트/언마운트에서 각각 보내게 하면, 라우트를 새로 추가하는 사람이
 * 배선을 빠뜨리는 순간 조용히 탭 바가 남는다(지금 온보딩 가이드에서 일어난 일과 같은 증상).
 * 경로 목록 하나에서 파생시키면 라우트 추가가 곧 목록 추가가 된다.
 */

/**
 * 탭 바를 감추는 라우트 — `App.tsx`의 "탭 바 없는 전체 화면 스택 라우트"(BY-331)와 같은 집합이다.
 * 한쪽만 고치면 어긋나므로 함께 본다.
 *
 * **세션(`/room/:id`)은 넣지 않는다.** 네이티브가 `fullScreenModal`로 띄워 탭 바가 이미 덮이고,
 * 세션 웹뷰는 탭 라우트로 돌아오지 않아 `visible: true`를 되돌릴 기회가 없다 — 넣으면 세션을
 * 끝내고 홈으로 돌아온 뒤에도 탭 바가 사라진 채로 남는다.
 */
const FULL_SCREEN_PATHS = ["/onboarding-guide", "/contact", "/terms", "/privacy"];

export function isFullScreenPath(pathname: string): boolean {
  return FULL_SCREEN_PATHS.includes(pathname);
}

/**
 * 라우트가 바뀔 때마다 탭 바 가시성을 네이티브에 알린다. `App`에서 한 번만 마운트한다.
 *
 * 브라우저 단독 모드에서는 `postToNative`가 조용히 무동작이라 그대로 두어도 안전하다.
 */
export function useNativeTabBarSync(): void {
  const { pathname } = useLocation();

  useEffect(() => {
    postToNative({ type: "set-tab-bar", visible: !isFullScreenPath(pathname), atMs: Date.now() });
  }, [pathname]);
}
