import { useState } from "react";
import type { ReactNode } from "react";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

import { IconChevronLeft, IconChevronRight } from "./icons";
import {
  buildMonthGrid,
  type CalendarMonth,
  dayOfDateKey,
  isFutureDateKey,
  MONDAY_FIRST_WEEKDAY_LABELS,
  monthLabel,
  monthOfDateKey,
  shiftMonth,
} from "./recordsFormat";
import { isFutureMonth, mondayWeekDateKeys } from "./recordsPeriod";

/**
 * 기간 선택 시트(S5-2) — 기간 라벨을 탭하면 열려 먼 달·주로 한 번에 옮긴다.
 *
 * 일간은 월 선택, 주간은 주 선택이다. 둘 다 `오늘`로 오늘이 속한 달·주로 돌아오고 미래는 고를 수 없다.
 * 화살표·스와이프 이동은 이 시트와 별개로 그대로 동작한다.
 */

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

function PickerSheet({
  open,
  onOpenChange,
  title,
  onToday,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onToday: () => void;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* 기록 탭이 `theme-soft-blue`를 서브트리에만 켠다. 포털이 body로 나가므로 시트에도 같은 테마를 단다. */}
      <SheetContent
        side="bottom"
        // 터치로 연 시트에 포커스 링이 남지 않게 첫 요소로 포커스를 옮기지 않는다(D-Day 시트와 같은 처리).
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="theme-soft-blue gap-0 rounded-t-[24px] border-t-0 px-5 pt-2.5 pb-[max(34px,calc(env(safe-area-inset-bottom)+8px))]"
        // 설명 없는 시트다. 비워 두면 Radix가 aria-describedby 누락을 경고한다.
        aria-describedby={undefined}
      >
        <span aria-hidden className="mx-auto block h-1 w-9 rounded-[2px] bg-text-tertiary" />
        <div className="flex items-center justify-between pt-3.5">
          <SheetTitle className="text-lg leading-6 font-extrabold tracking-normal text-foreground">
            {title}
          </SheetTitle>
          <button
            type="button"
            onClick={onToday}
            className="rounded-full bg-brand-subtle px-3 py-1.5 text-[13px] leading-4 font-bold text-brand-subtle-text"
          >
            오늘
          </button>
        </div>
        {children}
      </SheetContent>
    </Sheet>
  );
}

function PickerNav({
  label,
  prevLabel,
  nextLabel,
  canGoNext,
  onPrev,
  onNext,
}: {
  label: string;
  prevLabel: string;
  nextLabel: string;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-1 pt-2.5">
      <button
        type="button"
        aria-label={prevLabel}
        onClick={onPrev}
        className="flex size-11 items-center justify-center"
      >
        <IconChevronLeft size={13} color="var(--color-foreground)" />
      </button>
      <span className="text-base leading-5 font-bold text-foreground tabular-nums">{label}</span>
      <button
        type="button"
        aria-label={nextLabel}
        disabled={!canGoNext}
        onClick={onNext}
        className="flex size-11 items-center justify-center disabled:cursor-not-allowed"
      >
        <IconChevronRight
          size={12}
          color={canGoNext ? "var(--color-foreground)" : "var(--color-text-tertiary)"}
        />
      </button>
    </div>
  );
}

export function MonthPickerSheet({
  open,
  onOpenChange,
  month,
  todayKey,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 지금 보고 있는 달 — 선택 표시와 처음 펼칠 연도의 기준이다. */
  month: CalendarMonth;
  todayKey: string;
  onPick: (month: CalendarMonth, toToday: boolean) => void;
}) {
  return (
    <PickerSheet
      open={open}
      onOpenChange={onOpenChange}
      title="월 선택"
      onToday={() => onPick(monthOfDateKey(todayKey), true)}
    >
      {/* 시트 내용은 열릴 때마다 새로 마운트돼, 넘겨 보던 연도가 다음에 남지 않는다. */}
      <MonthGrid month={month} todayKey={todayKey} onPick={(picked) => onPick(picked, false)} />
    </PickerSheet>
  );
}

function MonthGrid({
  month,
  todayKey,
  onPick,
}: {
  month: CalendarMonth;
  todayKey: string;
  onPick: (month: CalendarMonth) => void;
}) {
  const [year, setYear] = useState(month.year);
  const thisYear = monthOfDateKey(todayKey).year;

  return (
    <>
      <PickerNav
        label={`${String(year)}년`}
        prevLabel="이전 해"
        nextLabel="다음 해"
        canGoNext={year < thisYear}
        onPrev={() => setYear((current) => current - 1)}
        onNext={() => setYear((current) => Math.min(thisYear, current + 1))}
      />
      <div className="grid grid-cols-4 gap-2 pt-1.5">
        {MONTHS.map((value) => {
          const candidate = { year, month: value };
          const selected = year === month.year && value === month.month;
          const future = isFutureMonth(candidate, todayKey);
          return (
            <button
              key={value}
              type="button"
              disabled={future}
              aria-pressed={selected}
              onClick={() => onPick(candidate)}
              className={`rounded-[12px] py-[13px] text-sm leading-[18px] tabular-nums disabled:cursor-not-allowed ${
                selected
                  ? "bg-primary font-bold text-primary-foreground"
                  : future
                    ? "border border-border font-medium text-text-tertiary"
                    : "bg-bg-layer-2 font-medium text-foreground"
              }`}
            >
              {value}월
            </button>
          );
        })}
      </div>
    </>
  );
}

