import { useEffect, useRef, useState, type FocusEvent, type PointerEvent } from "react";

export const AUTO_HIDE_MS = 5000;

/**
 * 룸 조작 자동 숨김
 *
 * 화면 탭은 조작을 보이거나 바로 숨기고, 마지막 조작 뒤 5초가 지나면 저절로 숨긴다.
 * 바와 더보기의 누름은 그쪽에서 버블을 끊으므로 캡처 단계에서만 보고 숨김 시간을 새로 센다.
 * 강제 표시나 키보드 포커스로 붙잡힌 동안은 타이머를 돌리지 않고, 풀리면 보이는 상태에서 다시 센다.
 * 반환한 surfaceProps는 세션 화면 루트에 걸고, 포커스를 붙잡을 조작 영역에는 data-room-controls 속성을 단다.
 */
export function useAutoHideControls(alwaysVisible: boolean) {
  const [hidden, setHidden] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const [interactions, setInteractions] = useState(0);
  const held = alwaysVisible || focusInside;

  // 숨은 채 붙잡히면 풀리는 순간 예고 없이 숨은 상태로 돌아가므로 붙잡힘이 바뀔 때마다 보이는 상태로 되돌린다.
  const [prevHeld, setPrevHeld] = useState(held);
  if (held !== prevHeld) {
    setPrevHeld(held);
    setHidden(false);
  }

  useEffect(() => {
    if (held || hidden) {
      return;
    }
    const timer = setTimeout(() => setHidden(true), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [held, hidden, interactions]);

  // iOS WebKit은 메뉴나 다이얼로그가 닫힐 때 스크립트로 돌아온 포커스도 터치 뒤에 :focus-visible로 쳐서 마지막 입력 수단을 따로 기억한다.
  const keyboardModalityRef = useRef(false);

  // 숨은 조작은 inert라 키보드로는 들어갈 수 없으므로 아무 키 입력이나 조작을 다시 부른다.
  useEffect(() => {
    const onKeyDown = () => {
      keyboardModalityRef.current = true;
      setHidden(false);
      setInteractions((count) => count + 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // 스크롤을 시작한 터치가 토글로 먹히지 않게 거의 움직이지 않고 뗀 누름만 탭으로 인정한다.
  // 스크롤이 포인터를 가져가면 pointerup이 오지 않아 토글되지 않는다.
  const pressStartRef = useRef<{ x: number; y: number } | null>(null);

  return {
    controlsVisible: held || !hidden,
    surfaceProps: {
      onPointerDownCapture: () => {
        keyboardModalityRef.current = false;
        setInteractions((count) => count + 1);
      },
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        pressStartRef.current = { x: event.clientX, y: event.clientY };
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => {
        const start = pressStartRef.current;
        pressStartRef.current = null;
        if (start === null) {
          return;
        }
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) {
          return;
        }
        // 다이얼로그 배경 같은 강제 표시 구간의 탭까지 받으면 구간이 끝날 때 조작이 예고 없이 숨는다.
        if (!held) {
          setHidden((prev) => !prev);
        }
      },
      // 탭으로 버튼이 받은 포커스까지 붙잡으면 조작이 숨지 않으므로 키보드 포커스만 본다.
      onFocus: (event: FocusEvent<HTMLElement>) => {
        setFocusInside(
          keyboardModalityRef.current && event.target.closest("[data-room-controls]") !== null,
        );
      },
      onBlur: () => setFocusInside(false),
    },
  };
}
