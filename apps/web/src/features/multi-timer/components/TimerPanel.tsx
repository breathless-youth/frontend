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
    <div className="flex flex-1 items-center justify-center landscape-compact:contents">
      {/* 휠 높이의 상자에 스위치를 붙여 휠이 남은 시간으로 바뀌어도 스위치는 같은 자리에 있다.
          폰 가로에서는 상자를 풀어 휠은 가운데 무대에 두고, 스위치는 화면 오른쪽 아래로 간다. */}
      <div className="relative flex h-75 w-full items-center justify-center landscape-compact:contents">
        {/* 폰 가로에서는 다이얼과 같은 무대를 차지해 아래 모서리 버튼이 모드를 바꿔도 같은 자리에 있다. */}
        <div className="flex w-full items-center justify-center landscape-compact:col-start-2 landscape-compact:row-start-2 landscape-compact:size-full">
          {/* 좁은 가로 폰에서는 1배 휠이 오른쪽 위 토글과 겹치고 낮은 가로 폰에서는 높이가 모자라, 폭과 높이에 따라 휠을 0.8, 0.9, 1배로 그린다.
              0.9배는 664×320 이상(iPhone SE 가로 667×375), 1배는 704×344 이상(접는 폰 가로와 일반 폰 가로)에서 쓴다.
              휠은 끌 때 그려진 높이로 환산해서 줄여도 손가락을 그대로 따라간다.
              남은 시간 숫자는 측정 화면 가로 숫자와 같은 크기가 되도록 휠 크기와 상관없이 0.85배로 그린다. */}
          <div
            className={cn(
              "flex w-full justify-center landscape-compact:w-87 landscape-compact:shrink-0",
              mode.status === "setup"
                ? "landscape-compact:scale-80 landscape-compact:[@media(width>=41.5rem)_and_(height>=20rem)]:scale-90 landscape-compact:[@media(width>=44rem)_and_(height>=21.5rem)]:scale-100"
                : "landscape-compact:scale-85",
            )}
          >
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
          </div>
        </div>
        <AlarmSoundToggle
          soundOn={soundOn}
          onChangeSoundOn={onChangeSoundOn}
          className="absolute right-0 bottom-0"
        />
      </div>
    </div>
  );
}
