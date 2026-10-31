import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 혼자 공부 세션의 사이드 열 자리
 *
 * 세로·가로 모두 상태 필 아래 23px에 놓는다.
 * 폭 600 이상 창은 상태 필이 커진 만큼 내려 필 아래 간격을 폰과 같게 둔다.
 * 도움말 화면의 가짜 사이드 열도 이 자리를 쓴다.
 */
export const SESSION_SIDE_POSITION =
  "absolute top-[calc(env(safe-area-inset-top)+72px)] right-[calc(env(safe-area-inset-right)+16px)] landscape-compact:top-[calc(env(safe-area-inset-top)+77px)] regular:top-[calc(env(safe-area-inset-top)+75px)] short-side-lg:top-[calc(env(safe-area-inset-top)+84px)]";

/** 사이드 버튼 사이 간격. 버튼 지름이 커지는 창에서 함께 넓힌다. 도움말 화면의 가짜 열도 쓴다. */
export const SESSION_SIDE_GAP = "gap-3 regular:gap-3.5 short-side-lg:gap-4.5";

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
      className={cn("flex flex-col", SESSION_SIDE_GAP, className)}
    >
      {ambient}
      {subject}
      {modes}
    </div>
  );
}
