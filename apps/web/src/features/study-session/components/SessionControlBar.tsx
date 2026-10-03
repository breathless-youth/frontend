import type { ReactNode } from "react";
import { LogOut, Pause, Play } from "lucide-react";
import { type VariantProps } from "class-variance-authority";

import { Button } from "@/components/ui/button";
import { controlButtonVariants } from "@/features/study-session/components/controlButtonVariants";
import { cn } from "@/lib/utils";

/**
 * 세션 하단 컨트롤 바 (Figma V2 `S1b · 싱글 공부 세션` control-bar, 212×76 · 버튼 54px).
 *
 * V1.4에서는 세로(50px)·가로(44px) 두 크기를 나눠 그렸지만 V2 시안은 세로·가로 모두
 * 같은 212×76 바에 54px 버튼 하나만 쓴다 — 그래서 크기 variant 축을 없앴다.
 *
 * S3-3(일시정지)에서 첫 버튼이 파란 재개 버튼으로 바뀐다. 나머지 두 버튼은 일시정지
 * 중에도 활성이다. 심플 모드에서는 카메라 전환만 비활성이다(`flipDisabled`, BY-336).
 *
 * 이 컴포넌트가 탭-투-심플 영역에서 제외되는 hit area 경계를 책임진다 —
 * `pointer-events-auto`로 바 위 클릭이 뒤의 전체화면 탭 레이어에 닿지 않게 한다.
 */

/**
 * 컨트롤 바 컨테이너 — 값은 시맨틱 토큰(`bg-bg-layer-2`/`border-border`)이 아니라 `index.css`의
 * `--session-bar-glass-*`/`--session-btn-default-*` 전용 변수에서 온다(Figma V2 `S1b`
 * control-bar 실측). 세션은 항상 다크라 이 변수에는 다크 값만 있다 — 세션 루트의 `theme-dark` 밖에서는 풀리지 않는다.
 */
const SESSION_CONTROL_BAR_CLASS =
  "pointer-events-auto relative flex items-center justify-center gap-[14px] rounded-full bg-[var(--session-bar-glass-bg)] p-[10px] backdrop-blur-[11px] shadow-[0px_10px_30px_var(--session-bar-glass-shadow),inset_0px_1px_0px_var(--session-bar-glass-highlight)]";

/** 아이콘 팝 애니메이션 — 마운트·아이콘 교체(일시정지↔재개)마다 한 번 재생된다(BY-435 모션). */
const ICON_POP_CLASS = "animate-[control-icon-pop_220ms_ease-out] motion-reduce:animate-none";

/** 54px 버튼 기준 아이콘 크기 — Figma V2 `S1b` 실측으로 네 아이콘 모두 23px 동일하다. */
const CONTROL_ICON_SIZE = "size-[23px]";

export interface SessionControlBarProps {
  /** 일시정지 상태면 첫 버튼이 파란 '다시 시작'으로 바뀐다. */
  paused: boolean;
  onTogglePause: () => void;
  onRequestExit: () => void;
  className?: string;
}

interface ControlButtonProps {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  variant?: VariantProps<typeof controlButtonVariants>["variant"];
}

function ControlButton({ label, icon, onClick, variant = "default" }: ControlButtonProps) {
  return (
    <Button
      type="button"
      size="icon"
      variant="unstyled"
      aria-label={label}
      onClick={onClick}
      className={controlButtonVariants({ variant })}
    >
      {icon}
    </Button>
  );
}

export function SessionControlBar({
  paused,
  onTogglePause,
  onRequestExit,
  className,
}: SessionControlBarProps) {
  return (
    <div role="group" aria-label="세션 컨트롤" className={cn(SESSION_CONTROL_BAR_CLASS, className)}>
      {/* 아이콘 전용 버튼이라 이름이 상태를 따라간다. '재개'가 아니라 쉬운 우리말 '다시 시작'
          (voice-tone.md §1) — key로 리마운트시켜 팝 애니메이션을 재생한다. */}
      <ControlButton
        label={paused ? "다시 시작" : "일시정지"}
        icon={
          paused ? (
            <Play
              key="play"
              data-testid="icon-play"
              aria-hidden="true"
              fill="currentColor"
              className={cn(CONTROL_ICON_SIZE, ICON_POP_CLASS)}
            />
          ) : (
            <Pause
              key="pause"
              data-testid="icon-pause"
              aria-hidden="true"
              fill="currentColor"
              className={cn(CONTROL_ICON_SIZE, ICON_POP_CLASS)}
            />
          )
        }
        onClick={onTogglePause}
        variant={paused ? "resume" : "default"}
      />
      <ControlButton
        label="공부 종료"
        icon={
          <LogOut
            data-testid="icon-exit"
            aria-hidden="true"
            className={cn(CONTROL_ICON_SIZE, ICON_POP_CLASS)}
          />
        }
        onClick={onRequestExit}
        variant="exit"
      />
    </div>
  );
}
