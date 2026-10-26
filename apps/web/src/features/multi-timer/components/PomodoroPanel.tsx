import { useState } from "react";

import { formatPomodoroRemaining } from "../multiTimerFormat";
import type { ModeState, PomodoroPhase } from "../multiTimerMachine";
import { BREAK_MIN_LIMIT, FOCUS_MIN_LIMIT } from "../multiTimerSettings";
import { AlarmSoundToggle } from "./AlarmSoundToggle";
import { ModeCard } from "./ModeCard";
import { PomodoroDial } from "./PomodoroDial";
import type { DialTone } from "./PomodoroDial";

const PHASE_LABEL: Record<PomodoroPhase, string> = { focus: "집중 시간", break: "휴식 시간" };

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
    <div className="flex min-h-0 flex-1 flex-col landscape-compact:contents">
      {/* 다이얼과 스위치는 머리 줄과 칸 사이 빈 공간의 세로 가운데에 둔다.
          폰 가로에서는 다이얼이 가운데 무대를 채우고, 스위치는 화면 오른쪽 아래로 간다. */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center landscape-compact:col-start-2 landscape-compact:row-start-2">
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
        {/* 다이얼이 남은 시간을 그려서 숫자는 화면 낭독기에만 남긴다.
            1초마다 읽히지 않도록 aria-live는 걸지 않는다. */}
        <div role="timer" aria-label={setup ? "집중 시간" : "남은 시간"} className="sr-only">
          {formatPomodoroRemaining(setup ? focusMin * 60_000 : remainingMs)}
        </div>
      </div>

      {/* 큰 버튼 바로 위에 두고, 시작한 뒤에도 칸 높이만큼 비워 두어 설정과 진행 화면의 배치가 같다.
          폰 가로에서는 두 칸을 오른쪽 구역의 세로 가운데에 쌓고, 좁은 폰에서는 칸 폭을 줄여 무대와 24px 이상 띄운다.
          폭 672px 미만에서는 무대가 작아져 처음부터 버튼이 칸 바로 아래로 올라오므로, 칸 사이를 좁혀 버튼과도 24px 이상 띄운다. */}
      <div className="flex h-19.5 shrink-0 flex-col justify-end pb-2 landscape-compact:col-start-3 landscape-compact:row-span-full landscape-compact:h-auto landscape-compact:w-[min(168px,calc(100%-24px))] landscape-compact:self-center landscape-compact:justify-self-end landscape-compact:pb-0">
        {setup && (
          <div className="flex gap-3 landscape-compact:flex-col landscape-compact:gap-4 landscape-compact:max-[42rem]:gap-2.5">
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
    </div>
  );
}
