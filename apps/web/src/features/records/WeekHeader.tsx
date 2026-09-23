import type { DailyStudyStat } from "@focusmakers/types";

import { FocusDeltaLabel } from "./FocusDeltaLabel";
import { IconChevronLeft, IconChevronRight } from "./icons";
import { dayOfDateKey, formatDuration, monthOfDateKey } from "./recordsFormat";
import { focusDeltaSec, mondayWeekDateKeys, sumFocusSec } from "./recordsPeriod";

/**
 * 주간 헤더 — 주 범위 네비 + 이번 주 순공 + 지난주 대비 증감.
 *
 * 합산·증감·주 7일 계산은 `recordsPeriod`에 맡기고 여기서는 그리기만 한다.
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
  daily,
  compareDaily,
  onPrevWeek,
  onNextWeek,
}: {
  weekAnchorKey: string;
  daily: readonly DailyStudyStat[];
  compareDaily: readonly DailyStudyStat[];
  onPrevWeek: () => void;
  onNextWeek: () => void;
}) {
  const total = sumFocusSec(daily);
  const delta = focusDeltaSec(daily, compareDaily);

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

      <div className="flex flex-col items-center gap-1 pt-3">
        <p className="text-[13px] leading-4 text-muted-foreground">이번 주 순공시간</p>
        <p className="text-[30px] leading-9 font-extrabold tracking-[-0.9px] text-foreground tabular-nums">
          {formatDuration(total)}
        </p>
        <FocusDeltaLabel delta={delta} unit="주" />
      </div>
    </div>
  );
}
