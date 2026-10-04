import type { DailyStudyStat } from "@focusmakers/types";

import { dayTitleWithWeekday, formatDuration } from "./recordsFormat";
import {
  averageFocusRatePercent,
  averageFocusSecPerStudiedDay,
  averageStudySecPerStudiedDay,
  bestDay,
  studiedDayCount,
} from "./recordsPeriod";

/**
 * 주 카드 — 그 주의 최고 기록과 하루 평균 순공, 그 아래 하루 평균 공부시간·평균 집중률 한 줄.
 * 평균의 분모는 공부한 날 수다(쉰 날로 평균이 깎이지 않게). 기록 없는 주는 값이 `—`다.
 */
export function WeekCards({ daily }: { daily: readonly DailyStudyStat[] }) {
  const best = bestDay(daily);
  const studiedDays = studiedDayCount(daily);
  const averageFocus = averageFocusSecPerStudiedDay(daily);
  const averageStudy = averageStudySecPerStudiedDay(daily);
  const focusRate = averageFocusRatePercent(daily);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-[20px] bg-brand-subtle px-[18px] py-4">
          <p className="text-xs leading-4 text-brand-subtle-text">이 주 최고 기록</p>
          <p className="text-[22px] leading-7 font-extrabold text-primary tabular-nums">
            {best === null ? "—" : formatDuration(best.focusSec)}
          </p>
          <p className="text-[11.5px] leading-[15px] text-brand-subtle-text">
            {best === null ? "아직 공부한 날이 없어요" : dayTitleWithWeekday(best.date)}
          </p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-[20px] bg-muted px-[18px] py-4 shadow-sb-card">
          <p className="text-xs leading-4 text-muted-foreground">하루 평균</p>
          <p className="text-[22px] leading-7 font-extrabold text-foreground tabular-nums">
            {averageFocus === null ? "—" : formatDuration(averageFocus)}
          </p>
          <p className="text-[11.5px] leading-[15px] text-muted-foreground">
            {studiedDays === 0 ? "공부한 날 없음" : `공부한 ${String(studiedDays)}일 기준`}
          </p>
        </div>
      </div>

      <dl className="flex items-center gap-4 rounded-[20px] bg-muted px-[18px] py-3.5 shadow-sb-card">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <dt className="text-[11.5px] leading-[15px] text-muted-foreground">하루 평균 공부시간</dt>
          <dd className="text-[15px] leading-[19px] font-bold text-foreground tabular-nums">
            {averageStudy === null ? "—" : formatDuration(averageStudy)}
          </dd>
        </div>
        <div className="h-[30px] w-px shrink-0 bg-border" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <dt className="text-[11.5px] leading-[15px] text-muted-foreground">평균 집중률</dt>
          <dd className="text-[15px] leading-[19px] font-bold text-foreground tabular-nums">
            {focusRate === null ? "—" : `${String(focusRate)}%`}
          </dd>
        </div>
      </dl>
    </div>
  );
}
