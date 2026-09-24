import type { DailyStudyStat } from "@focusmakers/types";

import { FocusDeltaLabel } from "./FocusDeltaLabel";
import { type CalendarMonth, formatDuration } from "./recordsFormat";
import { focusDeltaSec, isFutureMonth, sumFocusSec } from "./recordsPeriod";

/**
 * 월 순공 합계와 지난달 대비 증감. period 응답의 dailyList·compareDailyList를
 * 받아 합산은 순수 함수에 맡기고 여기서는 그리기만 한다.
 *
 * 보고 있는 달이 미래면 순공 합계는 그대로 두되 증감은 감춘다 — 서버가 0으로 채운
 * 미래 데이터를 과거 비교값과 견줘 "줄었어요"가 뜨는 버그를 막는다.
 */
export function MonthSummary({
  month,
  todayKey,
  daily,
  compareDaily,
}: {
  month: CalendarMonth;
  /** 오늘(KST 날짜 키). 보고 있는 달이 미래면 증감을 감추는 판정에 쓴다. */
  todayKey: string;
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
      {!isFutureMonth(month, todayKey) && <FocusDeltaLabel delta={delta} unit="달" />}
    </div>
  );
}
