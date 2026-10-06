import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * 스와이프 커밋 임계(px) — 온보딩 가이드의 스텝 스와이프(`coachOverlayTheme.SWIPE_THRESHOLD_PX`)와
 * 같은 값이다. 앱 안의 가로 스와이프 감각을 하나로 맞춘다 — 공유 상수로 승격하지 않는 이유는
 * 온보딩과 기록이 서로 import하지 않는 경계를 지키기 위해서다(우연히 같은 값일 뿐 한쪽을 조정할
 * 때 다른 쪽이 따라가야 한다는 계약이 아직 없다).
 */
const SWIPE_THRESHOLD_PX = 48;

/**
 * 기간 넘김 스와이프(기록 탭의 달·주, 플래너의 날짜) — 왼쪽으로 밀면 1(다음), 오른쪽으로 밀면 -1(이전)을 넘긴다.
 *
 * 온보딩 가이드 탭 레이어와 같은 판정(시작점 기록 → 놓는 순간 총 이동량)이다. 안쪽 버튼 위에서
 * 시작한 드래그도 부모(pointerup 버블)로 올라와 잡히고, 임계 미만의 탭은 그 버튼의 클릭으로 남는다.
 * 세로 위주 움직임은 페이지 스크롤 몫이다 — 가로 우세일 때만 스와이프로 본다. 받는 요소에
 * `touch-pan-y`를 줘야 iOS가 가로 드래그를 스크롤로 집어 pointercancel을 내지 않는다.
 */
export function useHorizontalSwipe(onSwipe: (delta: -1 | 1) => void) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      startRef.current = { x: event.clientX, y: event.clientY };
    },
    // 브라우저가 제스처를 가져가면(스크롤 등) 시작점을 버린다 — 다음 pointerup이 옛 시작점으로 판정하지 않게.
    onPointerCancel: () => {
      startRef.current = null;
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      const start = startRef.current;
      startRef.current = null;
      if (!start) {
        return;
      }
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) {
        return;
      }
      onSwipe(dx < 0 ? 1 : -1);
    },
  };
}
