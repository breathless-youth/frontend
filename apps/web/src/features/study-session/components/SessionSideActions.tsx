import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface SessionSideActionsProps {
  ambient: ReactNode;
  subject: ReactNode;
  /** 타이머 진입 버튼 */
  modes?: ReactNode;
  /** 숨긴 동안 누르거나 포커스를 옮길 수 없게 한다. */
  inert?: boolean;
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
  ambient,
  subject,
  modes,
  inert,
  className,
}: SessionSideActionsProps) {
  return (
    <div
      role="group"
      aria-label="부가 기능"
      inert={inert}
      className={cn("flex flex-col gap-3", className)}
    >
      {ambient}
      {subject}
      {modes}
    </div>
  );
}
