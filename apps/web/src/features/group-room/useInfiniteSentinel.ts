import { useEffect, useEffectEvent, useState } from "react";

/**
 * 목록 끝 감지 칸
 *
 * 돌려준 ref를 목록 맨 끝 요소에 달면 그 요소가 화면에 들어올 때마다 `onReach`를 부른다.
 * 다음 쪽을 받는 동안 다시 부르지 않는 일은 `onReach`가 맡고, 받다 실패해도 칸이 화면을 벗어났다 다시 들어오면 또 부른다.
 * IntersectionObserver가 없는 엔진에서는 아무것도 하지 않는다.
 */
export function useInfiniteSentinel(
  onReach: () => void,
  enabled: boolean,
): (node: HTMLElement | null) => void {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const reach = useEffectEvent(onReach);

  useEffect(() => {
    if (!enabled || node === null || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        reach();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, node]);

  return setNode;
}
