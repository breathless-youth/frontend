import { cn } from "@/lib/utils";

import { formatElapsed, toKoreanDuration } from "../formatDuration";
import type { SessionStatusPillState } from "./SessionStatusPill";

/**
 * 순공 타이머 + 총 공부 병기 (Figma S3-1 `58:358`~`58:359` · S3-3 `59:359` · S3-4 `60:426`).
 *
 * - 순공 52px는 표준 타이포 스케일 밖이라 Figma 실측값을 그대로 쓴다.
 * - 프리뷰 표시에서는 집중만 흰색이고 나머지(비집중·일시정지)는 회색이다 — 총 공부는 계속
 *   흐르거나(비집중) 함께 멈추므로(일시정지) 어느 쪽이든 병기 색은 바뀌지 않는다.
 * - `glow`(심플 모드)에서는 숫자가 **상태 컬러 + 발광**이 된다(`design.md` 확정: 심플 모드
 *   타이머 색 = 상태 컬러). 발광 실측값은 Figma Spec 페이지 `14:7`:
 *   `0 0 24 (근거리) 55%` + `0 0 60 (원거리) 35%` — 색은 `sessionGlowStyle`이 주입한다.
 * - 하단 캡션은 이 컴포넌트가 아니라 `SessionCaption`이 그린다 — 심플 모드에는 캡션 행 자체가
 *   없어서(S3-4 실측) 타이머와 수명이 다르다.
 * - `tabular-nums`로 초마다 폭이 흔들리지 않게 한다(voice-tone.md §2).
 */
export interface SessionTimerProps {
  /** 순공 시간(초). */
  focusSec: number;
  /** 총 공부 시간(초). */
  studySec: number;
  /** 현재 세션 상태 — 심플 모드의 숫자 색을 결정한다. */
  state: SessionStatusPillState;
  /** 심플 모드(S3-4) 발광. 켜면 숫자가 상태 컬러 + drop-shadow가 된다. */
  glow?: boolean;
  className?: string;
}

const GLOW_TEXT_SHADOW = "0 0 24px var(--session-glow-near), 0 0 60px var(--session-glow-far)";

export function SessionTimer({
  focusSec,
  studySec,
  state,
  glow = false,
  className,
}: SessionTimerProps) {
  return (
    <div className={cn("flex flex-col items-center", className)}>
      <p
        className={cn(
          "text-center text-[52px] leading-[60px] font-bold tracking-[-0.5px] tabular-nums transition-colors duration-200 motion-reduce:transition-none",
          glow
            ? "text-[var(--session-state-color)]"
            : state === "focus"
              ? "text-white"
              : "text-text-tertiary",
        )}
        style={glow ? { textShadow: GLOW_TEXT_SHADOW } : undefined}
      >
        <span aria-hidden="true">{formatElapsed(focusSec)}</span>
        <span className="sr-only">순공시간 {toKoreanDuration(focusSec)}</span>
      </p>
      <p className="mt-[7px] text-center text-[15px] leading-[18px] font-medium text-white/42 tabular-nums">
        <span aria-hidden="true">총 {formatElapsed(studySec)}</span>
        <span className="sr-only">총 공부 시간 {toKoreanDuration(studySec)}</span>
      </p>
    </div>
  );
}
