import { useState, type ReactNode } from "react";
import { LogOut, Pause, Play } from "lucide-react";
import { type VariantProps, cva } from "class-variance-authority";

import { Button } from "@/components/ui/button";
import { CameraFlipIcon } from "@/components/CameraFlipIcon";
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
 * 컨트롤 바 컨테이너 — 라이트/다크를 따라간다(나머지 세션 화면은 강제 다크). 값은 시맨틱 토큰
 * (`bg-bg-layer-2`/`border-border`)이 아니라 `index.css`의 `--session-bar-glass-*`/
 * `--session-btn-default-*` 전용 변수에서 온다(Figma V2 `S1b` control-bar 실측).
 */
const SESSION_CONTROL_BAR_CLASS =
  "pointer-events-auto relative flex items-center justify-center gap-[14px] rounded-full border border-[var(--session-bar-glass-border)] bg-[var(--session-bar-glass-bg)] p-[10px] backdrop-blur-[11px] shadow-[0px_10px_30px_var(--session-bar-glass-shadow),inset_0px_1px_0px_var(--session-bar-glass-highlight)]";

const controlButtonVariants = cva(
  "flex shrink-0 items-center justify-center rounded-full transition-[opacity,background-color,transform] duration-200 motion-reduce:transition-none",
  {
    variants: {
      /** 기본 버튼(일시정지/카메라 전환)만 라이트/다크를 따른다 — 재개·종료는 두 모드에서 색이 같다. */
      variant: {
        default:
          "border border-[var(--session-btn-default-border)] bg-[var(--session-btn-default-bg)] text-[var(--session-btn-default-fg)]",
        resume: "bg-[var(--session-control-resume-bg)] text-primary-foreground",
        exit: "bg-[var(--session-control-exit-bg)] text-primary-foreground",
      },
      /**
       * 지금 할 수 없는 동작 — 심플 모드의 카메라 전환이 유일한 사례다(BY-336).
       * 버튼을 없애지 않고 흐리게 남기는 이유는 컨트롤 바가 세 버튼의 고정 배치이기 때문이다.
       */
      disabled: { true: "disabled:opacity-40", false: "active:scale-90 active:opacity-80" },
    },
    defaultVariants: { variant: "default", disabled: false },
  },
);

/** 아이콘 팝 애니메이션 — 마운트·아이콘 교체(일시정지↔재개)마다 한 번 재생된다(BY-435 모션). */
const ICON_POP_CLASS = "animate-[control-icon-pop_220ms_ease-out] motion-reduce:animate-none";

/** 54px 버튼 기준 아이콘 크기 — Figma V2 `S1b` 실측으로 네 아이콘 모두 23px 동일하다. */
const CONTROL_ICON_SIZE = "size-[23px]";

export interface SessionControlBarProps {
  /** 일시정지 상태면 첫 버튼이 파란 '다시 시작'으로 바뀐다. */
  paused: boolean;
  /**
   * 카메라 전환을 지금 할 수 없는가 — 심플 모드(S3-4/S3-6)에서 켠다.
   *
   * 심플 모드는 프리뷰를 걷어낸 화면이라 어느 카메라가 열려 있는지 볼 수 없다. 그 상태에서
   * 전환을 누르면 화면에는 아무 변화가 없는데 추론만 1~2초 끊기고(전환 중 `detect()` 정지)
   * 토스트만 뜬다 — 사용자에게는 아무 일도 안 일어난 것처럼 보인다.
   */
  flipDisabled?: boolean;
  onTogglePause: () => void;
  onFlipCamera: () => void;
  onRequestExit: () => void;
  className?: string;
}

interface ControlButtonProps {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  variant?: VariantProps<typeof controlButtonVariants>["variant"];
  disabled?: boolean;
}

function ControlButton({
  label,
  icon,
  onClick,
  variant = "default",
  disabled = false,
}: ControlButtonProps) {
  return (
    <Button
      type="button"
      size="icon"
      variant={null}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={controlButtonVariants({ variant, disabled })}
    >
      {icon}
    </Button>
  );
}

export function SessionControlBar({
  paused,
  flipDisabled = false,
  onTogglePause,
  onFlipCamera,
  onRequestExit,
  className,
}: SessionControlBarProps) {
  // 전환 버튼 반 바퀴 회전(BY-435) — 룸 바(RoomControlBar)와 동일. 누른 횟수만 세면
  // CSS 트랜지션이 연속 회전을 만들고, 실제 전환 성공 여부와 무관하게 즉시 반응한다.
  const [flipTurns, setFlipTurns] = useState(0);
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
              fill="currentColor"
              className={cn(CONTROL_ICON_SIZE, ICON_POP_CLASS)}
            />
          ) : (
            <Pause
              key="pause"
              data-testid="icon-pause"
              fill="currentColor"
              className={cn(CONTROL_ICON_SIZE, ICON_POP_CLASS)}
            />
          )
        }
        onClick={onTogglePause}
        variant={paused ? "resume" : "default"}
      />
      <ControlButton
        label="카메라 전환"
        // 몸통은 고정, 안의 화살표만 돈다(2026-08-25 피드백) — 회전은 컴포넌트 내부 g가 처리.
        icon={<CameraFlipIcon turns={flipTurns} className={CONTROL_ICON_SIZE} />}
        onClick={() => {
          setFlipTurns((turns) => turns + 1);
          onFlipCamera();
        }}
        disabled={flipDisabled}
      />
      <ControlButton
        label="공부 종료"
        icon={<LogOut data-testid="icon-exit" className={cn(CONTROL_ICON_SIZE, ICON_POP_CLASS)} />}
        onClick={onRequestExit}
        variant="exit"
      />
    </div>
  );
}
