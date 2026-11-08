import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { SWIPE_SLOP_PX } from "@/features/study-session/subjectInteractions";
import { sessionSurfaceStyle } from "@/features/study-session/sessionTheme";
import { useHoldAndDrag } from "./usePlannerSubjectDrag";

/** 과목 머리만 끌기 시작점으로 사용해 할 일의 체크·편집·스크롤을 보존한다. */
export function SessionSubjectDrag({
  subjectId,
  order,
  disabled,
  lifted,
  className,
  children,
  onMenu,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
}: {
  subjectId: number;
  order?: number;
  disabled: boolean;
  lifted: boolean;
  className: string;
  children: ReactNode;
  onMenu: () => void;
  onDragStart: () => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: () => void;
  onDragCancel: () => void;
}) {
  const [gesture, setGesture] = useState(false);
  const [preview, setPreview] = useState<{ rect: DOMRect; dx: number; dy: number } | null>(null);
  const pointer = useRef<{ id: number; x: number; y: number; rect: DOMRect } | null>(null);
  const cancelled = useRef(false);
  const heldClick = useRef(false);
  const showMenu = useRef(false);
  const cancelRef = useRef(onDragCancel);
  useEffect(() => {
    cancelRef.current = onDragCancel;
  });
  const { elementRef, handlers } = useHoldAndDrag({
    onLongPress() {
      heldClick.current = true;
      showMenu.current = true;
    },
    onDragStart() {
      if (!pointer.current) return;
      showMenu.current = false;
      setPreview({ rect: pointer.current.rect, dx: 0, dy: 0 });
      onDragStart();
    },
    onDragMove(x, y) {
      const start = pointer.current;
      if (!start || cancelled.current) return;
      setPreview({ rect: start.rect, dx: x - start.x, dy: y - start.y });
      onDragMove(x, y);
    },
    onDragEnd() {
      if (cancelled.current) onDragCancel();
      else onDragEnd();
    },
  });
  useEffect(() => {
    if (!gesture) return;
    const element = elementRef.current;
    function cancel() {
      if (pointer.current)
        element?.dispatchEvent(
          new PointerEvent("pointercancel", {
            bubbles: true,
            pointerId: pointer.current.id,
          }),
        );
    }
    function keyDown(event: KeyboardEvent) {
      if (event.key === "Escape") cancel();
    }
    function visibilityChange() {
      if (document.hidden) cancel();
    }
    function outsidePointer(event: PointerEvent) {
      if (
        pointer.current?.id === event.pointerId &&
        event.target instanceof Node &&
        !element?.contains(event.target)
      )
        cancel();
    }
    window.addEventListener("blur", cancel);
    // hold 전 캡처를 피해서 정상 클릭·스크롤을 보존하되 바깥에서 끝난 포인터도 정리한다.
    document.addEventListener("pointermove", outsidePointer, true);
    document.addEventListener("pointerup", outsidePointer, true);
    document.addEventListener("pointercancel", outsidePointer, true);
    document.addEventListener("keydown", keyDown);
    document.addEventListener("visibilitychange", visibilityChange);
    return () => {
      window.removeEventListener("blur", cancel);
      document.removeEventListener("pointermove", outsidePointer, true);
      document.removeEventListener("pointerup", outsidePointer, true);
      document.removeEventListener("pointercancel", outsidePointer, true);
      document.removeEventListener("keydown", keyDown);
      document.removeEventListener("visibilitychange", visibilityChange);
      const current = pointer.current;
      pointer.current = null;
      if (current) {
        if (element?.hasPointerCapture?.(current.id)) element.releasePointerCapture(current.id);
        cancelRef.current();
      }
    };
  }, [elementRef, gesture]);
  function finish() {
    const current = pointer.current;
    pointer.current = null;
    setPreview(null);
    setGesture(false);
    if (current && elementRef.current?.hasPointerCapture?.(current.id))
      elementRef.current.releasePointerCapture(current.id);
  }
  return (
    <>
      <div
        ref={elementRef}
        data-subject-id={subjectId}
        style={{ order }}
        className={cn(className, lifted && "opacity-35")}
        onContextMenu={handlers.onContextMenu}
        onPointerDownCapture={(event) => {
          if (
            !event.isPrimary ||
            (event.pointerType === "mouse" && event.button !== 0) ||
            !(event.target instanceof Element) ||
            !event.currentTarget.contains(event.target)
          )
            return;
          // 취소된 끌기에서 click이 오지 않아도 다음 새 터치는 정상적으로 받는다.
          heldClick.current = false;
          if (
            disabled ||
            !event.target.closest("[data-session-subject-head]") ||
            event.target.closest("button")
          )
            return;
          event.stopPropagation();
          cancelled.current = false;
          heldClick.current = false;
          showMenu.current = false;
          pointer.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            rect: event.currentTarget.getBoundingClientRect(),
          };
          setGesture(true);
          handlers.onPointerDown(event);
        }}
        onPointerMoveCapture={(event) => {
          const start = pointer.current;
          if (!start || event.pointerId !== start.id) return;
          event.stopPropagation();
          if (
            Math.abs(event.clientX - start.x) >= SWIPE_SLOP_PX ||
            Math.abs(event.clientY - start.y) >= SWIPE_SLOP_PX
          )
            heldClick.current = true;
          handlers.onPointerMove(event);
        }}
        onPointerUpCapture={(event) => {
          if (!pointer.current || event.pointerId !== pointer.current.id) return;
          event.stopPropagation();
          handlers.onPointerUp(event);
          const menu = showMenu.current;
          finish();
          if (menu) onMenu();
        }}
        onPointerCancelCapture={(event) => {
          if (!pointer.current || event.pointerId !== pointer.current.id) return;
          event.stopPropagation();
          cancelled.current = true;
          heldClick.current = true;
          showMenu.current = false;
          handlers.onPointerCancel(event);
          finish();
        }}
        onLostPointerCapture={(event) => {
          if (
            event.target !== event.currentTarget ||
            !pointer.current ||
            event.pointerId !== pointer.current.id
          )
            return;
          cancelled.current = true;
          heldClick.current = true;
          showMenu.current = false;
          handlers.onPointerCancel(event);
          finish();
        }}
        onClickCapture={(event) => {
          if (
            heldClick.current &&
            event.detail !== 0 &&
            event.target instanceof Element &&
            event.currentTarget.contains(event.target)
          ) {
            heldClick.current = false;
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        {children}
      </div>
      {preview &&
        createPortal(
          <div
            aria-hidden
            inert
            data-testid="session-subject-drag-preview"
            className={cn(className, "theme-dark pointer-events-none fixed z-[100] shadow-xl")}
            style={{
              ...sessionSurfaceStyle,
              left: preview.rect.left,
              top: preview.rect.top,
              width: preview.rect.width,
              transform: `translate3d(${preview.dx}px, ${preview.dy}px, 0)`,
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
