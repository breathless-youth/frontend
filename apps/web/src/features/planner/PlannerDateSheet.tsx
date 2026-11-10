import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar, CalendarDayButton, type CalendarDayButtonProps } from "@/components/ui/calendar";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  buildMonthGrid,
  dateKeyOfDate,
  dateOfDateKey,
  formatMonthDay,
  monthLabel,
  monthOfDateKey,
  shiftMonth,
} from "@/features/records/recordsFormat";
import { useHorizontalSwipe } from "@/features/records/useHorizontalSwipe";
import { plannerSummaryQuery } from "@/lib/plannerQueries";
import { cn } from "@/lib/utils";

import { plannerErrorCopy } from "./plannerErrorCopy";
import { usePlannerClock } from "./usePlannerClock";

interface PlannerDateSheetProps {
  theme?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: number | null;
  dateKey: string;
  todayKey: string;
  onPick: (dateKey: string) => void;
  minDate?: string;
  maxDate?: string;
  excludeDate?: string;
  title?: string;
  subtitle?: string;
  confirmLabel?: (dateKey: string) => string;
  onConfirm?: (dateKey: string) => Promise<void>;
}

export function PlannerDateSheet(props: PlannerDateSheetProps) {
  const { t } = useTranslation("planner");
  const [pending, setPending] = useState(false);
  return (
    <Drawer
      open={props.open}
      onOpenChange={(next, details) => {
        if (pending) {
          details.cancel();
          return;
        }
        props.onOpenChange(next);
      }}
    >
      <DrawerContent
        variant="planner"
        bottomSpacing="compact"
        aria-label={props.title ?? t("plan.calendar")}
        className={props.theme ?? "theme-soft-blue"}
        initialFocus={false}
        finalFocus={false}
      >
        <PlannerCalendar {...props} pending={pending} setPending={setPending} />
      </DrawerContent>
    </Drawer>
  );
}

