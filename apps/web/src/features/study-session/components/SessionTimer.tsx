import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { formatDuration } from "@/features/records/recordsFormat";
import { formatElapsed, toKoreanDuration } from "../formatDuration";

/**
 * 발광 반경은 숫자 크기에 비례한다 — `em`이라 미디어쿼리 없이 두 방향을 모두 만족한다.
 */
const GLOW_TEXT_SHADOW =
  "0 0 0.4615em var(--session-glow-near), 0 0 1.1538em var(--session-glow-far)";

/**
 * 과목 페이지 머리 오른쪽의 순공
 *
 * 페이지가 세션 UI를 가리므로 상태는 숫자 색으로 전한다.
 * 공부방 세션 루트에는 상태 색 변수가 없어 `stateColor`로 받은 색을 이 요소에 둔다.
 * 싱글룸은 `stateColor` 없이 세션 루트의 상태 색을 따른다.
 * 글자가 작아 발광이 글자를 흐리므로 빛을 넣지 않는다.
 * 제목보다 먼저 줄지 않게 해서 좁은 창에서는 제목이 말줄임된다.
 */
export function SessionPageHeaderTime({
  focusSec,
  stateColor,
  variant,
}: {
  focusSec: number;
  stateColor?: string;
  variant?: "planner";
}) {
  const { t } = useTranslation("study-session");
  return (
    <p
      className={cn(
        "ml-auto shrink-0 text-[20px] tabular-nums",
        variant === "planner"
          ? "leading-6.5 font-bold text-primary"
          : "pr-4 leading-6 font-extrabold tracking-[-0.3px] text-(--session-state-color)",
      )}
      style={
        stateColor === undefined
          ? undefined
          : ({ "--session-state-color": stateColor } as CSSProperties)
      }
    >
      <span aria-hidden="true">
        {variant === "planner"
          ? formatDuration(Math.ceil(focusSec / 60) * 60)
          : formatElapsed(focusSec)}
      </span>
      <span className="sr-only">
        {t("timer.srFocus", { duration: toKoreanDuration(focusSec) })}
      </span>
    </p>
  );
}

/**
 * 배경음 페이지 푸터의 순공 타이머
 *
 * 페이지가 세션 UI를 가리므로 상태는 심플 모드처럼 숫자 색과 발광으로만 전한다.
 */
export function SessionPageTimer({ focusSec }: { focusSec: number }) {
  const { t } = useTranslation("study-session");
  return (
    <p
      className="text-[28px] leading-8.25 font-bold tracking-[-0.4px] text-(--session-state-color) tabular-nums regular:text-[40px] regular:leading-12 short-side-lg:landscape:text-5xl short-side-lg:landscape:leading-14"
      style={{ textShadow: GLOW_TEXT_SHADOW }}
    >
      <span aria-hidden="true">{formatElapsed(focusSec)}</span>
      <span className="sr-only">
        {t("timer.srFocus", { duration: toKoreanDuration(focusSec) })}
      </span>
    </p>
  );
}
