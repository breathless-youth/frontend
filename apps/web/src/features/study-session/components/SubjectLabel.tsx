import { ChevronRight } from "lucide-react";
import type { MouseEvent } from "react";

import dotIcon from "@/assets/icons/sheet-dot.svg";
import { cn } from "@/lib/utils";

import { formatElapsed, toKoreanDuration } from "../formatDuration";

export interface SubjectLabelProps {
  name: string;
  focusSec: number;
  /** 세션이 일시정지라 이 과목의 시간도 멈춰 있는가. */
  paused: boolean;
  /** 넘기면 과목 페이지를 여는 버튼이고, 빼면 누를 수 없는 글자다. */
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  expanded?: boolean;
  className?: string;
}

const LABEL_CLASS =
  "flex h-11 max-w-[min(100vw-48px,320px)] items-center gap-2 px-3 text-[13px] leading-4.25 font-semibold";

/**
 * 타이머 위 선택 과목 줄
 *
 * 과목을 고르지 않았으면 호출부가 그리지 않는다.
 * 글자로 그릴 때는 터치를 받지 않아 그 자리를 눌러도 뒤의 화면 탭으로 간다.
 */
export function SubjectLabel({
  name,
  focusSec,
  paused,
  onClick,
  expanded = false,
  className,
}: SubjectLabelProps) {
  const content = (
    <>
      <img
        src={dotIcon}
        alt=""
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0",
          // 세션이 일시정지면 과목 시간도 멈춰 있다 — 깜빡임을 끄고 옅게 둔다.
          paused ? "opacity-40" : "animate-pulse motion-reduce:animate-none",
        )}
      />
      <span className="truncate text-white/85">{name}</span>
      <span className="font-bold text-white/92 tabular-nums">
        <span aria-hidden="true">{formatElapsed(focusSec)}</span>
        <span className="sr-only">{`순공 ${toKoreanDuration(focusSec)}`}</span>
      </span>
    </>
  );

  if (onClick === undefined) {
    return <p className={cn(LABEL_CLASS, "pointer-events-none", className)}>{content}</p>;
  }
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={expanded}
      onClick={onClick}
      className={cn(LABEL_CLASS, "pointer-events-auto", className)}
    >
      {content}
      <ChevronRight
        aria-hidden="true"
        className="size-3.5 shrink-0 text-white/40"
        strokeWidth={2.5}
      />
    </button>
  );
}
