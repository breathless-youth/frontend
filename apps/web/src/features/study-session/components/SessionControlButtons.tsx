import type { ReactNode } from "react";
import { LogOut, Pause, Play } from "lucide-react";
import type { VariantProps } from "class-variance-authority";

import { Button } from "@/components/ui/button";
import { controlButtonVariants } from "@/features/study-session/components/controlButtonVariants";
import { cn } from "@/lib/utils";

/**
 * 세션 화면 하단 양 끝의 일시정지·나가기 버튼
 *
 * 일시정지 중에는 일시정지 버튼이 파란 재개 버튼으로 바뀐다.
 * 버튼이 스스로 `pointer-events-auto`라 뒤의 전체 화면 탭(심플 모드 전환) 레이어에 클릭이 닿지 않는다.
 */

/** 아이콘 팝 애니메이션 — 마운트·아이콘 교체(일시정지↔재개)마다 한 번 재생된다(BY-435 모션). */
const ICON_POP_CLASS = "animate-[control-icon-pop_220ms_ease-out] motion-reduce:animate-none";

/** 54px 버튼 기준 아이콘 크기 — Figma V2 `S1b` 실측으로 네 아이콘 모두 23px 동일하다. */
// 폭 600 이상 창은 64px 버튼에, 큰 태블릿은 80px 버튼에 같은 비율로 맞춘다.
const CONTROL_ICON_SIZE = "size-5.75 regular:size-6.75 short-side-lg:size-8.5";

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

export function SessionPauseButton({ paused, onClick }: { paused: boolean; onClick: () => void }) {
  return (
    // 아이콘 전용 버튼이라 이름이 상태를 따라간다. '재개'가 아니라 쉬운 우리말 '다시 시작'
    // (voice-tone.md §1) — key로 리마운트시켜 팝 애니메이션을 재생한다.
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
      onClick={onClick}
      variant={paused ? "resume" : "default"}
    />
  );
}

export function SessionExitButton({ onClick }: { onClick: () => void }) {
  return (
    <ControlButton
      label="공부 종료"
      icon={
        <LogOut
          data-testid="icon-exit"
          aria-hidden="true"
          className={cn(CONTROL_ICON_SIZE, ICON_POP_CLASS)}
        />
      }
      onClick={onClick}
      variant="exit"
    />
  );
}
