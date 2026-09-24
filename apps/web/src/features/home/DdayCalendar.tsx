import { useState } from "react";

import { IconChevronDown, IconChevronLeft, IconChevronRight } from "@/features/records/icons";
import {
  buildMonthGrid,
  type CalendarMonth,
  dayOfDateKey,
  monthLabel,
  monthOfDateKey,
  shiftMonth,
  WEEKDAY_LABELS,
} from "@/features/records/recordsFormat";
import { cn } from "@/lib/utils";

/** 연/월 선택기의 빠른 이동 — 시험은 보통 몇 달 뒤라 달을 하나씩 넘기게 두지 않는다. */
const QUICK_JUMPS: readonly { readonly months: number; readonly label: string }[] = [
  { months: 1, label: "1개월 후" },
  { months: 6, label: "6개월 후" },
  { months: 12, label: "1년 후" },
];

const NAV_BUTTON_CLASS = "flex size-11 items-center justify-center";

function isBeforeMonth(a: CalendarMonth, b: CalendarMonth): boolean {
  return a.year < b.year || (a.year === b.year && a.month < b.month);
}

/**
 * D-Day 시트의 달력. 기록 탭 달력과 반대로 **지난 날이 비활성**이고 오늘은 링, 고른 날은 채움이다.
 * 가운데 월 라벨을 누르면 연/월 선택기로 바뀐다 — 몇 달 뒤 시험을 고를 때 화살표를 여러 번
 * 누르지 않게 한다. 날짜 값은 `YYYY-MM-DD`이고 오늘은 기기 로컬 날짜다(홈 D-N과 같은 기준).
 */
export function DdayCalendar({
  value,
  todayKey,
  onChange,
}: {
  value: string | null;
  todayKey: string;
  onChange: (dateKey: string) => void;
}) {
  const [month, setMonth] = useState<CalendarMonth>(() => monthOfDateKey(value ?? todayKey));
  const [picker, setPicker] = useState(false);
  const [pickYear, setPickYear] = useState(month.year);
  const thisMonth = monthOfDateKey(todayKey);

  function pickMonth(next: CalendarMonth) {
    setMonth(next);
    setPicker(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-11 items-center justify-between">
        <button
          type="button"
          aria-label="이전 달"
          onClick={() => setMonth(shiftMonth(month, -1))}
          className={cn(NAV_BUTTON_CLASS, "-ml-3.5")}
        >
          <IconChevronLeft size={13} color="var(--color-foreground)" />
        </button>
        <button
          type="button"
          aria-expanded={picker}
          aria-label="연도·월 바로 가기"
          onClick={() => {
            setPickYear(month.year);
            setPicker((open) => !open);
          }}
          className="flex h-11 items-center gap-1.5 px-2 text-foreground"
        >
          <span className="text-[17px] leading-[21px] font-bold">{monthLabel(month)}</span>
          <span className={cn("transition-transform duration-200", picker && "rotate-180")}>
            <IconChevronDown size={9} color="var(--color-primary)" />
          </span>
        </button>
        <button
          type="button"
          aria-label="다음 달"
          onClick={() => setMonth(shiftMonth(month, 1))}
          className={cn(NAV_BUTTON_CLASS, "-mr-3.5")}
        >
          <IconChevronRight size={13} color="var(--color-foreground)" />
        </button>
      </div>

      {picker ? (
        <div className="flex min-h-[284px] flex-col gap-2">
          <div className="flex h-11 items-center justify-center gap-1">
            <button
              type="button"
              aria-label="이전 연도"
              disabled={pickYear <= thisMonth.year}
              onClick={() => setPickYear((year) => year - 1)}
              className={cn(NAV_BUTTON_CLASS, "disabled:opacity-30")}
            >
              <IconChevronLeft size={13} color="var(--color-foreground)" />
            </button>
            <span className="min-w-[72px] text-center text-[20px] leading-6 font-extrabold text-primary tabular-nums">
              {pickYear}
            </span>
            <button
              type="button"
              aria-label="다음 연도"
              onClick={() => setPickYear((year) => year + 1)}
              className={NAV_BUTTON_CLASS}
            >
              <IconChevronRight size={13} color="var(--color-foreground)" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 12 }, (_, index) => {
              const candidate = { year: pickYear, month: index + 1 };
              const past = isBeforeMonth(candidate, thisMonth);
              const isShown = candidate.year === month.year && candidate.month === month.month;
              const isNow =
                candidate.year === thisMonth.year && candidate.month === thisMonth.month;
              return (
                <button
                  key={candidate.month}
                  type="button"
                  disabled={past}
                  aria-pressed={isShown}
                  onClick={() => pickMonth(candidate)}
                  className={cn(
                    "h-12 rounded-2xl text-[15px] leading-5 font-medium transition-colors",
                    isShown
                      ? "bg-primary font-bold text-primary-foreground"
                      : past
                        ? "bg-bg-layer-2 text-text-disabled"
                        : isNow
                          ? "bg-bg-layer-2 font-bold text-primary shadow-[inset_0_0_0_1.5px_var(--color-primary)]"
                          : "bg-bg-layer-2 text-foreground",
                  )}
                >
                  {candidate.month}월
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 pt-1">
            {QUICK_JUMPS.map((jump) => (
              <button
                key={jump.months}
                type="button"
                onClick={() => pickMonth(shiftMonth(thisMonth, jump.months))}
                className="h-9 flex-1 rounded-full bg-bg-layer-2 text-[13px] leading-4 font-medium text-muted-foreground"
              >
                {jump.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-7">
            {WEEKDAY_LABELS.map((label) => (
              <span
                key={label}
                className="pb-1 text-center text-xs leading-4 font-medium text-text-tertiary"
              >
                {label}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {buildMonthGrid(month).flatMap((week, row) =>
              week.map((dateKey, column) => {
                if (dateKey === null) {
                  return <div key={`blank-${String(row)}-${String(column)}`} className="h-11" />;
                }
                const past = dateKey < todayKey;
                const selected = dateKey === value;
                const today = dateKey === todayKey;
                return (
                  <button
                    key={dateKey}
                    type="button"
                    disabled={past}
                    aria-pressed={selected}
                    aria-label={`${month.month}월 ${dayOfDateKey(dateKey)}일`}
                    onClick={() => onChange(dateKey)}
                    className="flex h-11 items-center justify-center"
                  >
                    <span
                      className={cn(
                        "flex size-[30px] items-center justify-center rounded-full text-[15px] leading-5 transition-colors",
                        selected
                          ? "bg-primary font-semibold text-primary-foreground"
                          : past
                            ? "text-text-disabled"
                            : today
                              ? "font-semibold text-primary shadow-[inset_0_0_0_1.5px_var(--color-primary)]"
                              : "text-foreground",
                      )}
                    >
                      {dayOfDateKey(dateKey)}
                    </span>
                  </button>
                );
              }),
            )}
          </div>
        </>
      )}
    </div>
  );
}
