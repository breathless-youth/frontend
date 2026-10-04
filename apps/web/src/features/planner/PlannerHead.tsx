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
  readOnly,
  totals,
}: {
  dateKey: string;
  /** 오늘 플래너에서는 다음 날로 갈 수 없다. */
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** D-Day가 설정돼 있을 때만 — `D-62`와 제목. */
  dday: { label: string; title: string } | null;
  /** 지난 날 플래너 — 볼 수만 있다는 안내를 붙인다. */
  readOnly: boolean;
  totals: { focusSec: number; studySec: number } | "pending" | "error";
}) {
  return (
    <div className="flex items-start justify-between border-b border-border pt-1 pb-[15px]">
      <div className="flex min-w-0 flex-col gap-1.5">
        {/* 꺾쇠의 탭 영역(36px)이 날짜 글자 줄보다 왼쪽으로 12px 나온다. */}
        <div className="-ml-3 flex items-center gap-0.5">
          <button
            type="button"
            aria-label="전날"
            onClick={onPrev}
            className="flex size-9 items-center justify-center"
          >
            <IconChevronLeft size={13} color="var(--color-foreground)" />
          </button>
          <h1 className="text-xl leading-6 font-bold text-foreground tabular-nums">
            {dayTitleWithWeekday(dateKey)}
          </h1>
          <button
            type="button"
            aria-label="다음 날"
            disabled={!canGoNext}
            onClick={onNext}
            className="flex size-9 items-center justify-center disabled:cursor-not-allowed disabled:opacity-30"
          >
            <IconChevronRight size={13} color="var(--color-foreground)" />
          </button>
        </div>
        {dday !== null && (
          <p className="truncate text-[13px] leading-4 font-semibold text-primary tabular-nums">
            {dday.label} · {dday.title}
          </p>
        )}
        {readOnly && (
          <p className="text-xs leading-4 text-text-tertiary">지난 날은 보기만 할 수 있어요</p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-0.5 pt-1.5">
        <p className="text-xs leading-[14px] text-muted-foreground">순공시간</p>
        {totals === "pending" ? (
          <Skeleton className="h-6 w-24 rounded-md" />
        ) : (
          <p className="text-xl leading-6 font-extrabold text-foreground tabular-nums">
            {totals === "error" ? "—" : formatDuration(totals.focusSec)}
          </p>
        )}
        <p className="text-xs leading-[14px] text-muted-foreground tabular-nums">
          총 {totals === "pending" || totals === "error" ? "—" : formatDuration(totals.studySec)}
        </p>
      </div>
    </div>
  );
}
