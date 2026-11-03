import { Pause, Play, Timer, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Ref } from "react";

import { formatPomodoroRemaining } from "@/features/multi-timer/multiTimerFormat";
import type { ModeState } from "@/features/multi-timer/multiTimerMachine";
import { cn } from "@/lib/utils";

// 보이는 원은 작아도 누르는 자리는 44px이 되게 넓힌다.
const CAPSULE_BUTTON =
  "relative flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white before:absolute before:-inset-1.5 before:content-[''] active:opacity-80 focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none";

/**
 * 공부방 타이머 캡슐
 *
 * 타이머가 도는 동안 시트를 닫고 남은 시간과 멈춤, 끄기만 아래 바 가까이에 남긴다.
 * 남은 시간은 두 모드 모두 시 자리를 필요할 때만 쓴다.
 * 뽀모도로는 타이머 아이콘 대신 지금 단계를 글자로 쓰고 휴식은 초록이다.
 * 카메라를 꺼 공부방이 멈춘 동안에는 시간도 서 있어서 버튼은 계속이고, 누르면 공부방을 다시 시작하는 길을 연다.
 * 화면 탭은 조작을 숨기고 보이는 토글이라 캡슐 누름이 거기까지 올라가지 않게 끊는다.
 */
export function RoomTimerCapsule({
  mode,
  remainingMs,
  held,
  timerId,
  primaryRef,
  onPrimary,
  onOff,
}: {
  mode: ModeState;
  remainingMs: number;
  /** 카메라를 꺼 공부방이 멈춰 있어 타이머 시간도 서 있다. */
  held: boolean;
  /** 타이머 버튼이 설명으로 읽는 남은 시간 요소의 id */
  timerId?: string;
  /** 타이머 버튼을 누르면 포커스가 오는 멈춤이나 계속 버튼 */
  primaryRef?: Ref<HTMLButtonElement>;
  onPrimary: () => void;
  onOff: () => void;
}) {
  const { t } = useTranslation("live-room");
  const pomodoro = mode.kind === "pomodoro";
  const onBreak = pomodoro && mode.phase === "break";
  const running = mode.status === "running" && !held;
  return (
    <div
      data-testid="room-timer-capsule"
      data-phase={pomodoro ? mode.phase : undefined}
      onPointerDown={(event) => event.stopPropagation()}
      className="pointer-events-auto flex h-12 items-center gap-2.5 rounded-full bg-(--session-pill-bg) pr-2 pl-4 text-white shadow-[0px_10px_24px_var(--session-bar-glass-shadow)] backdrop-blur-[11px]"
    >
      {pomodoro ? (
        <span
          className={cn(
            "text-[13px] leading-4 font-bold",
            onBreak ? "text-(--session-mode-break)" : "text-(--state-focus)",
          )}
        >
          {onBreak ? t("roomTimerCapsule.phase.break") : t("roomTimerCapsule.phase.focus")}
        </span>
      ) : (
        <Timer aria-hidden="true" className="size-4.5 shrink-0" />
      )}
      {/* 1초마다 읽히지 않도록 aria-live는 걸지 않는다. */}
      <span
        id={timerId}
        role="timer"
        aria-label={t("roomTimerCapsule.aria.remaining")}
        className="text-lg leading-6 font-extrabold tabular-nums"
      >
        {formatPomodoroRemaining(remainingMs)}
      </span>
      <button
        ref={primaryRef}
        type="button"
        aria-label={running ? t("roomTimerCapsule.aria.pause") : t("roomTimerCapsule.aria.resume")}
        onClick={onPrimary}
        className={CAPSULE_BUTTON}
      >
        {running ? (
          <Pause
            data-testid="icon-pause"
            aria-hidden="true"
            fill="currentColor"
            strokeWidth={0}
            className="size-4"
          />
        ) : (
          <Play
            data-testid="icon-play"
            aria-hidden="true"
            fill="currentColor"
            strokeWidth={0}
            className="size-4"
          />
        )}
      </button>
      <button
        type="button"
        aria-label={t("roomTimerCapsule.aria.off")}
        onClick={onOff}
        className={CAPSULE_BUTTON}
      >
        <X aria-hidden="true" strokeWidth={2.2} className="size-4" />
      </button>
    </div>
  );
}
