import type { DailyStudyStat } from "@focusmakers/types";

import {
  type CalendarMonth,
  dayOfDateKey,
  formatDuration,
  isDateKeyInMonth,
  monthOfDateKey,
} from "./recordsFormat";
import { bestDay, studiedDayCount } from "./recordsPeriod";

/**
 * 특정 달에 대한 기록 카드 (왼쪽 "이 달 최고 기록"(bestDay), 오른쪽 "이 달 공부"(공부 일수 + 경과일 비율))
 *
 * 집계는 recordsPeriod 순수 함수에 맡기고 여기서는 경과일 분모만 계산해 그린다.
 */

/**
 * 비율 분모가 되는 그 달의 경과일:
 * - 오늘이 속한 달이면 오늘 일자(그 달 1일부터 오늘까지)
 * - 과거 달이면 말일, 미래 달이면 0
 */
function elapsedDays(month: CalendarMonth, todayKey: string): number {
  if (isDateKeyInMonth(todayKey, month)) {
    return dayOfDateKey(todayKey);
  }
  const firstDayKey = `${month.year}-${String(month.month).padStart(2, "0")}-01`;
  if (firstDayKey > todayKey) {
    return 0; // 미래 달
  }
  return new Date(Date.UTC(month.year, month.month, 0)).getUTCDate(); // 과거 달 말일
}

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
  const elapsed = elapsedDays(month, todayKey);
  const ratio = elapsed === 0 ? 0 : Math.round((studiedDays / elapsed) * 100);

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
