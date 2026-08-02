import { useEffect, useRef } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";

import { isFullScreenPath } from "@/lib/nativeTabBar";

/**
 * 포워드 제스처로 전체 화면 라우트(가이드·문의·약관·방침)가 **되열리는** 것을 막는다(BY-343).
 *
 * 웹뷰의 가장자리 스와이프(`allowsBackForwardNavigationGestures`)는 뒤로/앞으로를 **함께**
 * 켠다 — iOS에 앞으로만 끄는 스위치가 없다. 그래서 설정→약관을 열었다 닫으면 약관이
 * 히스토리의 앞(forward)에 남고, 탭 루트에서 왼쪽으로 스와이프하면(=앞으로 가기) 방금 닫은
 * 화면이 다시 열린다. 사용자가 닫은 화면은 닫힌 채여야 한다.
 *
 * ## 왜 이 방식인가
 *
 * - **네이티브에서 못 막는다**: SPA 라우트 전환은 same-document 히스토리 이동이라
 *   `onShouldStartLoadWithRequest`에 아예 오지 않는다.
 * - **forward 스택을 지울 수 없다**: History API에 forward 삭제가 없고, push로 지우면
 *   그 push가 새 뒤로가기 항목으로 남는다.
 * - 그래서 도착한 뒤 되돌린다: **의도된 전체 화면 진입은 항상 PUSH**(설정 행·홈 카드의
 *   `navigate()`)이므로, POP(제스처·브라우저 이동)으로 idx가 **증가**하며 전체 화면 라우트에
 *   도착한 경우만 포워드 제스처다 — 즉시 한 칸 되돌린다. 제스처 애니메이션이 끝난 직후
 *   스냅백하는 모양이 되어 "안 열린다"로 읽힌다.
 *
 * 뒤로 가기(idx 감소)·딥링크/새로고침 직행(첫 렌더)은 건드리지 않는다 —
 * `settingsSubPages.test.tsx`의 딥링크 폴백 시나리오는 그대로 동작한다.
 */

type NavigationType = "POP" | "PUSH" | "REPLACE";

/** 판정만 분리한 순수 함수 — 테스트 대상. */
export function isForwardEntryIntoFullScreen(
  navigationType: NavigationType,
  previousIdx: number,
  currentIdx: number,
  pathname: string,
): boolean {
  return navigationType === "POP" && currentIdx > previousIdx && isFullScreenPath(pathname);
}

function readHistoryIdx(): number {
  // BrowserRouter가 관리하는 스택 깊이 — `ScreenBackHeader`·`closeGuide`와 같은 판단 기준.
  return (window.history.state as { idx?: number } | null)?.idx ?? 0;
}

/** `App`에서 한 번만 마운트한다(`useNativeTabBarSync`와 같은 위치·같은 이유). */
export function useBlockForwardGestureIntoFullScreen(): void {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  // 첫 렌더의 idx로 시작한다 — 딥링크·새로고침 직행이 "포워드 도착"으로 오판되지 않는다.
  const lastIdxRef = useRef(readHistoryIdx());

  useEffect(() => {
    const currentIdx = readHistoryIdx();
    const shouldBounce = isForwardEntryIntoFullScreen(
      navigationType,
      lastIdxRef.current,
      currentIdx,
      location.pathname,
    );
    lastIdxRef.current = currentIdx;
    if (shouldBounce) {
      navigate(-1);
    }
  }, [location, navigationType, navigate]);
}
