import type { Ref } from "react";

import { cn } from "@/lib/utils";

import type { SessionStatusPillState } from "./SessionTimer";

/** 점 색은 예전 상태 필 테두리와 같은 변수를 써서 상태 색이 한곳에서만 정해진다. */
const DOT_COLOR = {
  focus: "var(--session-pill-border-focus)",
  distract: "var(--session-pill-border-distract)",
  paused: "var(--session-pill-border-paused)",
} as const satisfies Record<SessionStatusPillState, string>;

export interface SessionStatusLineProps {
  state: SessionStatusPillState;
  label: string;
  /** 화면에서는 숨기되 화면 읽기 알림은 남긴다. 심플 모드가 쓴다. */
  concealed?: boolean;
  /** 같은 화면에 진짜 줄이 따로 있어 알림을 내면 안 되는 자리는 false다. */
  live?: boolean;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

/**
 * 시계 위 상태 줄
 *
 * 문구만 시계 가운데 축에 맞추고 점은 문구 왼쪽 바깥에 붙인다.
 * 점을 폭에 넣으면 문구가 점과 간격의 절반만큼 오른쪽으로 밀려 시계와 어긋난다.
 * 자동 감지로 상태가 바뀌므로 알림 영역으로 읽힌다.
 */
export function SessionStatusLine({
  state,
  label,
  concealed = false,
  live = true,
  className,
  ref,
}: SessionStatusLineProps) {
  return (
    <div
      ref={ref}
      {...(live ? { role: "status", "aria-live": "polite" as const } : { "aria-hidden": true })}
      className={cn(
        concealed
          ? "sr-only"
          : "relative text-center text-[13px] leading-4 font-medium text-balance break-keep text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.5)]",
        className,
      )}
    >
      {!concealed && (
        <span
          aria-hidden="true"
          data-testid="status-dot"
          className="absolute top-1/2 right-[calc(100%+6px)] size-2 -translate-y-1/2 rounded-full"
          style={{ backgroundColor: DOT_COLOR[state] }}
        />
      )}
      {label}
    </div>
  );
}
