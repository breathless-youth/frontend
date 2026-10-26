import type { PointerEvent as ReactPointerEvent } from "react";

import { prefersReducedMotion } from "@/lib/prefersReducedMotion";

/**
 * 바 버튼 눌림 팝
 *
 * 싱글룸과 같은 눌림 감각을 탭마다 확실하게 준다.
 * :active 스케일은 WKWebView의 짧은 탭에서 스치듯 지나가 안 보일 수 있어 JS로 보강한다.
 */
export function playPressPop(event: ReactPointerEvent<HTMLButtonElement>) {
  const button = event.currentTarget;
  if (typeof button.animate !== "function" || prefersReducedMotion()) {
    return;
  }
  button.animate(
    [{ transform: "scale(1)" }, { transform: "scale(0.88)" }, { transform: "scale(1)" }],
    { duration: 220, easing: "ease-out" },
  );
}
