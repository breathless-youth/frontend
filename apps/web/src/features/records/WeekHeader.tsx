import type { DailyStudyStat } from "@focusmakers/types";

import { Skeleton } from "@/components/ui/Skeleton";

import { FocusDeltaLabel } from "./FocusDeltaLabel";
import { IconChevronLeft, IconChevronRight } from "./icons";
import { dayOfDateKey, formatDuration, monthOfDateKey } from "./recordsFormat";
import { isFutureWeek, mondayWeekDateKeys, sumFocusSec, weekFocusDeltaSec } from "./recordsPeriod";

/**
 * 주간 헤더 — 주 범위 네비 + 이번 주 순공 + 지난주 대비 증감.
 *
 * 합산·증감·주 7일 계산은 `recordsPeriod`에 맡기고 여기서는 그리기만 한다.
 *
 * 네비·주 범위 라벨은 조회 상태와 무관하게 항상 보인다. 순공·증감 숫자는 확정값이라
 * `metricsStatus`가 success일 때만 그리고, pending이면 Skeleton, error면 감춰서 오류 화면과
 * 함께 "0분 · 지난주와 같아요"가 확정값처럼 뜨지 않게 한다.
 */

/** 주 범위 라벨 `9월 14일 ~ 20일` — 같은 달이면 끝은 일만, 달을 넘으면 끝도 `M월 D일`. */
function weekRangeLabel(weekAnchorKey: string): string {
  const week = mondayWeekDateKeys(weekAnchorKey);
  const from = week[0]!;
  const to = week[6]!;
  const start = `${monthOfDateKey(from).month}월 ${dayOfDateKey(from)}일`;
  const sameMonth = monthOfDateKey(from).month === monthOfDateKey(to).month;
  const end = sameMonth
    ? `${dayOfDateKey(to)}일`
    : `${monthOfDateKey(to).month}월 ${dayOfDateKey(to)}일`;
  return `${start} ~ ${end}`;
}

export function WeekHeader({
  weekAnchorKey,
  todayKey,
  metricsStatus,
  daily,
  compareDaily,
  onPrevWeek,
  onNextWeek,
}: {
  weekAnchorKey: string;
  /** 오늘(KST 날짜 키). 보고 있는 주가 미래면 증감을 감추는 판정에 쓴다. */
  todayKey: string;
  /** 순공·증감 숫자 영역의 상태. success일 때만 daily/compareDaily로 숫자를 그린다. */
  metricsStatus: "pending" | "error" | "success";
  daily?: readonly DailyStudyStat[];
  compareDaily?: readonly DailyStudyStat[];
  onPrevWeek: () => void;
  onNextWeek: () => void;
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center justify-center gap-1.5 pt-4">
        <button
          type="button"
          aria-label="이전 주"
          onClick={onPrevWeek}
          className="flex size-11 items-center justify-center"
        >
          <IconChevronLeft size={13} color="var(--color-foreground)" />
        </button>
        <span className="px-2.5 text-[15px] font-bold text-foreground">
          {weekRangeLabel(weekAnchorKey)}
        </span>
        <button
          type="button"
          aria-label="다음 주"
          onClick={onNextWeek}
          className="flex size-11 items-center justify-center"
        >
          <IconChevronRight size={13} color="var(--color-foreground)" />
        </button>
      </div>

      <WeekMetrics
        metricsStatus={metricsStatus}
        daily={daily}
        compareDaily={compareDaily}
        weekAnchorKey={weekAnchorKey}
        todayKey={todayKey}
        hideDelta={isFutureWeek(weekAnchorKey, todayKey)}
      />
    </div>
  );
}

function WeekMetrics({
  metricsStatus,
  daily,
  compareDaily,
  weekAnchorKey,
  todayKey,
  hideDelta,
}: {
  metricsStatus: "pending" | "error" | "success";
  daily?: readonly DailyStudyStat[];
  compareDaily?: readonly DailyStudyStat[];
  weekAnchorKey: string;
  todayKey: string;
  /** 미래 주면 순공 합계는 두되 증감(FocusDeltaLabel)은 그리지 않는다. */
  hideDelta: boolean;
}) {
  if (metricsStatus === "error") {
    return null; // 오류 시 확정값처럼 보일 숫자를 아예 안 그린다(범위·네비만 남는다).
  }

  if (metricsStatus === "pending") {
    return (
      <div className="flex flex-col items-center gap-1.5 pt-3">
        <p className="text-[13px] leading-4 text-muted-foreground">이번 주 순공시간</p>
        <Skeleton className="h-9 w-40 rounded-md" />
        <Skeleton className="h-4 w-32 rounded-md" />
      </div>
    );
  }

  const total = sumFocusSec(daily ?? []);
  const delta = weekFocusDeltaSec(daily ?? [], compareDaily ?? [], weekAnchorKey, todayKey);
  return (
    <div className="flex flex-col items-center gap-1 pt-3">
      <p className="text-[13px] leading-4 text-muted-foreground">이번 주 순공시간</p>
      <p className="text-[30px] leading-9 font-extrabold tracking-[-0.9px] text-foreground tabular-nums">
        {formatDuration(total)}
      </p>
      {!hideDelta && <FocusDeltaLabel delta={delta} unit="주" />}
    </div>
  );
}
