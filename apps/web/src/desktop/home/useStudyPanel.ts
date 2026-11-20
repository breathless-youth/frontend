import {
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type PointerEvent,
  type SetStateAction,
} from "react";

const STORAGE_KEY = "focusmakers.pc.studyPanel";

/** 패널이 상자 가장자리에서 떨어져 있어야 하는 거리 */
export const PANEL_INSET = 16;
const KEY_STEP = 16;
const KEY_BIG_STEP = 64;

// 오른쪽 위 모서리 기준이라 왼쪽으로 옮기면 right가 커진다.
const ARROWS: Partial<Record<string, readonly [right: number, top: number]>> = {
  ArrowLeft: [1, 0],
  ArrowRight: [-1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** 패널 자리와 접힘. 자리는 상자 오른쪽 위 모서리에서 떨어진 거리다. */
export interface StudyPanelState {
  right: number;
  top: number;
  minimized: boolean;
}

export const DEFAULT_STUDY_PANEL: StudyPanelState = { right: 24, top: 24, minimized: false };

interface Size {
  width: number;
  height: number;
}

/**
 * 상자 안쪽으로 당긴 패널 자리
 *
 * 그려지기 전이라 상자 크기가 0이면 잴 수 없어 받은 자리를 그대로 둔다.
 * 상자가 패널보다 작으면 오른쪽 위 여백을 지킨다.
 */
export function clampPanelPosition(
  position: { right: number; top: number },
  box: Size,
  panel: Size,
): { right: number; top: number } {
  if (box.width === 0 || box.height === 0) return position;
  const maxRight = Math.max(PANEL_INSET, box.width - panel.width - PANEL_INSET);
  const maxTop = Math.max(PANEL_INSET, box.height - panel.height - PANEL_INSET);
  return {
    right: Math.min(Math.max(position.right, PANEL_INSET), maxRight),
    top: Math.min(Math.max(position.top, PANEL_INSET), maxTop),
  };
}

/**
 * 저장한 패널 자리 읽기
 *
 * 값이 깨졌거나 저장소를 못 쓰면 기본 자리로 연다.
 */
function readStudyPanel(): StudyPanelState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const value: unknown = raw === null ? null : JSON.parse(raw);
    if (typeof value === "object" && value !== null) {
      const { right, top, minimized } = value as Record<string, unknown>;
      if (
        typeof right === "number" &&
        Number.isFinite(right) &&
        typeof top === "number" &&
        Number.isFinite(top) &&
        typeof minimized === "boolean"
      ) {
        return { right, top, minimized };
      }
    }
  } catch {
    // 깨진 값과 막힌 저장소는 아래 기본 자리로 돌린다.
  }
  return DEFAULT_STUDY_PANEL;
}

function writeStudyPanel(state: StudyPanelState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 저장소가 막혀도 이번 화면에서는 옮긴 자리를 그대로 쓴다.
  }
}

interface PanelPosition {
  right: number;
  top: number;
}

function keepInside(panel: HTMLElement | null, position: PanelPosition): PanelPosition {
  const box = panel?.parentElement;
  if (!panel || !box) return position;
  return clampPanelPosition(position, box.getBoundingClientRect(), panel.getBoundingClientRect());
}

/**
 * 보이는 자리 맞추기
 *
 * 저장 자리를 지금 상자 안쪽으로 당겨 보이는 자리로 둔다.
 * 같은 자리면 다시 그리지 않는다.
 */
function showInside(
  panel: HTMLElement | null,
  saved: PanelPosition,
  setShown: Dispatch<SetStateAction<PanelPosition>>,
) {
  const next = keepInside(panel, saved);
  setShown((current) =>
    current.right === next.right && current.top === next.top ? current : next,
  );
}

/**
 * 공부시간 패널의 자리·접힘·끌기
 *
 * 끌기는 머리줄에 포인터를 붙잡아 커서가 머리줄을 벗어나도 놓을 때까지 따라오게 한다.
 * 사용자가 둔 자리와 화면에 보이는 자리를 따로 든다.
 * 창 크기나 패널 높이가 바뀌면 보이는 자리만 사용자가 둔 자리에서 다시 계산해, 줄었다가 다시 늘면 원래 자리로 돌아간다.
 * 패널 높이는 오류 문구나 늦게 받은 내용으로도 바뀌어서 창 크기와 함께 패널 크기도 지켜본다.
 * 저장은 사용자가 옮기거나 접을 때만 한다.
 */
