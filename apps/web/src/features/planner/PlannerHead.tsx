import { IconChevronDown, IconChevronLeft, IconChevronRight } from "@/features/records/icons";
import { dayTitleWithWeekday, formatDuration } from "@/features/records/recordsFormat";

import { Skeleton } from "@/components/ui/Skeleton";

/**
 * 플래너 머리 — 왼쪽에 날짜(전날·다음 날 꺾쇠)와 D-Day, 오른쪽에 그날 순공시간·총 공부시간.
 * 카드 없이 가는 구분선으로 본문과 나눈다. 날짜 줄이 화면의 제목 역할을 한다.
 */
export function PlannerHead({
  dateKey,
  onPrev,
  onNext,
  onOpenPicker,
  dday,
  totals,
}: {
  dateKey: string;
  onPrev: () => void;
  onNext: () => void;
  /** 날짜를 탭했다 — 날짜 선택 시트를 연다. */
  onOpenPicker: () => void;
  /** D-Day가 설정돼 있을 때만 — `D-62`와 제목. */
  dday: { label: string; title: string } | null;
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
          {/* 날짜를 탭하면 날짜 선택 시트가 열린다 — 아래 꺾쇠가 탭할 수 있음을 알린다. */}
          <h1 className="text-xl leading-6 font-bold text-foreground tabular-nums">
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={onOpenPicker}
              className="flex h-9 items-center gap-1.5"
            >
              {dayTitleWithWeekday(dateKey)}
              <IconChevronDown />
            </button>
          </h1>
          <button
            type="button"
            aria-label="다음 날"
            onClick={onNext}
            className="flex size-9 items-center justify-center"
          >
            <IconChevronRight size={13} color="var(--color-foreground)" />
          </button>
        </div>
        {dday !== null && (
          <p className="truncate text-[13px] leading-4 font-semibold text-primary tabular-nums">
            {dday.label} · {dday.title}
          </p>
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
