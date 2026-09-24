import type { DailyStudyStat } from "@focusmakers/types";

import { type CalendarMonth, dayOfDateKey, formatDuration, monthOfDateKey } from "./recordsFormat";
import { bestDay, elapsedDaysInMonth, studiedDayCount, studiedRatioPercent } from "./recordsPeriod";

/**
 * 특정 달에 대한 기록 카드 (왼쪽 "이 달 최고 기록"(bestDay), 오른쪽 "이 달 공부"(공부 일수 + 경과일 비율))
 *
 * 집계·경과일·비율 계산은 모두 recordsPeriod 순수 함수에 맡기고 여기서는 그리기만 한다.
 */

function formatMonthDay(dateKey: string): string {
  return `${monthOfDateKey(dateKey).month}월 ${dayOfDateKey(dateKey)}일`;
}

export function MonthTiles({
  daily,
  month,
  todayKey,
}: {
  daily: readonly DailyStudyStat[];
  month: CalendarMonth;
  todayKey: string;
}) {
  const best = bestDay(daily);
  const studiedDays = studiedDayCount(daily);
  const elapsed = elapsedDaysInMonth(month, todayKey);
  const ratio = studiedRatioPercent(studiedDays, elapsed);

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1 rounded-[20px] bg-brand-subtle shadow-sb-card p-[18px]">
        <span className="text-[13px] leading-4 text-muted-foreground">이 달 최고 기록</span>
        {best === null ? (
          <span className="text-[22px] leading-7 font-extrabold text-primary tabular-nums">
            기록 없음
          </span>
        ) : (
          <>
            <span className="text-[22px] leading-7 font-extrabold text-primary tabular-nums">
              {formatDuration(best.focusSec)}
            </span>
            <span className="text-[13px] leading-4 text-muted-foreground tabular-nums">
              {formatMonthDay(best.date)}
            </span>
          </>
        )}
      </div>

      <div className="flex flex-col gap-1 rounded-[20px] bg-muted shadow-sb-card p-[18px]">
        <span className="text-[13px] leading-4 text-muted-foreground">이 달 공부</span>
        <span className="text-[22px] leading-7 font-extrabold text-foreground tabular-nums">
          {studiedDays}일
        </span>
        <span className="text-[13px] leading-4 text-muted-foreground tabular-nums">
          {elapsed}일 중 {ratio}%
        </span>
      </div>
    </div>
  );
}
