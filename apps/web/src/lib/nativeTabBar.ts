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
 * 탭 바를 감추는 라우트
 */
const FULL_SCREEN_PATHS = [
  "/onboarding-guide",
  "/contact",
  "/terms",
  "/privacy",
  "/licenses",
  "/social/code",
  "/social/join",
  "/profile",
];

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
    const post = () => {
      postToNative({
        type: "set-tab-bar",
        visible: !isFullScreenPath(pathname),
        atMs: Date.now(),
      });
    };
    post();
    // 문의(/contact)가 문서 단위 내비게이션이 되면서(COEP 예외 — `ContactPage` 주석) 뒤로
    // 스와이프가 이전 문서를 **bfcache에서 복원**할 수 있게 됐다. 복원은 렌더가 아니라 페이지
    // 동결 해제라 위 effect가 다시 돌지 않는다 — 복귀 신호가 유실되면 탭 바가 사라진 채
    // 남는다(`FULL_SCREEN_PATHS` 주석의 온보딩 가이드 증상과 동일). 그 시점의 유일한 신호인
    // `pageshow(persisted)`에서 한 번 더 알린다. persisted가 아닌 일반 로드는 위 post()와
    // 중복이라 보내지 않는다.
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        post();
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [pathname]);
}
