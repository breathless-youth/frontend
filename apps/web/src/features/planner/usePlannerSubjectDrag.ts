import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { LONG_PRESS_MS, SWIPE_SLOP_PX } from "@/features/study-session/subjectInteractions";
import { haptic } from "@/lib/haptics";

/**
 * 과목 머리의 길게 누르기와, 누른 채 끌기.
 *
 * 길게 누르면 메뉴가 뜨고(`onLongPress`), 손을 떼지 않고 움직이면 순서 끌기로 넘어간다(`onDragStart` →
 * `onDragMove` → `onDragEnd`). 길게 누르기 전의 움직임은 페이지 스크롤이라 취소한다.
 */
export function useHoldAndDrag(handlers: {
  onLongPress: () => void;
  onDragStart: () => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: () => void;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [pressed, setPressed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef<{ x: number; y: number; held: boolean; dragging: boolean } | null>(null);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  function clearTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => {
    const element = elementRef.current;
    if (element === null) return;
    // 길게 누른 뒤의 끌기가 페이지 스크롤로 넘어가지 않게 한다. `touch-action`은 터치가 시작될 때
    // 정해져 중간에 바꿀 수 없어서, 길게 누르기가 발화한 뒤의 touchmove만 막는다.
    function blockScroll(event: TouchEvent) {
      if (stateRef.current?.held === true) {
        event.preventDefault();
      }
    }
    element.addEventListener("touchmove", blockScroll, { passive: false });
    return () => {
      element.removeEventListener("touchmove", blockScroll);
      clearTimer();
    };
  }, []);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    const element = event.currentTarget;
    const pointerId = event.pointerId;
    const state = { x: event.clientX, y: event.clientY, held: false, dragging: false };
    stateRef.current = state;
    clearTimer();
    setPressed(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      state.held = true;
      setPressed(false);
      try {
        element.setPointerCapture(pointerId);
      } catch {
        // 캡처를 못 잡아도 메뉴는 뜬다 — 끌기만 머리 밖에서 끊긴다.
      }
      haptic("medium");
      handlersRef.current.onLongPress();
    }, LONG_PRESS_MS);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const state = stateRef.current;
    if (state === null) return;
    const moved =
      Math.abs(event.clientX - state.x) >= SWIPE_SLOP_PX ||
      Math.abs(event.clientY - state.y) >= SWIPE_SLOP_PX;
    if (!state.held) {
      if (moved) {
        clearTimer();
        setPressed(false);
        stateRef.current = null;
      }
      return;
    }
    if (!state.dragging) {
      if (!moved) return;
      state.dragging = true;
      handlersRef.current.onDragStart();
    }
    handlersRef.current.onDragMove(event.clientX, event.clientY);
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    clearTimer();
    setPressed(false);
    const state = stateRef.current;
    stateRef.current = null;
    if (state?.dragging === true) {
      // 끌다 놓은 것이 날짜 넘김 스와이프로 읽히지 않게 한다.
      event.stopPropagation();
      handlersRef.current.onDragEnd();
    }
  }

  return {
    elementRef,
    pressed,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      // Android 길게 누르기 컨텍스트 메뉴 차단.
      onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
    },
  };
}
