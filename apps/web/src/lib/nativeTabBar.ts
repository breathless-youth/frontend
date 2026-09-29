import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { postToNative } from "./bridge";
import { useModalOverlayOpen } from "./nativeModalOverlay";

/**
 * 네이티브 하단 탭 바 가시성을 현재 웹 라우트에 맞춘다(`set-tab-bar` 브리지 메시지).
 *
 * 탭 바는 네이티브가 웹뷰 바깥에 그리므로 웹이 직접 가릴 수 없고,
 * 반대로 "지금 전체 화면 라우트인지"는 웹만 안다.
 * 그래서 웹이 알려주고 네이티브가 실행한다.
 *
 * - 왜 화면마다가 아니라 여기 한 곳인가
 * 전체 화면 라우트가 자기 마운트/언마운트에서 각각 보내게 하면,
 * 라우트를 새로 추가하는 사람이 연동을 누락할 수 있다.
 * 경로 목록 하나에서 파생시키면 라우트 추가가 편리하다.
 *
 * - 모달은 라우트가 아니다
 * 경로가 그대로인 채로 열리고 닫히므로, 발신 여부를 결정하는 값이 하나 더 늘어난 것으로 다룬다.
 * 전체 화면 라우트에서는 모달이 열려도 차단을 싣지 않는다.
 * 이미 탭 바가 없는 화면에서 딤을 그리려고 탭 바를 되살릴 이유가 없다.
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

/** 동적 세그먼트를 갖는 전체 화면 라우트 — prefix로 판정한다. */
const FULL_SCREEN_PATH_PREFIXES = ["/social/room/"];

export function isFullScreenPath(pathname: string): boolean {
  return (
    FULL_SCREEN_PATHS.includes(pathname) ||
    FULL_SCREEN_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

/** 네이티브가 fullScreenModal로 띄워 탭 바를 이미 덮는 라우트 — prefix로 판정한다. */
const NATIVE_COVERED_PATH_PREFIXES = ["/room/"];

/**
 * 네이티브가 fullScreenModal로 띄워 탭 바가 이미 덮여 있는 경로다. 보이지 않는 탭 바를
 * 차단 상태로 바꿔 두면, 세션 웹뷰가 닫힘 신호를 보내기 전에 죽었을 때 그 상태가 남는다.
 */
export function isNativeCoveredPath(pathname: string): boolean {
  return NATIVE_COVERED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

const SAFE_AREA_TOAST_BOTTOM = "calc(env(safe-area-inset-bottom) + 16px)";

/**
 * 토스트 아래 여백. 네이티브 플로팅 탭 바는 웹뷰 위에 겹쳐 그려져 z-index로 앞지를 수 없으므로,
 * 탭 바가 보이는 라우트에서는 탭 바가 차지하는 높이만큼 띄운다.
 */
export function toastBottomOffset(pathname: string, hasNativeBridge: boolean): string {
  if (!hasNativeBridge || isFullScreenPath(pathname) || isNativeCoveredPath(pathname)) {
    return SAFE_AREA_TOAST_BOTTOM;
  }
  return "var(--tab-bar-reserve)";
}

/**
 * 라우트가 바뀔 때마다 탭 바 가시성을 네이티브에 알린다.
 * `App`에서 한 번만 마운트한다.
 */
export function useNativeTabBarSync(): void {
  const { pathname } = useLocation();
  const modalOpen = useModalOverlayOpen();

  useEffect(() => {
    const routeHidden = isFullScreenPath(pathname);
    const nativeCovered = isNativeCoveredPath(pathname);
    const post = () => {
      postToNative({
        type: "set-tab-bar",
        visible: !routeHidden && !modalOpen,
        // 이미 탭 바가 없는 화면에서는 보내지 않는다 — 딤을 그리려고 탭 바가 되살아난다.
        ...(modalOpen && !routeHidden && !nativeCovered ? { blockedByModal: true } : {}),
        atMs: Date.now(),
      });
    };
    post();
    // 문의(/contact)가 문서 단위 내비게이션이 되면서(COEP 예외 — `ContactPage` 주석) 뒤로
    // 스와이프가 이전 문서를 bfcache에서 복원할 수 있게 됐다.
    // 복원은 렌더가 아니라 페이지 freeze 해제라 위 effect가 다시 실행되지 않는다
    // — 복귀 신호가 유실되면 탭 바가 사라진 채 남는다.
    // 그 시점의 유일한 신호인 `pageshow(persisted)`에서 한 번 더 알린다.
    // persisted가 아닌 일반 로드는 위 post()와 중복이라 보내지 않는다.
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        post();
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [pathname, modalOpen]);
}
