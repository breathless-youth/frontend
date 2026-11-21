import { useSyncExternalStore } from "react";

import { detectStorePlatform } from "@/features/social-room/storeLink";
import { isNativeBridgeAvailable } from "@/lib/bridge";

// 상자 안 PC 화면이 겹치지 않고 그려지는 가장 좁은 폭이다.
const WIDE_ENOUGH_QUERY = "(min-width: 60rem)";

function subscribeWidth(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(WIDE_ENOUGH_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function readNarrow() {
  return typeof window.matchMedia === "function" && !window.matchMedia(WIDE_ENOUGH_QUERY).matches;
}

// 주 입력이 손가락뿐인 기기. 터치 화면이 달린 노트북은 주 입력이 트랙패드라 맞지 않는다.
const TOUCH_ONLY_QUERY = "(hover: none) and (pointer: coarse)";

/**
 * 휴대폰·태블릿이 아닌 기기인지
 *
 * 크롬 계열은 userAgentData.mobile로 휴대폰을 알려 주고, 나머지는 스토어 판별과 같은 사용자 에이전트 규칙으로 가른다.
 * iPadOS Safari는 맥과 같은 사용자 에이전트를 보내서 그 규칙이 멀티터치 지원으로 가른다.
 * 데스크톱 사이트 모드의 Android 태블릿과 태블릿 모드의 Windows·ChromeOS는 PC 사용자 에이전트를 보내서, 주 입력이 손가락뿐이면 PC로 보지 않는다.
 */
export function isPcDevice(): boolean {
  const data = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (data?.mobile === true) return false;
  if (typeof window.matchMedia === "function" && window.matchMedia(TOUCH_ONLY_QUERY).matches) {
    return false;
  }
  return detectStorePlatform(navigator.userAgent, navigator.maxTouchPoints) === null;
}

/**
 * PC 셸을 그릴지 판정
 *
 * 앱 밖의 PC 기기는 창 폭과 상관없이 PC 화면이고, 좁은 창은 셸이 덮개로 가린다.
 * 폭으로 갈랐을 때는 창을 줄이면 공부 중인 홈이 휴대폰 화면으로 바뀌며 세션이 사라졌다.
 * 앱 웹뷰는 태블릿 가로에서도 네이티브 탭 바가 있어 모바일 화면을 쓴다.
 * 테스트 환경처럼 matchMedia가 없는 곳은 지금처럼 모바일 화면으로 둔다.
 */
export function usePcShell(): boolean {
  return typeof window.matchMedia === "function" && isPcDevice() && !isNativeBridgeAvailable();
}

/**
 * PC 화면을 그리기에 창이 좁은지
 *
 * 창 크기를 바꾸면 미디어 쿼리 변경을 구독해 새로고침 없이 바로 바뀐다.
 */
export function useNarrowPcWindow(): boolean {
  return useSyncExternalStore(subscribeWidth, readNarrow);
}
