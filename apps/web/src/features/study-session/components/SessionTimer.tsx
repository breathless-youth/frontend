import { cn } from "@/lib/utils";

import { formatElapsed, toKoreanDuration } from "../formatDuration";
import { PRIVACY_CAPTION } from "../sessionCopy";

/**
 * 순공 타이머 + 총 공부 병기 + 프라이버시 캡션 (Figma S3-1 `58:358`~`58:360`).
 *
 * - 순공 52px는 표준 타이포 스케일 밖이라 Figma 실측값을 그대로 쓴다.
 * - `dimmed`(비집중)에서는 순공만 회색이 된다 — 총 공부는 계속 흐르므로 색이 바뀌지 않는다.
 * - `tabular-nums`로 초마다 폭이 흔들리지 않게 한다(voice-tone.md §2).
 */
export interface SessionTimerProps {
  /** 순공 시간(초). */
  focusSec: number;
  /** 총 공부 시간(초). */
  studySec: number;
  /** 비집중·일시정지 등 순공이 멈춘 상태에서 true. */
  dimmed?: boolean;
  className?: string;
}

export function SessionTimer({ focusSec, studySec, dimmed = false, className }: SessionTimerProps) {
  return (
    <div className={cn("flex flex-col items-center", className)}>
      <p
        className={cn(
          "text-center text-[52px] leading-[60px] font-bold tracking-[-0.5px] tabular-nums transition-colors duration-200",
          dimmed ? "text-text-tertiary" : "text-white",
        )}
      >
        <span aria-hidden="true">{formatElapsed(focusSec)}</span>
        <span className="sr-only">순공시간 {toKoreanDuration(focusSec)}</span>
      </p>
      <p className="mt-[7px] text-center text-[15px] leading-[18px] font-medium text-white/42 tabular-nums">
        <span aria-hidden="true">총 {formatElapsed(studySec)}</span>
        <span className="sr-only">총 공부 시간 {toKoreanDuration(studySec)}</span>
      </p>
      <p className="mt-[8px] text-center text-[12px] leading-[14px] text-white/55">
        {PRIVACY_CAPTION}
      </p>
    </div>
  );
}
