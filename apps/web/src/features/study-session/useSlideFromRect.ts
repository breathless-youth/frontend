import { type RefObject, useLayoutEffect } from "react";

import { prefersReducedMotion } from "@/lib/prefersReducedMotion";

/**
 * 자리가 바뀐 요소를 바뀌기 직전 자리에서 미끄러져 오게 한다
 *
 * 자리는 레이아웃(flex 칸·위치 클래스)으로 바뀌어 CSS 전환이 걸리지 않는다.
 * 그래서 호출부가 바꾸기 직전 자리를 `beforeRef`에 재 두면, `trigger`가 바뀐 뒤 그 차이만큼 되돌린 모습부터 300ms 동안 풀어 준다.
 * 카메라 창·심플 화면의 300ms 페이드와 같은 박자다. 모션 줄이기면 바로 옮긴다.
 */
export function useSlideFromRect(
  ref: RefObject<HTMLElement | null>,
  beforeRef: RefObject<DOMRect | null>,
  trigger: unknown,
): void {
  useLayoutEffect(() => {
    const before = beforeRef.current;
    beforeRef.current = null;
    const element = ref.current;
    if (before === null || element === null || typeof element.animate !== "function") return;
    if (prefersReducedMotion()) return;
    const after = element.getBoundingClientRect();
    if (after.width === 0) return;
    const scale = before.width / after.width;
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(scale - 1) < 0.01) return;
    element.animate(
      [
        { transformOrigin: "top left", transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
        { transformOrigin: "top left", transform: "none" },
      ],
      { duration: 300, easing: "ease-out" },
    );
  }, [ref, beforeRef, trigger]);
}
