import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { CameraFlipIcon } from "@/components/CameraFlipIcon";
import { controlButtonVariants } from "@/features/study-session/components/controlButtonVariants";
import { cn } from "@/lib/utils";

export interface SessionSideActionsProps {
  showFlip: boolean;
  onFlipCamera: () => void;
  ambient: ReactNode;
  className?: string;
}

/**
 * 세션 화면 오른쪽 위의 부가 기능 버튼 묶음
 *
 * 공부를 멈추거나 끝내는 버튼과 섞이지 않게 하단 바에서 떼어 냈다.
 *
 * 묶음 자체는 클릭을 받지 않아서 버튼 사이 틈을 눌러도 심플 모드 전환이 된다.
 */
export function SessionSideActions({
  showFlip,
  onFlipCamera,
  ambient,
  className,
}: SessionSideActionsProps) {
  // 전환 버튼 반 바퀴 회전(BY-435) — 룸 바(RoomControlBar)와 동일. 누른 횟수만 세면
  // CSS 트랜지션이 연속 회전을 만들고, 실제 전환 성공 여부와 무관하게 즉시 반응한다.
  const [flipTurns, setFlipTurns] = useState(0);
  return (
    <div role="group" aria-label="부가 기능" className={cn("flex flex-col gap-3", className)}>
      {ambient}
      {showFlip && (
        <Button
          type="button"
          size="icon"
          variant="unstyled"
          aria-label="카메라 전환"
          onClick={() => {
            setFlipTurns((turns) => turns + 1);
            onFlipCamera();
          }}
          className={cn(
            controlButtonVariants(),
            "pointer-events-auto bg-[var(--session-bar-glass-bg)] shadow-[0px_10px_30px_var(--session-bar-glass-shadow),inset_0px_1px_0px_var(--session-bar-glass-highlight)] backdrop-blur-[11px]",
          )}
        >
          <CameraFlipIcon
            // 몸통은 고정, 안의 화살표만 돈다(2026-08-25 피드백) — 회전은 컴포넌트 내부 g가 처리.
            // Figma 벡터 원본이 28px 프레임이라 다른 아이콘과 같은 23px로 그리면 가늘고 작게 보인다.
            turns={flipTurns}
            className="size-7"
          />
        </Button>
      )}
    </div>
  );
}
