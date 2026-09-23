import type { DailyStudyStat } from "@focusmakers/types";

import { type CalendarMonth, formatDuration } from "./recordsFormat";
import { focusDeltaSec, sumFocusSec } from "./recordsPeriod";

/**
 * 월 순공 합계와 지난달 대비 증감. period 응답의 dailyList·compareDailyList를
 * 받아 합산은 순수 함수에 맡기고 여기서는 그리기만 한다.
 */
export function MonthSummary({
  month,
  daily,
  compareDaily,
}: {
  month: CalendarMonth;
  daily: readonly DailyStudyStat[];
  compareDaily: readonly DailyStudyStat[];
}) {
  const total = sumFocusSec(daily);
  const delta = focusDeltaSec(daily, compareDaily);

  return (
    <div className="flex flex-col items-center gap-1 pt-3">
      <p className="text-[13px] leading-4 text-muted-foreground">{month.month}월 순공시간</p>
      <p className="text-[30px] leading-9 font-extrabold tracking-[-0.9px] text-foreground tabular-nums">
        {formatDuration(total)}
      </p>
      {delta !== 0 && (
        <p
          className={
            delta > 0
              ? "text-[13px] leading-4 font-bold text-feedback-success"
              : "text-[13px] leading-4 font-bold text-muted-foreground"
          }
        >
          {delta > 0
            ? `▲ 지난달보다 ${formatDuration(delta)} 늘었어요`
            : `▼ 지난달보다 ${formatDuration(-delta)} 줄었어요`}
        </p>
      )}
    </div>
  );
}
