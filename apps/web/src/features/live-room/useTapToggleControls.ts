import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/**
 * 컨트롤 바 탭 토글(BY-435 디스코드 패턴) — 화면 탭이 바를 올리고, 자동으로 내려가지
 * 않으며, 한 번 더 탭하면 내려간다(종전 4초 유휴 자동 숨김 대체). 입장 직후는 숨김
 * 상태로 시작해 타일만 있는 몰입 화면이다. 잠금(제출 중·에러)·다이얼로그 동안은 항상
 * 보인다. 바 자체 조작은 RoomControlBar가 pointerdown 버블을 끊어 토글로 새지 않는다.
 *
 * `alwaysVisible`는 잠금·다이얼로그처럼 강제로 보여야 하는 구간을 넘긴다.
 */
export function useTapToggleControls(alwaysVisible: boolean) {
  // 입장 직후에는 보인다(2026-08-25 피드백 — 조작법을 먼저 보여준다). 탭으로 내리면
  // 이름·목표도 함께 숨어 시간만 남는 몰입 화면이 된다(RoomTile infoHidden).
  const [controlsShown, setControlsShown] = useState(true);
  const controlsVisible = alwaysVisible || controlsShown;
  // 탭과 스크롤을 구분한다(2026-08-25 피드백) — pointerdown만 보면 스크롤 시작 터치가
  // 토글로 먹혀 "한 번 더 터치해야 스크롤"이 됐다. 눌린 지점에서 거의 움직이지 않고
  // 뗀 경우(≤10px)만 탭으로 인정한다. 스크롤이 포인터를 가져가면 pointerup이 아예
  // 오지 않으므로 자연히 토글되지 않는다.
  const surfacePointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const handleSurfacePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    surfacePointerStartRef.current = { x: event.clientX, y: event.clientY };
  };
  const handleSurfacePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const start = surfacePointerStartRef.current;
    surfacePointerStartRef.current = null;
    if (start === null) {
      return;
    }
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (moved > 10) {
      return;
    }
    // 강제 표시 구간의 탭(다이얼로그 배경 등)이 숨김 상태를 뒤집어 두면, 구간이 끝나는
    // 순간 바가 예고 없이 내려간다 — 토글은 일반 구간에서만 받는다.
    if (!alwaysVisible) {
      setControlsShown((prev) => !prev);
    }
  };
  return {
    controlsVisible,
    onPointerDown: handleSurfacePointerDown,
    onPointerUp: handleSurfacePointerUp,
  };
}
