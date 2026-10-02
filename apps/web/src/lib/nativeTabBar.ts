import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { postToNative } from "./bridge";
import { useModalOverlayCoversTabBar, useModalOverlayOpen } from "./nativeModalOverlay";
import { pageTransitionFinished } from "./pageTransition";

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
 *
 * - 바텀시트는 차단이 아니라 숨김이다
 * 모달 중에서도 화면 바닥에 붙는 바텀시트(`data-covers-tab-bar`)는 탭 바를 숨긴다.
 * 탭 바는 웹뷰 위에 떠 있어서 딤으로 남겨 두면 시트 아래쪽(저장 버튼)을 가린다.
 * 떠 있는 바라 숨겨도 웹뷰 높이는 그대로다.
 * iOS 시스템 탭 바도 같은 규칙으로 숨긴다.
 * 숨기면 `env(safe-area-inset-bottom)`이 바 높이만큼 줄어 시트 여백이 한 번 움직이지만, 시트 뒤에 바가 남는 쪽보다 낫다고 실기기에서 확인했다.
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

// 앱 안 이동은 URL에서 쿼리를 지우므로 첫 판정을 보관한다.
// 표시는 바이너리마다 고정이라 다시 읽을 이유가 없다.
let nativeTabBarCache: boolean | null = null;

/**
 * 네이티브 셸이 시스템 탭 바를 쓰는지.
 *
 * iOS 셸이 웹뷰 URL에 `nativeTabBar=1`을 붙인다(`remoteQueryParams.ts`).
 * 시스템 탭 바는 웹뷰의 `env(safe-area-inset-bottom)`에 자기 높이를 넣으므로 웹이 바 높이를 따로 알 필요가 없다.
 * 원격 웹은 구버전 앱에도 즉시 배포되므로 표시가 없으면 플로팅 바 공식을 유지한다.
 */
export function hasNativeTabBar(): boolean {
  nativeTabBarCache ??= new URLSearchParams(window.location.search).get("nativeTabBar") === "1";
  return nativeTabBarCache;
}

/** 테스트마다 URL을 바꿔 판정하도록 캐시를 비운다. */
export function __resetNativeTabBarForTests(): void {
  nativeTabBarCache = null;
}

/**
 * 시스템 탭 바일 때 문서 루트에 `native-tab-bar` 클래스를 단다.
 *
 * `index.css`가 이 클래스에서 `--tab-bar-reserve`를 안전 영역 기준으로 덮는다.
 * 판정은 실행 중 바뀌지 않으므로 마운트 때 한 번만 건다.
 */
export function useNativeTabBarClass(): void {
  useEffect(() => {
    if (!hasNativeTabBar()) {
      return;
    }
    const root = document.documentElement;
    root.classList.add("native-tab-bar");
    return () => {
      root.classList.remove("native-tab-bar");
    };
  }, []);
}

/**
 * 토스트 아래 여백. 네이티브 플로팅 탭 바는 웹뷰 위에 겹쳐 그려져 z-index로 앞지를 수 없으므로,
 * 탭 바가 보이는 라우트에서는 탭 바가 차지하는 높이만큼 띄운다.
 */
export function toastBottomOffset(
  pathname: string,
  hasNativeBridge: boolean,
  nativeTabBar: boolean = hasNativeTabBar(),
): string {
  // 시스템 탭 바는 안전 영역에 자기 높이를 넣으므로 안전 영역 식 하나로 보이는 바와 숨긴 바를 모두 피한다.
  if (
    !hasNativeBridge ||
    nativeTabBar ||
    isFullScreenPath(pathname) ||
    isNativeCoveredPath(pathname)
  ) {
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
  const modalCoversTabBar = useModalOverlayCoversTabBar();

  useEffect(() => {
    const routeHidden = isFullScreenPath(pathname);
    const nativeCovered = isNativeCoveredPath(pathname);
    const visible = !routeHidden && !modalOpen;
    // 플로팅 바에서 바텀시트는 blockedByModal 없이 visible:false만 보내 네이티브가 "hidden"으로 읽게 한다.
    const blockedByModal = modalOpen && !modalCoversTabBar && !routeHidden && !nativeCovered;
    let disposed = false;
    const post = () => {
      postToNative({
        type: "set-tab-bar",
        visible,
        // 이미 탭 바가 없는 화면에서는 보내지 않는다 — 딤을 그리려고 탭 바가 되살아난다.
        ...(blockedByModal ? { blockedByModal: true } : {}),
        atMs: Date.now(),
      });
    };
    // 탭 바는 네이티브가 그려 웹 슬라이드를 따라 움직이지 못한다. 복귀 중에 바로 띄우면
    // 빠져나가는 화면 위에 겹쳐 보이므로 전환이 끝난 뒤 띄운다. 숨김은 새 화면이 덮으므로 즉시다.
    const transition = visible ? pageTransitionFinished() : null;
    if (transition) {
      void transition.then(() => {
        if (!disposed) {
          post();
        }
      });
    } else {
      post();
    }
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
      disposed = true;
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [pathname, modalOpen, modalCoversTabBar]);
}