function PlannerCalendar({
  userId,
  dateKey,
  todayKey,
  onPick,
  onOpenChange,
  minDate,
  maxDate,
  excludeDate,
  title,
  subtitle,
  confirmLabel,
  onConfirm,
  pending,
  setPending,
}: PlannerDateSheetProps & { pending: boolean; setPending: (pending: boolean) => void }) {
  const { t } = useTranslation(["planner", "records", "common"]);
  const { timeZone } = usePlannerClock();
  const [month, setMonth] = useState(() => monthOfDateKey(dateKey));
  const [selected, setSelected] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const dates = buildMonthGrid(month)
    .flat()
    .filter((date): date is string => date !== null);
  const summary = useQuery({
    ...plannerSummaryQuery(userId ?? 0, { from: dates[0]!, to: dates.at(-1)! }, timeZone),
    enabled: userId !== null,
  });
  const choose = (date: string) => {
    if (
      pending ||
      (minDate !== undefined && date < minDate) ||
      (maxDate !== undefined && date > maxDate) ||
      date === excludeDate
    )
      return;
    if (onConfirm !== undefined) {
      setSelected(date);
      return;
    }
    onPick(date);
    onOpenChange(false);
  };
  const changeMonth = (delta: -1 | 1) => setMonth((current) => shiftMonth(current, delta));
  const swipe = useHorizontalSwipe(changeMonth);
  const studied = (summary.data ?? [])
    .filter((day) => day.studied)
    .map((day) => dateOfDateKey(day.date));
  const tasksOnly = (summary.data ?? [])
    .filter((day) => day.hasTasks && !day.studied)
    .map((day) => dateOfDateKey(day.date));

  return (
    <div className="flex flex-col gap-3.5 pt-3.5">
      {onConfirm !== undefined && (
        <div className="flex flex-col gap-0.5">
          <DrawerTitle className="text-lg leading-6.5 font-bold">
            {title ?? t("plan.moveTitle")}
          </DrawerTitle>
          {subtitle !== undefined && (
            <p className="text-[13px] leading-4.5 text-muted-foreground">{subtitle}</p>
          )}
        </div>
      )}
      <div data-base-ui-swipe-ignore="" className="flex items-center justify-between">
        <Button
          variant="unstyled"
          aria-label={t("records:picker.aria.prevMonth")}
          disabled={pending}
          onClick={() => changeMonth(-1)}
          className={cn(
            "relative p-0 before:absolute before:-inset-1",
            onConfirm ? "size-9" : "size-10",
          )}
        >
          <ChevronLeft aria-hidden size={onConfirm ? 18 : 20} strokeWidth={2.2} />
        </Button>
        {onConfirm !== undefined ? (
          <span className="text-[15px] leading-5.5 font-bold tabular-nums">
            {monthLabel(month)}
          </span>
        ) : (
          <DrawerTitle className="text-lg leading-6.5 font-bold tabular-nums">
            {monthLabel(month)}
          </DrawerTitle>
        )}
        <Button
          variant="unstyled"
          aria-label={t("records:picker.aria.nextMonth")}
          disabled={pending}
          onClick={() => changeMonth(1)}
          className={cn(
            "relative p-0 before:absolute before:-inset-1",
            onConfirm ? "size-9" : "size-10",
          )}
        >
          <ChevronRight aria-hidden size={onConfirm ? 18 : 20} strokeWidth={2.2} />
        </Button>
      </div>
      <div data-base-ui-swipe-ignore="x" className="touch-pan-y" {...swipe}>
        <Calendar
          mode="single"
          weekStartsOn={0}
          required
          month={dateOfDateKey(dates[0]!)}
          today={dateOfDateKey(todayKey)}
          selected={dateOfDateKey(selected ?? dateKey)}
          disabled={(date) =>
            pending ||
            (minDate !== undefined && dateKeyOfDate(date) < minDate) ||
            (maxDate !== undefined && dateKeyOfDate(date) > maxDate) ||
            dateKeyOfDate(date) === excludeDate
          }
          onSelect={(date) => choose(dateKeyOfDate(date))}
          modifiers={onConfirm ? {} : { studied, tasksOnly }}
          components={{ DayButton: onConfirm ? PlannerMoveDay : PlannerGridDay }}
          classNames={{
            weekdays: "mb-3.5 flex",
            weekday: "flex-1 text-center text-xs leading-4 font-semibold text-muted-foreground",
            weeks: cn("flex flex-col", onConfirm ? "gap-0.5" : "gap-1"),
            week: cn("flex", onConfirm ? "h-10" : "h-12"),
          }}
        />
      </div>
      {onConfirm !== undefined && (
        <>
          {failure !== null && (
            <p role="alert" className="text-sm text-state-distract-text">
              {plannerErrorCopy(failure)}
            </p>
          )}
          <Button
            data-base-ui-swipe-ignore=""
            disabled={pending || selected === null}
            className="h-13 w-full rounded-xl text-base leading-6 font-bold shadow-sb-cta"
            onClick={() => {
              if (selected === null || pending) return;
              setPending(true);
              setFailure(null);
              void onConfirm(selected)
                .then(
                  () => onOpenChange(false),
                  (error: unknown) => setFailure(error ?? new Error("planner move failed")),
                )
                .finally(() => setPending(false));
            }}
          >
            {confirmLabel?.(selected ?? dateKey)}
          </Button>
        </>
      )}
      {userId !== null && summary.isPending && <Skeleton className="h-4 w-full rounded-md" />}
      {summary.isError && (
        <ErrorState
          message={t("page.loadFailed")}
          onRetry={() => void summary.refetch()}
          screen="planner"
        />
      )}
      {onConfirm === undefined && (
        <div className="flex justify-center gap-4 text-xs leading-4 text-muted-foreground">
          <span className="flex items-center gap-1.25">
            <span aria-hidden className="size-3 rounded-full bg-brand-subtle" />
            {t("calendar.studied")}
          </span>
          <span className="flex items-center gap-1.25">
            <span
              aria-hidden
              className="size-3 rounded-full border-[1.5px] border-dashed border-primary"
            />
            {t("calendar.tasks")}
          </span>
        </div>
      )}
    </div>
  );
}

function PlannerMoveDay(props: CalendarDayButtonProps) {
  return <PlannerGridDay {...props} compact />;
}

function PlannerGridDay({
  day,
  modifiers,
  compact = false,
  ...props
}: CalendarDayButtonProps & { compact?: boolean }) {
  const { t } = useTranslation("planner");
  const labels = [formatMonthDay(dateKeyOfDate(day.date))];
  if (modifiers.today) labels.push(t("calendar.today"));
  if (modifiers.studied) labels.push(t("calendar.studied"));
  else if (modifiers.tasksOnly) labels.push(t("calendar.tasks"));
  return (
    <CalendarDayButton
      {...props}
      day={day}
      modifiers={modifiers}
      aria-label={labels.join(", ")}
      aria-pressed={Boolean(modifiers.selected)}
      className={cn(
        "relative flex w-full items-center justify-center p-0 before:absolute before:-inset-y-0.5",
        compact ? "h-10" : "h-12 flex-col gap-0.75",
      )}
    >
      <span
        className={cn(
          "flex size-8 items-center justify-center rounded-full text-[15px] font-medium tabular-nums",
          modifiers.selected && "bg-primary font-extrabold text-primary-foreground",
          !modifiers.selected && modifiers.studied && "bg-brand-subtle font-extrabold text-primary",
          !modifiers.selected &&
            modifiers.tasksOnly &&
            "border-[1.5px] border-dashed border-primary font-semibold",
          !modifiers.selected &&
            compact &&
            modifiers.today &&
            "border-[1.5px] border-primary font-extrabold text-primary",
          !compact && modifiers.today && "outline-2 outline-offset-1 outline-foreground",
          modifiers.disabled && "text-text-tertiary",
        )}
      >
        {day.date.getDate()}
      </span>
      {!compact && <span aria-hidden className="size-1.25" />}
    </CalendarDayButton>
  );
}
