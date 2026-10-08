import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Calendar, CalendarDayButton, type CalendarDayButtonProps } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

import { PeriodNav } from "./PeriodNav";
import { useHorizontalSwipe } from "./useHorizontalSwipe";
import {
  type CalendarMonth,
  dateKeyOfDate,
  dateOfDateKey,
  monthLabel,
  monthOfDateKey,
  shiftMonth,
} from "./recordsFormat";
import { isFutureMonth, mondayWeekDateKeys } from "./recordsPeriod";

/**
 * 기간 선택 시트(S5-2) — 기간 라벨을 탭하면 열려 먼 달·주로 한 번에 옮긴다.
 *
 * 일간은 달 선택, 주간은 주 선택, 플래너는 날짜 선택이다. 둘 다 `오늘`로 오늘이 속한 달·주로 돌아오고 미래는 고를 수 없다.
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
          <SheetTitle className="text-lg leading-[21px] font-bold tracking-normal text-foreground">
            {title}
          </SheetTitle>
          <Button
            variant="raised"
            onClick={onToday}
            className="h-8 rounded-full px-3.5 py-0 text-[13px] leading-4 text-brand-subtle-text"
          >
            오늘
          </Button>
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
    <PeriodNav
      prevLabel={prevLabel}
      nextLabel={nextLabel}
      canGoNext={canGoNext}
      onPrev={onPrev}
      onNext={onNext}
      className="pt-3"
    >
      <span className="w-[120px] text-center text-[15px] leading-[18px] font-bold text-foreground tabular-nums">
        {label}
      </span>
    </PeriodNav>
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
      title="달 선택"
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
  const goPrev = () => setYear((current) => current - 1);
  const goNext = () => setYear((current) => Math.min(thisYear, current + 1));
  // 격자를 좌우로 밀어도 해를 넘긴다(기록 탭 달력과 같은 판정). 격자 칸 사이를 가로질러 놓으면
  // 누른 칸과 놓은 칸이 달라 달 선택 click은 나지 않는다.
  const swipe = useHorizontalSwipe((delta) => (delta < 0 ? goPrev() : goNext()));

  return (
    <>
      <PickerNav
        label={`${String(year)}년`}
        prevLabel="이전 해"
        nextLabel="다음 해"
        canGoNext={year < thisYear}
        onPrev={goPrev}
        onNext={goNext}
      />
      <ToggleGroup
        type="single"
        value={year === month.year ? String(month.month) : ""}
        // 고른 달을 다시 누르면 ToggleGroup은 선택을 풀어 빈 값을 준다 — 그때도 그 달을 고른 것으로 넘긴다.
        onValueChange={(value) => onPick({ year, month: Number(value || month.month) })}
        data-testid="month-picker-swipe-area"
        className="grid grid-cols-4 gap-2 pt-2 touch-pan-y"
        {...swipe}
      >
        {MONTHS.map((value) => (
          <ToggleGroupItem
            key={value}
            value={String(value)}
            disabled={isFutureMonth({ year, month: value }, todayKey)}
            // 공용 칩 모양(테두리·알약·히트 영역)을 격자 칸 모양으로 덮어쓴다.
            className="h-11 justify-center rounded-[12px] border-0 bg-bg-layer-2 px-0 text-sm leading-[18px] text-foreground tabular-nums before:hidden disabled:cursor-not-allowed disabled:opacity-35 data-[state=on]:font-bold"
          >
            {value}월
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
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
  const canGoNext = !isFutureMonth(shiftMonth(viewMonth, 1), todayKey);
  const today = dateOfDateKey(todayKey);
  const goPrev = () => setViewMonth((current) => shiftMonth(current, -1));
  const goNext = () => setViewMonth((current) => (canGoNext ? shiftMonth(current, 1) : current));
  const swipe = useHorizontalSwipe((delta) => (delta < 0 ? goPrev() : goNext()));

  return (
    <>
      <PickerNav
        label={monthLabel(viewMonth)}
        prevLabel="이전 달"
        nextLabel="다음 달"
        canGoNext={canGoNext}
        onPrev={goPrev}
        onNext={goNext}
      />
      {/* 달력을 좌우로 밀어도 달을 넘긴다 — DayPicker는 포인터 핸들러를 루트에 내리지 않아 감싼다. */}
      <div data-testid="week-picker-swipe-area" className="touch-pan-y" {...swipe}>
        <Calendar
          // 주는 달을 넘나들어도 한 줄이다 — 달의 첫 주·마지막 주는 이웃 달 날짜로 채운다.
          showOutsideDays
          month={dateOfMonth(viewMonth)}
          today={today}
          disabled={{ after: today }}
          modifiers={{
            inWeek: selectedWeek.map(dateOfDateKey),
            // 월요일이 아직 오지 않은 주는 통째로 고를 수 없다 — 이번 주 일요일 뒤의 날이 그렇다.
            futureWeek: { after: dateOfDateKey(mondayWeekDateKeys(todayKey)[6]!) },
          }}
          modifiersClassNames={{
            inWeek: "bg-brand-subtle first:rounded-l-[12px] last:rounded-r-[12px]",
            futureWeek: "opacity-35",
          }}
          onDayClick={(date, modifiers) => {
            if (!modifiers.disabled) {
              onPick(dateKeyOfDate(date));
            }
          }}
          className="pt-2"
          classNames={PICKER_GRID_CLASSNAMES}
          components={{ DayButton: WeekGridDay }}
        />
      </div>
    </>
  );
}

