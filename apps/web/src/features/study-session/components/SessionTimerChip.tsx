import { Pause, Play, Timer, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatPomodoroRemaining } from "@/features/multi-timer/multiTimerFormat";
import type { ModeState } from "@/features/multi-timer/multiTimerMachine";
import { cn } from "@/lib/utils";

// 보이는 원은 작아도 누르는 자리는 44px이 되게 넓힌다.
const CHIP_BUTTON =
  "relative flex size-7 shrink-0 items-center justify-center rounded-full text-white before:absolute before:-inset-2 before:content-[''] active:opacity-80 focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none";

/**
 * 싱글룸 추가 타이머·스톱워치 칩
 *
 * 하단 바 위에 40px 높이로 떠서 지금 도는 타이머나 스톱워치를 보여 준다.
 * 타이머는 이름을 누르면 시간을 고르는 시트를 다시 열고, 남은 시간 옆에 전체 시간을 함께 쓴다.
 * 세션이 멈춘 동안에는 시간도 서 있어서 버튼은 계속이다.
 * 화면 탭은 심플 모드 전환이라 칩 누름이 거기까지 올라가지 않게 끊는다.
 */
export function SessionTimerChip({
  mode,
  displayMs,
  held,
  onOpen,
  onPrimary,
  onOff,
}: {
  mode: ModeState;
  /** 타이머는 남은 시간, 스톱워치는 흐른 시간 */
  displayMs: number;
  /** 세션이 멈춰 시간도 서 있다. */
  held: boolean;
  /** 타이머 시트를 연다. 스톱워치는 열 시트가 없다. */
  onOpen: () => void;
  onPrimary: () => void;
  onOff: () => void;
}) {
  const { t } = useTranslation("study-session");
  const stopwatch = mode.kind === "stopwatch";
  const running = mode.status === "running" && !held;
  const name = stopwatch ? t("timerChip.stopwatch") : t("timerChip.timer");
  const label = (
    <>
      <Timer aria-hidden="true" className="size-4 shrink-0 text-white/70" />
      <span className="text-sm leading-5 font-medium whitespace-nowrap text-white/70">{name}</span>
    </>
  );
  return (
    <div
      role="group"
      aria-label={t("timerChip.group")}
      onPointerDown={(event) => event.stopPropagation()}
      className="pointer-events-auto flex h-10 items-center gap-2.5 rounded-full bg-(--session-pill-bg) pr-1.5 pl-3.5 shadow-[0_10px_24px_rgba(0,0,0,0.35)] backdrop-blur-[11px]"
    >
      {stopwatch ? (
        <span className="flex items-center gap-2.5">{label}</span>
      ) : (
        <button
          type="button"
          aria-label={t("timerChip.open")}
          onClick={onOpen}
          className="flex items-center gap-2.5 focus-visible:outline-none"
        >
          {label}
        </button>
      )}
      {/* 1초마다 읽히지 않도록 aria-live는 걸지 않는다. */}
      <span
        role="timer"
        aria-label={stopwatch ? t("timerChip.elapsed") : t("timerChip.remaining")}
        className="text-base leading-5 font-semibold whitespace-nowrap text-white tabular-nums"
      >
        {/* 남은 시간 표기는 초를 올리므로 스톱워치는 지난 초까지만 세도록 먼저 내린다. */}
        {formatPomodoroRemaining(stopwatch ? Math.floor(displayMs / 1000) * 1000 : displayMs)}
      </span>
      {!stopwatch && (
        <span className="text-xs leading-4 whitespace-nowrap text-white/42 tabular-nums">
          {t("timerChip.total", {
            total: formatPomodoroRemaining(mode.settings.timerSec * 1000),
          })}
        </span>
      )}
      <span className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label={running ? t("timerChip.pause") : t("timerChip.resume")}
          onClick={onPrimary}
          className={cn(CHIP_BUTTON, "bg-white/10")}
        >
          {running ? (
            <Pause aria-hidden="true" fill="currentColor" strokeWidth={0} className="size-3.5" />
          ) : (
            <Play aria-hidden="true" fill="currentColor" strokeWidth={0} className="size-3.5" />
          )}
        </button>
        <button
          type="button"
          aria-label={t("timerChip.off")}
          onClick={onOff}
          className={CHIP_BUTTON}
        >
          <X aria-hidden="true" strokeWidth={2.2} className="size-3.5" />
        </button>
      </span>
    </div>
  );
}