export function useStudyPanel() {
  // 콜백 ref로 받은 요소를 상태로 들어, 그려진 뒤 크기를 재는 effect가 요소가 바뀔 때도 다시 돈다.
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [state, setState] = useState(readStudyPanel);
  const [shown, setShown] = useState<PanelPosition>(() => ({
    right: state.right,
    top: state.top,
  }));
  // 크기 감시는 패널이 바뀔 때만 다시 걸고, 감시 콜백은 이 ref로 최신 저장 자리를 읽는다.
  // 끄는 동안 저장 자리가 포인터가 움직일 때마다 바뀌어 effect가 감시를 매번 다시 만들지 않게 한다.
  // 옮기거나 접을 때는 그려지기 전에 바로 바꿔, 놓을 때 저장하는 값이 늘 마지막 자리다.
  const savedRef = useRef(state);
  const dragStart = useRef<{
    pointerId: number;
    x: number;
    y: number;
    right: number;
    top: number;
  } | null>(null);

  // 사용자가 옮기거나 접으면 그려진 뒤 보이는 자리를 다시 잰다.
  useLayoutEffect(() => {
    savedRef.current = state;
    showInside(panel, state, setShown);
  }, [panel, state]);

  useLayoutEffect(() => {
    const pullIn = () => showInside(panel, savedRef.current, setShown);
    window.addEventListener("resize", pullIn);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(pullIn);
    if (panel) observer?.observe(panel);
    return () => {
      window.removeEventListener("resize", pullIn);
      observer?.disconnect();
    };
  }, [panel]);

  function commit(next: StudyPanelState) {
    savedRef.current = next;
    setState(next);
    writeStudyPanel(next);
  }

  // 옮긴 자리는 지금 상자 안쪽으로 당긴 값을 사용자가 둔 자리로 삼는다.
  function moveTo(right: number, top: number): StudyPanelState {
    return { ...state, ...keepInside(panel, { right, top }) };
  }

  function endDrag(event: PointerEvent<HTMLElement>) {
    if (dragStart.current?.pointerId !== event.pointerId) return;
    dragStart.current = null;
    // 마지막 움직임이 아직 그려지지 않았을 수 있어 렌더 때 잡힌 상태가 아니라 방금 옮긴 자리를 저장한다.
    writeStudyPanel(savedRef.current);
  }

  return {
    ref: setPanel,
    right: shown.right,
    top: shown.top,
    minimized: state.minimized,
    toggleMinimized: () => commit({ ...state, minimized: !state.minimized }),
    handleProps: {
      onPointerDown(event: PointerEvent<HTMLElement>) {
        // 머리줄 안 접기 버튼을 누른 것은 끌기가 아니라 그 버튼의 동작이다.
        if (event.button !== 0) return;
        if (event.target instanceof Element && event.target.closest("button")) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragStart.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          right: shown.right,
          top: shown.top,
        };
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        const start = dragStart.current;
        if (start === null || start.pointerId !== event.pointerId) return;
        const next = moveTo(
          start.right - (event.clientX - start.x),
          start.top + (event.clientY - start.y),
        );
        savedRef.current = next;
        setState(next);
      },
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      // 브라우저가 붙잡기를 거둬 가면 놓기 이벤트가 오지 않아 여기서도 끌기를 끝내고 저장한다.
      onLostPointerCapture: endDrag,
      onKeyDown(event: KeyboardEvent<HTMLElement>) {
        const arrow = ARROWS[event.key];
        // 접기 버튼에 포커스가 있을 때의 방향키는 버튼 몫이라 머리줄 자체에서만 옮긴다.
        if (arrow === undefined || event.target !== event.currentTarget) return;
        event.preventDefault();
        const step = event.shiftKey ? KEY_BIG_STEP : KEY_STEP;
        commit(moveTo(shown.right + arrow[0] * step, shown.top + arrow[1] * step));
      },
    },
  };
}
