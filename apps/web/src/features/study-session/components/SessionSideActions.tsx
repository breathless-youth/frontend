import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

/**
 * 혼자 공부 세션의 사이드 열 자리
 *
 * 더보기 버튼 바로 아래 열이다.
 * 위 끝은 세션 레이어 위 여백에서 59px 아래라 폰에서는 더보기 누르는 영역과 약 19px 떨어진다.
 * 폭 600 이상 창은 버튼 지름이 커진 만큼 내려 간격을 폰과 비슷하게 둔다.
 * 도움말 화면의 가짜 사이드 열도 이 자리를 쓴다.
 */
export const SESSION_SIDE_POSITION =
  "absolute top-[calc(env(safe-area-inset-top)+72px)] right-[calc(env(safe-area-inset-right)+16px)] landscape-compact:top-[calc(env(safe-area-inset-top)+77px)] regular:top-[calc(env(safe-area-inset-top)+75px)] short-side-lg:top-[calc(env(safe-area-inset-top)+84px)]";

/** 사이드 버튼 사이 간격. 버튼 지름이 커지는 창에서 함께 넓힌다. 도움말 화면의 가짜 열도 쓴다. */
export const SESSION_SIDE_GAP = "gap-3 regular:gap-3.5 short-side-lg:gap-4.5";

export interface SessionSideActionsProps {
  /** 맨 위 공간 버튼 */
  space?: ReactNode;
  ambient: ReactNode;
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
  space,
  ambient,
  modes,
  inert,
  className,
}: SessionSideActionsProps) {
  const { t } = useTranslation("study-session");
  return (
    <div
      role="group"
      aria-label={t("controls.sideActions")}
      inert={inert}
      className={cn("flex flex-col", SESSION_SIDE_GAP, className)}
    >
      {space}
      {ambient}
      {modes}
    </div>
  );
}
