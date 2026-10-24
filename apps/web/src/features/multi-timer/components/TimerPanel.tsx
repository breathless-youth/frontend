import { cn } from "@/lib/utils";

import { formatTimerRemaining } from "../multiTimerFormat";
import type { ModeState } from "../multiTimerMachine";
import { TimerWheel } from "./TimerWheel";

export function TimerPanel({
  mode,
  remainingMs,
  distracted,
  onChangeTimerSec,
}: {
  mode: ModeState;
  remainingMs: number;
  distracted: boolean;
  onChangeTimerSec: (sec: number) => void;
}) {
  if (mode.status === "setup") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <TimerWheel valueSec={mode.settings.timerSec} onChange={onChangeTimerSec} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      {/* 1초마다 읽히지 않도록 aria-live는 걸지 않는다. */}
      <div
        role="timer"
        aria-label="남은 시간"
        className={cn(
          "text-[68px] leading-19 font-bold tracking-[-1px] tabular-nums",
          distracted ? "text-state-distract" : "text-(--session-mode-focus)",
        )}
      >
        {formatTimerRemaining(remainingMs)}
      </div>
    </div>
  );
}
