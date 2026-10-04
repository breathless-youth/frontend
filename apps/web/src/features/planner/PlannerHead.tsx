import { IconChevronLeft, IconChevronRight } from "@/features/records/icons";
import { dayTitleWithWeekday, formatDuration } from "@/features/records/recordsFormat";

import { Skeleton } from "@/components/ui/Skeleton";

/**
 * 플래너 머리 — 왼쪽에 날짜(전날·다음 날 꺾쇠)와 D-Day, 오른쪽에 그날 순공시간·총 공부시간.
 * 카드 없이 가는 구분선으로 본문과 나눈다. 날짜 줄이 화면의 제목 역할을 한다.
 */
export function PlannerHead({
  dateKey,
  canGoNext,
  onPrev,
  onNext,
  dday,
  totals,
}: {
  dateKey: string;
  /** 오늘 플래너에서는 다음 날로 갈 수 없다. */
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** D-Day가 설정돼 있을 때만 — `D-108`과 제목. */
  dday: { label: string; title: string } | null;
  totals: { focusSec: number; studySec: number } | "pending" | "error";
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between px-0.5">
        <div className="flex min-w-0 flex-col gap-[3px]">
          <div className="-ml-3 flex items-center">
            <button
              type="button"
              aria-label="전날"
              onClick={onPrev}
              className="flex h-11 w-7 items-center justify-center"
            >
              <IconChevronLeft size={11.375} color="var(--color-text-tertiary)" />
            </button>
            <h1 className="text-xl leading-6 font-bold text-foreground tabular-nums">
              {dayTitleWithWeekday(dateKey)}
            </h1>
            <button
              type="button"
              aria-label="다음 날"
              disabled={!canGoNext}
              onClick={onNext}
              className="flex h-11 w-7 items-center justify-center disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IconChevronRight size={12} color="var(--color-text-tertiary)" />
            </button>
          </div>
          {dday !== null && (
            <p className="-mt-2.5 truncate text-xs leading-4 text-muted-foreground">
              <span className="font-bold text-primary">{dday.label}</span> · {dday.title}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-px">
          <p className="text-[11.5px] leading-[14px] text-muted-foreground">순공시간</p>
          {totals === "pending" ? (
            <Skeleton className="h-6 w-24 rounded-md" />
          ) : (
            <p className="text-xl leading-6 font-extrabold text-foreground tabular-nums">
              {totals === "error" ? "—" : formatDuration(totals.focusSec)}
            </p>
          )}
          <p className="text-[11px] leading-[14px] text-muted-foreground">
            총 공부시간{" "}
            <span className="font-bold text-foreground tabular-nums">
              {totals === "pending" || totals === "error" ? "—" : formatDuration(totals.studySec)}
            </span>
          </p>
        </div>
      </div>
      <div className="h-px w-full bg-chart-prev" />
    </div>
  );
}
