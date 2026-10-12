import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * 손잡이를 놓았을 때 닫히는 거리
 *
 * 이만큼 이상 내려와 있으면 닫고, 덜 내렸으면 제자리로 돌아간다.
 */
const DISMISS_THRESHOLD_PX = 80;
/**
 * 시트 퇴장 키프레임 길이
 *
 * `ui/sheet.tsx`의 `duration-300`과 같다.
 */
const SHEET_CLOSE_MS = 300;

/**
 * 바닥 시트 손잡이
 *
 * 잡고 끌면 시트가 손가락을 따라 내려오고, 충분히 내린 채 놓으면 닫힌다.
 * 시트 요소는 가장 가까운 dialog로 찾는다(Radix Content가 그 역할을 단다).
 * 보이는 막대는 작지만 잡는 영역은 시트 위 여백과 아래 간격까지 음수 마진으로 넓혀 레이아웃은 그대로다.
 * 막대 모양은 시트마다 달라 호출부가 준다.
 */
export function SheetHandle({
  onDismiss,
  barClassName,
  testId,
}: {
  onDismiss: () => void;
  barClassName: string;
  testId?: string;
}) {
  const startYRef = useRef<number | null>(null);

  function sheetOf(event: ReactPointerEvent<HTMLDivElement>) {
    return event.currentTarget.closest<HTMLElement>('[role="dialog"]');
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const sheet = sheetOf(event);
    if (sheet === null) {
      return;
    }
    startYRef.current = event.clientY;
    // 손가락이 손잡이를 벗어나도 move와 up을 계속 받는다.
    event.currentTarget.setPointerCapture(event.pointerId);
    // 시트에 걸린 transition이 끌리는 동안 transform을 늦추지 않게 끈다.
    sheet.style.transition = "none";
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const sheet = sheetOf(event);
    if (startYRef.current === null || sheet === null) {
      return;
    }
    sheet.style.transform = `translateY(${Math.max(0, event.clientY - startYRef.current)}px)`;
  }

  /**
   * 제자리 복귀
   *
   * 끄는 동안 덮어쓴 값을 비워 시트에 원래 걸린 transition으로 돌아가게 한다.
   */
  function settleBack(sheet: HTMLElement) {
    sheet.style.transition = "";
    sheet.style.transform = "";
  }

  // 시스템이 제스처를 가로챈 것(전화·알림 등)이라 사용자가 놓은 게 아니다.
  // 얼마나 내려왔든 닫지 않고 되돌린다.
  function handlePointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    startYRef.current = null;
    const sheet = sheetOf(event);
    if (sheet !== null) {
      settleBack(sheet);
    }
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const startY = startYRef.current;
    startYRef.current = null;
    const sheet = sheetOf(event);
    if (startY === null || sheet === null) {
      return;
    }
    const dy = Math.max(0, event.clientY - startY);
    if (dy >= DISMISS_THRESHOLD_PX) {
      // 퇴장 키프레임은 `to`만 있어 지금 위치에서 이어 내려간다.
      // 남은 거리만큼 시간을 줄여 다 내려간 뒤 굼뜨게 남지 않게 한다.
      const remaining = Math.max(0.3, 1 - dy / sheet.offsetHeight);
      sheet.style.animationDuration = `${Math.round(SHEET_CLOSE_MS * remaining)}ms`;
      onDismiss();
      return;
    }
    settleBack(sheet);
  }

  return (
    // `touch-none`: 세로 드래그를 iOS가 스크롤로 집어 pointercancel을 내지 않게 한다.
    <div
      aria-hidden="true"
      data-testid={testId}
      className="-mt-3 -mb-4 flex touch-none justify-center pt-3 pb-4"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div className={barClassName} />
    </div>
  );
}
