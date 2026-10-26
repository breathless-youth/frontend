import { useState } from "react";

import { cn } from "@/lib/utils";

import { formatPomodoroRemaining } from "../multiTimerFormat";
import type { ModeState, PomodoroPhase } from "../multiTimerMachine";
import { BREAK_MIN_LIMIT, FOCUS_MIN_LIMIT } from "../multiTimerSettings";
import { AlarmSoundToggle } from "./AlarmSoundToggle";
import { ModeCard } from "./ModeCard";
import { PomodoroDial } from "./PomodoroDial";
import type { DialTone } from "./PomodoroDial";

const PHASE_LABEL: Record<PomodoroPhase, string> = { focus: "집중 시간", break: "휴식 시간" };

const TIME_TONE_CLASS: Record<DialTone, string> = {
  focus: "text-(--session-mode-focus)",
  break: "text-(--session-mode-break)",
  distract: "text-state-distract",
};

/**
 * 뽀모도로 모드 본문
 *
 * 설정 중에는 집중·휴식 칸과 고른 칸의 다이얼을, 시작한 뒤에는 남은 시간을 그린다.
 * 헤더와 큰 버튼은 모드 화면이 그린다.
 */
export function PomodoroPanel({
  mode,
  remainingMs,
  distracted,
  onChangeSettings,
  soundOn,
  onChangeSoundOn,
}: {
  mode: ModeState;
  remainingMs: number;
  distracted: boolean;
  onChangeSettings: (patch: { focusMin?: number; breakMin?: number }) => void;
  soundOn: boolean;
  onChangeSoundOn: (on: boolean) => void;
}) {
  const [selected, setSelected] = useState<PomodoroPhase>("focus");

  const { focusMin, breakMin } = mode.settings;
  const setup = mode.status === "setup";
  const phase = setup ? selected : mode.phase;
  const selectedMinutes = selected === "focus" ? focusMin : breakMin;
  // 휴식 중에는 감지가 멈추지만, 혹시 비집중이 남아 있어도 휴식 색이 이긴다.
  const tone: DialTone = phase === "break" ? "break" : !setup && distracted ? "distract" : "focus";

  const changeSelected = (minutes: number) => {
    onChangeSettings(selected === "focus" ? { focusMin: minutes } : { breakMin: minutes });
  };

  return (
    // 내용 높이보다 줄어들 수 있어야 키 작은 폰에서 큰 버튼을 밀어내지 않는다.
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 시작한 뒤에도 칸 높이만큼 비워 두어 다이얼이 위로 움직이지 않는다. */}
      <div className="h-19.5 shrink-0">
        {setup && (
          <div className="flex gap-3">
            <ModeCard
              kind="focus"
              minutes={focusMin}
              max={FOCUS_MIN_LIMIT.max}
              selected={selected === "focus"}
              onSelect={() => setSelected("focus")}
              onChangeMinutes={(minutes) => onChangeSettings({ focusMin: minutes })}
            />
            <ModeCard
              kind="break"
              minutes={breakMin}
              max={BREAK_MIN_LIMIT.max}
              selected={selected === "break"}
              onSelect={() => setSelected("break")}
              onChangeMinutes={(minutes) => onChangeSettings({ breakMin: minutes })}
            />
          </div>
        )}
      </div>

      {/* 아래 여백은 시간 자리를 그대로 두고 다이얼만 올려 스위치 줄이 들어갈 틈을 만든다. */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center pb-4">
        <PomodoroDial
          minutes={setup ? selectedMinutes : remainingMs / 60_000}
          tone={tone}
          interactive={setup}
          label={PHASE_LABEL[phase]}
          limit={phase === "focus" ? FOCUS_MIN_LIMIT : BREAK_MIN_LIMIT}
          onChange={changeSelected}
        />
        <AlarmSoundToggle
          soundOn={soundOn}
          onChangeSoundOn={onChangeSoundOn}
          className="self-end"
        />
        {/* 1초마다 읽히지 않도록 aria-live는 걸지 않는다. */}
        <div
          role="timer"
          aria-label={setup ? "집중 시간" : "남은 시간"}
          className={cn(
            "mt-2.5 text-[52px] leading-15 font-bold tracking-[-0.5px] tabular-nums",
            setup ? "text-foreground" : TIME_TONE_CLASS[tone],
          )}
        >
          {formatPomodoroRemaining(setup ? focusMin * 60_000 : remainingMs)}
        </div>
      </div>
    </div>
  );
}
