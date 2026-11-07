import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

const CLOSE_DISTANCE = 64;
const TAP_SLOP = 8;
const TAP_MAX_MS = 350;
function viewportMax() {
  return Math.max(
    0,
    Math.floor(
      Math.min(window.innerHeight, window.visualViewport?.height ?? window.innerHeight) - 52,
    ),
  );
}
const neverBlocked = () => false;

/** 기록 편집기의 비모달 패널만 조절한다. 시간표 포인터와 저장 동작은 건드리지 않는다. */
export function useRecordPanelGesture({
  disabled,
  onDismiss,
  isDismissBlocked = neverBlocked,
  getHeightLimit,
}: {
  disabled: boolean;
  onDismiss: () => void;
  isDismissBlocked?: () => boolean;
  getHeightLimit?: () => number;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const drag = useRef<{
    id: number;
    startY: number;
    baseHeight: number;
  } | null>(null);
  const outside = useRef<{ id: number; x: number; y: number; at: number; moved: boolean } | null>(
    null,
  );
  const [offsetY, setOffsetY] = useState(0);
  const [maxHeight, setMaxHeight] = useState(viewportMax);
  const [dragging, setDragging] = useState(false);
  const blocked = () => disabled || isDismissBlocked();

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const measure = () => {
      const limit = Math.max(
        0,
        Math.floor(Math.min(viewportMax(), getHeightLimit?.() ?? Infinity)),
      );
      setMaxHeight(limit);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [getHeightLimit]);

  useEffect(() => {
    const update = () => {
      const nextMax = Math.max(
        0,
        Math.floor(Math.min(viewportMax(), getHeightLimit?.() ?? Infinity)),
      );
      drag.current = null;
      setDragging(false);
      setOffsetY(0);
      setMaxHeight(nextMax);
    };
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [getHeightLimit]);
  useEffect(
    () => () => {
      drag.current = null;
      outside.current = null;
    },
    [],
  );

  useEffect(() => {
    function pointerDown(event: PointerEvent) {
      outside.current = null;
      if (blocked() || event.isPrimary === false || event.button !== 0) return;
      const target = event.target;
      if (
        !(target instanceof Element) ||
        panelRef.current?.contains(target) ||
        target.closest("[data-record], [data-handle], [data-record-select]")
      )
        return;
      outside.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        at: Date.now(),
        moved: false,
      };
    }
    function pointerMove(event: PointerEvent) {
      const press = outside.current;
      if (
        press?.id === event.pointerId &&
        Math.hypot(event.clientX - press.x, event.clientY - press.y) >= TAP_SLOP
      )
        press.moved = true;
    }
    function pointerUp(event: PointerEvent) {
      const press = outside.current;
      if (!press || press.id !== event.pointerId) return;
      outside.current = null;
      if (
        blocked() ||
        press.moved ||
        Date.now() - press.at > TAP_MAX_MS ||
        Math.hypot(event.clientX - press.x, event.clientY - press.y) >= TAP_SLOP
      )
        return;
      const target = event.target;
      if (target instanceof Node && panelRef.current?.contains(target)) return;
      onDismiss();
    }
    const cancel = () => {
      outside.current = null;
    };
    function keyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented && !blocked()) {
        event.preventDefault();
        onDismiss();
      }
    }
    document.addEventListener("pointerdown", pointerDown, true);
    document.addEventListener("pointermove", pointerMove, true);
    document.addEventListener("pointerup", pointerUp, true);
    document.addEventListener("pointercancel", cancel, true);
    document.addEventListener("lostpointercapture", cancel, true);
    document.addEventListener("scroll", cancel, true);
    document.addEventListener("keydown", keyDown);
    const blur = () => {
      cancel();
      cancelDrag();
    };
    window.addEventListener("blur", blur);
    return () => {
      document.removeEventListener("pointerdown", pointerDown, true);
      document.removeEventListener("pointermove", pointerMove, true);
      document.removeEventListener("pointerup", pointerUp, true);
      document.removeEventListener("pointercancel", cancel, true);
      document.removeEventListener("lostpointercapture", cancel, true);
      document.removeEventListener("scroll", cancel, true);
      document.removeEventListener("keydown", keyDown);
      window.removeEventListener("blur", blur);
    };
  });

  function cancelDrag() {
    drag.current = null;
    setDragging(false);
    setOffsetY(0);
  }
  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (blocked() || event.isPrimary === false || event.button !== 0) return;
    const baseHeight = panelRef.current?.getBoundingClientRect().height ?? 0;
    drag.current = {
      id: event.pointerId,
      startY: event.clientY,
      baseHeight,
    };
    setDragging(true);
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* 취소되거나 사라진 포인터는 닫기로 취급하지 않는다. */
    }
  }
  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    if (blocked()) {
      cancelDrag();
      return;
    }
    setOffsetY(Math.max(0, Math.min(current.baseHeight, event.clientY - current.startY)));
    event.preventDefault();
  }
  function onPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    if (blocked()) {
      cancelDrag();
      return;
    }
    drag.current = null;
    setDragging(false);
    setOffsetY(0);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* 이미 해제된 캡처다. */
    }
    if (event.clientY - current.startY >= CLOSE_DISTANCE) onDismiss();
  }
  function onPointerCancel(event: ReactPointerEvent<HTMLButtonElement>) {
    if (drag.current?.id === event.pointerId) cancelDrag();
  }
  function onLostPointerCapture(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.target === event.currentTarget && drag.current?.id === event.pointerId) cancelDrag();
  }
  function onClick(event: ReactMouseEvent<HTMLButtonElement>) {
    // Pointer release is handled above; keyboard/assistive activation closes directly.
    if (event.detail === 0 && !blocked()) onDismiss();
  }
  return {
    panelRef,
    offsetY,
    maxHeight,
    dragging,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onLostPointerCapture,
      onClick,
    },
  };
}
