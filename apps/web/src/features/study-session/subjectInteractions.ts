import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { haptic } from "@/lib/haptics";

import type { SubjectsStore } from "./useSubjects";

/**
 * 과목·할 일 목록을 손으로 다루는 공용 로직 — 세션 과목 시트(S3-9)와 플래너(S12)가 같이 쓴다.
 * 두 화면은 생김새만 다르고 인터랙션과 API가 같다.
 */

export const MAX_SUBJECTS = 20;
export const MAX_TASKS = 30;
export const LONG_PRESS_MS = 480;
export const SWIPE_SLOP_PX = 10;
/** 이만큼 왼쪽으로 밀고 놓으면 제거된다(원본 96). 최대 이동은 160. */
export const SWIPE_REMOVE_PX = 96;
const SWIPE_MAX_PX = 160;

/**
 * 탭 · 길게 누르기 · (선택) 왼쪽 스와이프를 한 요소에서 가른다(원본 `rowDown`/`taskMove`).
 *
 * 길게 누르기가 발화하거나 스와이프로 판정되면 뒤따르는 `click`은 삼킨다. 스와이프는 가로
 * 이동이 세로보다 크고 10px을 넘을 때만 시작한다 — 목록 세로 스크롤과 겹치지 않도록
 * 사용처가 `touch-action: pan-y`를 준다.
 */
export function usePressGestures(handlers: {
  onTap: () => void;
  onLongPress: (element: HTMLElement) => void;
  onSwipeLeft?: () => void;
}) {
  const [swipeX, setSwipeX] = useState(0);
  /** 손가락이 닿아 있는 동안 — 행이 눌린 모양을 보여 길게 누르기가 먹히고 있음을 알린다. */
  const [pressed, setPressed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef<{ startX: number; startY: number; swiping: boolean } | null>(null);
  const consumedRef = useRef(false);

  function clearTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    const element = event.currentTarget;
    consumedRef.current = false;
    stateRef.current = { startX: event.clientX, startY: event.clientY, swiping: false };
    clearTimer();
    setPressed(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      consumedRef.current = true;
      stateRef.current = null;
      setPressed(false);
      haptic("medium");
      handlers.onLongPress(element);
    }, LONG_PRESS_MS);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const state = stateRef.current;
    if (state === null) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.swiping) {
      if (Math.abs(dx) < SWIPE_SLOP_PX && Math.abs(dy) < SWIPE_SLOP_PX) return;
      // 어느 쪽이든 움직였으면 길게 누르기는 아니다.
      clearTimer();
      setPressed(false);
      if (handlers.onSwipeLeft === undefined || Math.abs(dx) <= Math.abs(dy)) {
        stateRef.current = null;
        return;
      }
      state.swiping = true;
      consumedRef.current = true;
    }
    setSwipeX(Math.max(-SWIPE_MAX_PX, Math.min(0, dx)));
  }

  function onPointerEnd() {
    clearTimer();
    setPressed(false);
    const state = stateRef.current;
    stateRef.current = null;
    if (state?.swiping === true) {
      if (swipeX <= -SWIPE_REMOVE_PX) {
        haptic("light");
        handlers.onSwipeLeft?.();
      }
      setSwipeX(0);
    }
  }

  function onClick() {
    if (consumedRef.current) {
      consumedRef.current = false;
      return;
    }
    handlers.onTap();
  }

  useEffect(() => clearTimer, []);

  return {
    swipeX,
    pressed,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onPointerLeave: onPointerEnd,
      onClick,
      // Android 길게 누르기 컨텍스트 메뉴 차단(iOS는 `.session-no-drag`의 touch-callout이 막는다).
      onContextMenu: (event: ReactMouseEvent<HTMLElement>) => event.preventDefault(),
    },
  };
}

/**
 * 인라인 이름 입력의 상태와 확정 규칙 — Enter·`완료`는 확정, Escape는 취소, 포커스 이탈은 내용이 있으면
 * 확정이다. 비었거나 처음 값 그대로면 취소로 친다. 한 번 끝난 입력은 다시 확정되지 않는다.
 */
export function useInlineNameEdit({
  initial = "",
  onCommit,
  onCancel,
}: {
  initial?: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const doneRef = useRef(false);
  function commit() {
    if (doneRef.current) return;
    doneRef.current = true;
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed === initial) {
      onCancel();
    } else {
      onCommit(trimmed);
    }
  }
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      commit();
    } else if (event.key === "Escape") {
      doneRef.current = true;
      onCancel();
    }
  }
  return { value, setValue, commit, handleKeyDown };
}

/**
 * 손가락 아래에 있는 과목의 id — 과목 블록은 `data-subject-id`를 단다. 포인터 캡처 중에도
 * `elementFromPoint`는 손가락 아래 요소를 돌려준다. 끄는 과목 자신 위이거나 과목 밖이면 null이다
 * (호출부가 "같은 과목 반복" 가드를 푼다).
 */
export function subjectIdUnderPoint(x: number, y: number, selfId: number): number | null {
  const under = document.elementFromPoint(x, y);
  const block = under?.closest<HTMLElement>("[data-subject-id]") ?? null;
  const overId = block === null ? Number.NaN : Number(block.dataset.subjectId);
  return Number.isFinite(overId) && overId !== selfId ? overId : null;
}

/**
 * 과목 순서 끌기 — 끄는 동안 지나는 과목과 자리를 바꾸고(화면에만), 놓을 때 순서가 달라졌으면 저장한다.
 */
export function useSubjectReorder(store: SubjectsStore) {
  const [reorderingId, setReorderingId] = useState<number | null>(null);
  /**
   * 마지막으로 자리를 바꾼 상대 과목. 리렌더 전에 같은 과목 위에서 pointermove가 연달아 오면
   * 순서가 왔다 갔다 하므로 한 번만 바꾸고, 손가락이 자기 자리로 돌아오면(null) 다시 연다.
   */
  const lastOverRef = useRef<number | null>(null);

  return {
    reorderingId,
    start(subjectId: number) {
      lastOverRef.current = null;
      setReorderingId(subjectId);
      store.startReorder();
    },
    over(subjectId: number, overId: number | null) {
      if (overId === null) {
        lastOverRef.current = null;
        return;
      }
      if (lastOverRef.current === overId) return;
      lastOverRef.current = overId;
      store.reorderSubject(subjectId, overId);
      // 햅틱은 누를 때가 아니라 다른 과목과 자리가 바뀌는 순간에(실기기 피드백).
      haptic("light");
    },
    end() {
      lastOverRef.current = null;
      setReorderingId(null);
      // pointercancel도 여기로 온다 — 화면에 보이는 순서가 곧 저장되는 순서다.
      void store.commitReorder();
    },
  };
}