export function WeekPickerSheet({
  open,
  onOpenChange,
  weekAnchorKey,
  todayKey,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 지금 보고 있는 주 안의 아무 날짜 — 그 주의 행을 강조한다. */
  weekAnchorKey: string;
  todayKey: string;
  /** 고른 날짜를 넘긴다 — 그 날이 속한 주로 이동하는 것은 받는 쪽 몫이다. */
  onPick: (dateKey: string, toToday: boolean) => void;
}) {
  return (
    <PickerSheet
      open={open}
      onOpenChange={onOpenChange}
      title="주 선택"
      onToday={() => onPick(todayKey, true)}
    >
      <WeekGrid
        weekAnchorKey={weekAnchorKey}
        todayKey={todayKey}
        onPick={(dateKey) => onPick(dateKey, false)}
      />
    </PickerSheet>
  );
}

function WeekGrid({
  weekAnchorKey,
  todayKey,
  onPick,
}: {
  weekAnchorKey: string;
  todayKey: string;
  onPick: (dateKey: string) => void;
}) {
  const selectedWeek = mondayWeekDateKeys(weekAnchorKey);
  // 보는 주가 두 달에 걸치면 그 주가 시작하는 달부터 연다.
  const [viewMonth, setViewMonth] = useState(() => monthOfDateKey(selectedWeek[0]!));
  const grid = buildMonthGrid(viewMonth, "monday");
  const canGoNext = !isFutureMonth(shiftMonth(viewMonth, 1), todayKey);

  return (
    <>
      <PickerNav
        label={monthLabel(viewMonth)}
        prevLabel="이전 달"
        nextLabel="다음 달"
        canGoNext={canGoNext}
        onPrev={() => setViewMonth((current) => shiftMonth(current, -1))}
        onNext={() => setViewMonth((current) => (canGoNext ? shiftMonth(current, 1) : current))}
      />
      <div className="flex pb-1">
        {MONDAY_FIRST_WEEKDAY_LABELS.map((label) => (
          <span
            key={label}
            className="flex-1 text-center text-[11.5px] leading-[15px] font-medium text-muted-foreground"
          >
            {label}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {grid.map((week) => {
          const inSelectedWeek = week.some(
            (dateKey) => dateKey !== null && selectedWeek.includes(dateKey),
          );
          return (
            <div
              key={week.find((cell) => cell !== null) ?? "empty-week"}
              className={`flex rounded-full ${inSelectedWeek ? "bg-brand-subtle" : ""}`}
            >
              {week.map((dateKey, index) =>
                dateKey === null ? (
                  <span key={`blank-${String(index)}`} className="h-9 flex-1" />
                ) : (
                  <WeekGridDay
                    key={dateKey}
                    dateKey={dateKey}
                    isToday={dateKey === todayKey}
                    isFuture={isFutureDateKey(dateKey, todayKey)}
                    inSelectedWeek={inSelectedWeek}
                    onPick={onPick}
                  />
                ),
              )}
            </div>
          );
        })}
      </div>
      <p className="pt-3 text-center text-[11px] leading-[14px] text-text-tertiary">
        날짜를 탭하면 그 날이 속한 주로 이동해요
      </p>
    </>
  );
}

function WeekGridDay({
  dateKey,
  isToday,
  isFuture,
  inSelectedWeek,
  onPick,
}: {
  dateKey: string;
  isToday: boolean;
  isFuture: boolean;
  inSelectedWeek: boolean;
  onPick: (dateKey: string) => void;
}) {
  const day = dayOfDateKey(dateKey);
  const tone = isToday
    ? "bg-foreground font-bold text-background"
    : isFuture
      ? "text-text-tertiary"
      : inSelectedWeek
        ? "font-bold text-brand-subtle-text"
        : "font-medium text-foreground";

  return (
    <button
      type="button"
      disabled={isFuture}
      aria-label={`${isToday ? "오늘, " : ""}${String(monthOfDateKey(dateKey).month)}월 ${String(day)}일`}
      onClick={() => onPick(dateKey)}
      className="flex h-9 flex-1 items-center justify-center disabled:cursor-not-allowed"
    >
      <span
        className={`flex size-7 items-center justify-center rounded-full text-sm leading-[18px] tabular-nums ${tone}`}
      >
        {day}
      </span>
    </button>
  );
}
