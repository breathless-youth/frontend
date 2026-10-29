import { useRef, useState, type MouseEvent, type PointerEvent } from "react";

import { SWIPE_SLOP_PX } from "@/features/study-session/subjectInteractions";
import { haptic } from "@/lib/haptics";

export type SwipeSide = "left" | "right";

/** 화면 왼쪽 끝에서 시작한 누름은 iOS 웹뷰의 뒤로 가기 제스처 몫으로 남긴다. */
const EDGE_GUARD_PX = 24;

/**
 * 카드를 밀어 뒤의 동작 버튼을 드러내는 손짓
 *
 * 왼쪽으로 밀면 오른쪽 동작(`leftWidth`), 오른쪽으로 밀면 왼쪽 동작(`rightWidth`)이 드러나고, 폭이 0인 쪽은 밀리지 않는다.
 * 가로 이동이 세로보다 크고 10px을 넘을 때만 시작해 목록 세로 스크롤과 겹치지 않는다.
 * 손을 뗄 때 드러난 폭이 절반을 넘으면 열린 채 두고, 아니면 닫는다.
 * 민 뒤 따라오는 클릭과 열린 카드를 누른 클릭은 카드 펼침으로 가지 않고 삼킨다.
 */
export function useCardSwipe({
  open,
  leftWidth,
  rightWidth,
  onOpenChange,
}: {
  open: SwipeSide | null;
  leftWidth: number;
  rightWidth: number;
  onOpenChange: (side: SwipeSide | null) => void;
}) {
  const base = open === "left" ? -leftWidth : open === "right" ? rightWidth : 0;
  const [dragX, setDragX] = useState<number | null>(null);
  const dragRef = useRef<{
    x: number;
    y: number;
    base: number;
    horizontal: boolean | null;
    offset: number;
  } | null>(null);
  const swallowClickRef = useRef(false);
  const enabled = leftWidth > 0 || rightWidth > 0;

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    // 민 뒤 클릭이 오지 않는 기기에서 삼킬 표시가 다음 누름까지 남지 않게 한다.
    swallowClickRef.current = false;
    if (
      !enabled ||
      !event.isPrimary ||
      (event.pointerType === "mouse" && event.button !== 0) ||
      event.clientX < EDGE_GUARD_PX
    ) {
      return;
    }
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      base,
      horizontal: null,
      offset: base,
    };
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (drag === null) {
      return;
    }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (drag.horizontal === null) {
      if (Math.abs(dx) < SWIPE_SLOP_PX && Math.abs(dy) < SWIPE_SLOP_PX) {
        return;
      }
      drag.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!drag.horizontal) {
        dragRef.current = null;
        return;
      }
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // 캡처를 못 잡아도 카드 위에서는 계속 밀린다.
      }
    }
    drag.offset = Math.max(-leftWidth, Math.min(rightWidth, drag.base + dx));
    setDragX(drag.offset);
  }

  function onPointerEnd() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.horizontal !== true) {
      return;
    }
    swallowClickRef.current = true;
    setDragX(null);
    const next =
      drag.offset < -leftWidth / 2 ? "left" : drag.offset > rightWidth / 2 ? "right" : null;
    if (next !== null && next !== open) {
      haptic("light");
    }
    onOpenChange(next);
  }

  function onClickCapture(event: MouseEvent<HTMLElement>) {
    if (swallowClickRef.current || open !== null) {
      event.stopPropagation();
      event.preventDefault();
      if (!swallowClickRef.current) {
        onOpenChange(null);
      }
    }
    swallowClickRef.current = false;
  }

  return {
    offset: dragX ?? base,
    dragging: dragX !== null,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onClickCapture,
    },
  };
}
