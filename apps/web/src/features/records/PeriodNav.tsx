import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { IconChevronDown, IconChevronLeft, IconChevronRight } from "./icons";

/**
 * 기간 이동 줄 — `이전 · (가운데 라벨) · 다음`.
 *
 * 기록 탭의 달·주 이동, 기간 선택 시트 안의 이동, 플래너의 날짜 이동이 같이 쓴다. 가운데에는 호출부가
 * 라벨을 넣는다 — 눌러서 기간 선택 시트를 여는 라벨이면 `PeriodNavPickerButton`을 쓴다.
 */
export function PeriodNav({
  prevLabel,
  nextLabel,
  canGoNext = true,
  onPrev,
  onNext,
  compact = false,
  className,
  children,
}: {
  prevLabel: string;
  nextLabel: string;
  /** 다음으로 넘어갈 수 있는가 — 기록은 오늘이 속한 기간이 끝이다. */
  canGoNext?: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** 꺾쇠의 탭 영역을 44px 대신 36px로 줄이고 왼쪽에 붙인다 — 제목 줄에 놓이는 플래너용. */
  compact?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const hitArea = compact ? "size-9 p-0" : "size-11 p-0";
  return (
    <div
      className={cn("flex items-center", compact ? "gap-0.5" : "justify-center gap-1.5", className)}
    >
      <Button variant="unstyled" aria-label={prevLabel} onClick={onPrev} className={hitArea}>
        <IconChevronLeft size={13} color="var(--color-foreground)" />
      </Button>
      {children}
      <Button
        variant="unstyled"
        aria-label={nextLabel}
        disabled={!canGoNext}
        onClick={onNext}
        className={cn(hitArea, "disabled:opacity-30")}
      >
        <IconChevronRight size={13} color="var(--color-foreground)" />
      </Button>
    </div>
  );
}

/** 누르면 기간 선택 시트가 열리는 라벨 — 아래 꺾쇠가 탭할 수 있음을 알린다. */
export function PeriodNavPickerButton({
  onClick,
  className = "h-11 gap-1.5 px-2.5 py-0 text-[15px] font-bold text-foreground",
  children,
}: {
  onClick: () => void;
  /** 기본 모양(기록 탭의 15px 굵은 라벨)을 통째로 바꿀 때만 넘긴다. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <Button variant="unstyled" aria-haspopup="dialog" onClick={onClick} className={className}>
      {children}
      <IconChevronDown />
    </Button>
  );
}
