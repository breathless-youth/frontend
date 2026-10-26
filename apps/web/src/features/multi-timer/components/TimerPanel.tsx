import { cn } from "@/lib/utils";

import { formatTimerRemaining } from "../multiTimerFormat";
import type { ModeState } from "../multiTimerMachine";
import { AlarmSoundToggle } from "./AlarmSoundToggle";
import { TimerWheel } from "./TimerWheel";

export function TimerPanel({
  mode,
  remainingMs,
  distracted,
  onChangeTimerSec,
  soundOn,
  onChangeSoundOn,
}: {
  mode: ModeState;
  remainingMs: number;
  distracted: boolean;
  onChangeTimerSec: (sec: number) => void;
  soundOn: boolean;
  onChangeSoundOn: (on: boolean) => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center">
      {/* 휠 높이의 상자에 스위치를 붙여 휠이 남은 시간으로 바뀌어도 스위치는 같은 자리에 있다. */}
      <div className="relative flex h-75 w-full items-center justify-center">
        {mode.status === "setup" ? (
          <TimerWheel valueSec={mode.settings.timerSec} onChange={onChangeTimerSec} />
        ) : (
          // 1초마다 읽히지 않도록 aria-live는 걸지 않는다.
          <div
            role="timer"
            aria-label="남은 시간"
            className={cn(
              "text-[52px] leading-15 font-bold tracking-[-0.5px] tabular-nums",
              distracted ? "text-state-distract" : "text-(--session-mode-focus)",
            )}
          >
            {formatTimerRemaining(remainingMs)}
          </div>
        )}
        <AlarmSoundToggle
          soundOn={soundOn}
          onChangeSoundOn={onChangeSoundOn}
          className="absolute right-0 bottom-0"
        />
      </div>
    </div>
  );
}
