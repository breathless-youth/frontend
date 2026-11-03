import { useId, useRef, useState } from "react";

import type { MultiTimerControls } from "@/features/multi-timer/useMultiTimer";

/**
 * 공부방 타이머 설정 시트의 열림과 타이머 버튼 누름
 *
 * 타이머 버튼은 설정 시트를 열기만 해서 타이머나 뽀모도로가 도는 동안에는 모드를 건드리지 않는다.
 * 그동안 멈춤과 끄기는 캡슐이 맡아서, 버튼을 누르면 포커스가 캡슐의 멈춤이나 계속 버튼으로 간다.
 * 끝난 기본 타이머는 시작 전 상태로 돌아와 있어 다시 누르면 처음 여는 것처럼 새로 연다.
 * 공부가 끝나면 모드가 꺼지므로 시트도 함께 닫는다.
 */
export function useRoomTimerSheet(timer: MultiTimerControls, studying: boolean) {
  const [open, setOpen] = useState(false);
  if (!studying && open) {
    setOpen(false);
  }
  const capsuleTimerId = useId();
  const capsulePrimaryRef = useRef<HTMLButtonElement>(null);
  const active = timer.mode?.status === "running" || timer.mode?.status === "paused";
  return {
    open,
    /** 타이머나 뽀모도로가 돌거나 멈춰 있다. */
    active,
    /** 캡슐의 남은 시간 요소 id이고, 타이머 버튼이 도는 동안 설명으로 읽는다. */
    capsuleTimerId,
    capsulePrimaryRef,
    pressTimerButton: () => {
      if (active) {
        capsulePrimaryRef.current?.focus();
        return;
      }
      timer.open();
      setOpen(true);
    },
    closeSheet: () => setOpen(false),
  };
}