const PICKER_GRID_CLASSNAMES = {
  weekdays: "flex pb-1",
  weeks: "flex flex-col gap-1",
  week: "flex h-10",
};

function dateOfMonth({ year, month }: CalendarMonth): Date {
  return new Date(year, month - 1);
}

function dayLabel(date: Date, isToday: boolean): string {
  return `${isToday ? "오늘, " : ""}${String(date.getMonth() + 1)}월 ${String(date.getDate())}일`;
}

function WeekGridDay({ day, modifiers, ...props }: CalendarDayButtonProps) {
  const tone = modifiers.disabled
    ? "text-text-disabled"
    : modifiers.inWeek
      ? "text-brand-subtle-text"
      : // 이웃 달 날짜는 흐리게 적는다.
        modifiers.outside
        ? "text-text-disabled"
        : "text-foreground";

  return (
    <CalendarDayButton
      day={day}
      modifiers={modifiers}
      {...props}
      aria-label={dayLabel(day.date, Boolean(modifiers.today))}
      className={cn(
        "flex h-full w-full items-center justify-center text-sm leading-[18px] tabular-nums disabled:cursor-not-allowed",
        tone,
        modifiers.today ? "font-extrabold" : "font-medium",
      )}
    >
      {day.date.getDate()}
    </CalendarDayButton>
  );
}

export function DayPickerSheet({
  open,
  onOpenChange,
  dateKey,
  todayKey,
  allowFuture = false,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 지금 보고 있는 날 — 선택 표시와 처음 펼칠 달의 기준이다. */
  dateKey: string;
  /** 오늘. `allowFuture`가 아니면 고를 수 있는 마지막 날이기도 하다. */
  todayKey: string;
  /** 오늘 뒤의 날도 고를 수 있다 — 플래너는 미래 날짜도 넘겨 본다. */
  allowFuture?: boolean;
  onPick: (dateKey: string, toToday: boolean) => void;
}) {
  return (
    <PickerSheet
      open={open}
      onOpenChange={onOpenChange}
      title="날짜 선택"
      onToday={() => onPick(todayKey, true)}
    >
      <DayGrid
        dateKey={dateKey}
        todayKey={todayKey}
        allowFuture={allowFuture}
        onPick={(picked) => onPick(picked, false)}
      />
    </PickerSheet>
  );
}

function DayGrid({
  dateKey,
  todayKey,
  allowFuture,
  onPick,
}: {
  dateKey: string;
  todayKey: string;
  allowFuture: boolean;
  onPick: (dateKey: string) => void;
}) {
  const [viewMonth, setViewMonth] = useState(() => monthOfDateKey(dateKey));
  const today = dateOfDateKey(todayKey);
  const canGoNext = allowFuture || !isFutureMonth(shiftMonth(viewMonth, 1), todayKey);
  const goPrev = () => setViewMonth((current) => shiftMonth(current, -1));
  const goNext = () => setViewMonth((current) => (canGoNext ? shiftMonth(current, 1) : current));
  const swipe = useHorizontalSwipe((delta) => (delta < 0 ? goPrev() : goNext()));

  return (
    <>
      <PickerNav
        label={monthLabel(viewMonth)}
        prevLabel="이전 달"
        nextLabel="다음 달"
        canGoNext={canGoNext}
        onPrev={goPrev}
        onNext={goNext}
      />
      {/* 주 선택과 같은 이유로 감싼다 — 달력을 좌우로 밀어도 달을 넘긴다. */}
      <div data-testid="day-picker-swipe-area" className="touch-pan-y" {...swipe}>
        <Calendar
          mode="single"
          required
          month={dateOfMonth(viewMonth)}
          today={today}
          selected={dateOfDateKey(dateKey)}
          disabled={allowFuture ? undefined : { after: today }}
          onSelect={(date) => onPick(dateKeyOfDate(date))}
          className="pt-2"
          classNames={PICKER_GRID_CLASSNAMES}
          components={{ DayButton: DayGridDay }}
        />
      </div>
    </>
  );
}

function DayGridDay({ day, modifiers, ...props }: CalendarDayButtonProps) {
  return (
    <CalendarDayButton
      day={day}
      modifiers={modifiers}
      {...props}
      aria-pressed={Boolean(modifiers.selected)}
      aria-label={dayLabel(day.date, Boolean(modifiers.today))}
      className="flex h-full w-full items-center justify-center disabled:cursor-not-allowed"
    >
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-full text-sm leading-[18px] tabular-nums",
          modifiers.selected
            ? "bg-primary font-bold text-primary-foreground"
            : modifiers.disabled
              ? "font-medium text-text-disabled"
              : modifiers.today
                ? "font-extrabold text-foreground"
                : "font-medium text-foreground",
        )}
      >
        {day.date.getDate()}
      </span>
    </CalendarDayButton>
  );
}
