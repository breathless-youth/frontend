import { useSyncExternalStore } from "react";

import { detectStorePlatform } from "@/features/social-room/storeLink";

// iOS 26 iPhone 17에서 떠 있는 입력 보조 막대는 508~556pt에 그려졌지만 보이는 영역이 531pt까지 잡혀서 막대 윗부분 약 23pt가 키보드 높이에서 빠졌다.
const IOS_ACCESSORY_BAR_UNCOUNTED_HEIGHT = 24;

function subscribe(onChange: () => void): () => void {
  const viewport = window.visualViewport;
  if (!viewport) {
    return () => {};
  }
  // 키보드가 올라오면 보이는 영역의 높이가 줄고, 그 상태로 페이지가 밀리면 위치만 바뀐다.
  viewport.addEventListener("resize", onChange);
  viewport.addEventListener("scroll", onChange);
  return () => {
    viewport.removeEventListener("resize", onChange);
    viewport.removeEventListener("scroll", onChange);
  };
}

function readInset(): number {
  const viewport = window.visualViewport;
  if (!viewport) {
    return 0;
  }
  // 입력 칸이 화면 전체를 덮는 창 안에 있으면 iOS 웹뷰가 문서를 밀어 올리고 그 거리를 offsetTop에도 싣는다.
  // 그때 창 아래 끝은 문서와 함께 올라가 있어서 offsetTop을 빼면 밀린 만큼 버튼이 덜 올라온다.
  // 문서가 밀린 거리를 뺀 값만 보이는 영역이 창 안에서 내려온 거리로 본다.
  const offsetTop =
    typeof viewport.pageTop === "number" ? viewport.pageTop - window.scrollY : viewport.offsetTop;
  // 보이는 영역이 창보다 크게 잡히는 순간에도 버튼이 화면 아래로 내려가지 않게 0에서 멈춘다.
  const inset = Math.max(0, Math.round(window.innerHeight - viewport.height - offsetTop));
  const ios = detectStorePlatform(navigator.userAgent, navigator.maxTouchPoints) === "ios";
  return inset > 0 && ios ? inset + IOS_ACCESSORY_BAR_UNCOUNTED_HEIGHT : inset;
}

const serverInset = () => 0;

/**
 * 가상 키보드가 가린 화면 아래 높이(px)
 *
 * iOS 웹뷰는 키보드가 올라와도 레이아웃 높이가 그대로라 창 높이와 보이는 영역의 차이로 측정한다.
 * iOS의 떠 있는 입력 보조 막대는 윗부분이 보이는 영역 안에 잡혀서 키보드가 올라와 있을 때만 그 높이를 더한다.
 * Android 웹뷰는 키보드만큼 창이 줄면 차이가 0이고, 창이 그대로인 화면에서는 차이가 키보드 높이라서 따로 나누지 않는다.
 * `visualViewport`가 없는 웹뷰에서는 0이라 버튼이 화면 아래에 그대로 남는다.
 */
export function useKeyboardInset(): number {
  return useSyncExternalStore(subscribe, readInset, serverInset);
}
