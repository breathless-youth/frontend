import type { PlannerRepeatRequest, PlannerWeekday } from "@focusmakers/types";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar, CalendarDayButton, type CalendarDayButtonProps } from "@/components/ui/calendar";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import {
  dateKeyOfDate,
  dateOfDateKey,
  formatMonthDay,
  weekdayIndexOfDateKey,
} from "@/features/records/recordsFormat";
import { cn } from "@/lib/utils";
import { PlannerDateSheet } from "./PlannerDateSheet";
const DAYS: PlannerWeekday[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];
const PRESETS = {
  none: [],
  daily: DAYS,
  weekdays: DAYS.slice(0, 5),
  weekends: DAYS.slice(5),
} satisfies Record<string, PlannerWeekday[]>;
export interface PlannerRepeatSheetProps {
  theme?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dateKey: string;
  userId: number | null;
  initial: PlannerRepeatRequest | null | undefined;
  taskName?: string;
  loading?: boolean;
  onRetry?: () => void;
  initialPanel?: "rule" | "end";
  onSave: (value: PlannerRepeatRequest) => Promise<void>;
}
export function PlannerRepeatControls({
  value,
  onChange,
  onEnd,
  compact = false,
}: {
  value: PlannerRepeatRequest;
  onChange: (value: PlannerRepeatRequest) => void;
  onEnd: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation("planner");
  return (
    <div className={cn("flex flex-col", compact ? "gap-2.5" : "gap-4.5")}>
      {!compact && (
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((key) => (
            <Button
              key={key}
              data-base-ui-swipe-ignore=""
              variant="unstyled"
              aria-pressed={value.weekdays.join() === PRESETS[key].join()}
              onClick={() => onChange({ ...value, weekdays: [...PRESETS[key]] })}
              className={cn(
                "relative h-10 rounded-full border-[1.5px] border-border bg-muted px-1 py-0 text-sm leading-5 font-semibold before:absolute before:-inset-y-0.5",
                value.weekdays.join() === PRESETS[key].join() &&
                  "border-primary bg-brand-subtle font-bold text-primary",
              )}
            >
              {t(`repeat.${key}`)}
            </Button>
          ))}
        </div>
      )}
      <div role="group" aria-label={t("repeat.weekdayTitle")} className="grid grid-cols-7 gap-1.5">
        {DAYS.map((day) => (
          <Button
            key={day}
            data-base-ui-swipe-ignore=""
            variant="unstyled"
            aria-pressed={value.weekdays.includes(day)}
            onClick={() =>
              onChange({
                ...value,
                weekdays: DAYS.filter((item) =>
                  item === day ? !value.weekdays.includes(day) : value.weekdays.includes(item),
                ),
              })
            }
            className={cn(
              "relative h-10 rounded-full border-[1.5px] border-border bg-muted p-0 text-sm leading-5 font-semibold text-muted-foreground before:absolute before:-inset-y-0.5",
              value.weekdays.includes(day) &&
                "border-primary bg-brand-subtle font-bold text-primary",
            )}
          >
            {t(`repeat.weekday.${day}`)}
          </Button>
        ))}
      </div>
      <Button
        data-base-ui-swipe-ignore=""
        variant="ghost"
        aria-label={t("repeat.endTitle")}
        onClick={onEnd}
        className={cn(
          "w-full justify-start gap-3 rounded-none border-t border-border py-0 text-left font-semibold",
          compact ? "h-11 px-0.5 text-sm leading-5" : "h-13 border-b px-1 text-[15px] leading-5.5",
        )}
      >
        <span className="flex-1">{t("repeat.endTitle")}</span>
        <span className="text-sm font-normal text-muted-foreground">
          {value.endDate ? formatMonthDay(value.endDate) : t("repeat.noEnd")}
        </span>
        <ChevronRight aria-hidden size={16} strokeWidth={2.2} className="text-muted-foreground" />
      </Button>
    </div>
  );
}

export function PlannerRepeatSheet({
  open,
  onOpenChange,
  dateKey,
  userId,
  initial,
  onSave,
  taskName,
  loading = false,
  onRetry,
  initialPanel = "rule",
  theme = "theme-soft-blue",
}: PlannerRepeatSheetProps) {
  const { t } = useTranslation(["planner", "common"]);
  const [value, setValue] = useState<PlannerRepeatRequest>(
    initial ?? { weekdays: [], endDate: null },
  );
  const [initialized, setInitialized] = useState(initial !== undefined);
  // 최초 조회만 초안으로 받는다. 충돌 후 재조회가 편집값과 실패 안내를 지우면 안 된다.
  if (!initialized && initial !== undefined) {
    setValue(initial ?? { weekdays: [], endDate: null });
    setInitialized(true);
  }
  const [panel, setPanel] = useState<"rule" | "end" | "date">(initialPanel);
  const [pending, setPending] = useState(false),
    [failed, setFailed] = useState(false);
  const preset = (Object.keys(PRESETS) as (keyof typeof PRESETS)[]).find(
    (key) => value.weekdays.join() === PRESETS[key].join(),
  );
  const invalidEnd =
    value.endDate !== null && value.endDate !== undefined && value.endDate < dateKey;
  async function saveRule() {
    if (!initialized || pending || invalidEnd) return;
    setPending(true);
    setFailed(false);
    try {
      await onSave({
        weekdays: value.weekdays,
        endDate: value.weekdays.length ? (value.endDate ?? null) : null,
      });
      onOpenChange(false);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }
  const summary =
    value.weekdays.length === 0
      ? t("repeat.none")
      : t(
          preset
            ? value.endDate
              ? "repeat.summaryPresetEnd"
              : "repeat.summaryPreset"
            : value.endDate
              ? "repeat.summaryEnd"
              : "repeat.summary",
          {
            from: formatMonthDay(dateKey),
            to: value.endDate ? formatMonthDay(value.endDate) : "",
            days: preset
              ? t(`repeat.${preset}`)
              : value.weekdays.map((day) => t(`repeat.weekday.${day}`)).join("·"),
          },
        );
  if (panel === "date")
    return (
      <PlannerDateSheet
        theme={theme}
        open={open}
        onOpenChange={() => setPanel("end")}
        userId={userId}
        dateKey={value.endDate ?? dateKey}
        todayKey={dateKey}
        minDate={dateKey}
        onPick={(date) => {
          setValue({ ...value, endDate: date });
          setPanel("end");
        }}
      />
    );
  return (
    <Drawer
      open={open}
      onOpenChange={(next, details) => {
        if (pending) {
          details.cancel();
          return;
        }
        onOpenChange(next);
      }}
    >
      <DrawerContent
        variant="planner"
        bottomSpacing={panel === "end" ? "compact" : "default"}
        className={theme}
        initialFocus={false}
        finalFocus={false}
      >
        <div className={cn("flex flex-col", panel === "end" ? "gap-3 pt-3" : "gap-4.5 pt-4.5")}>
          {panel === "end" ? (
            <div className="flex items-center gap-1">
              <Button
                data-base-ui-swipe-ignore=""
                variant="unstyled"
                aria-label={t("common:actions.back")}
                disabled={pending}
                onClick={() => (initialPanel === "end" ? onOpenChange(false) : setPanel("rule"))}
                className="relative -ml-1.5 size-8 p-0 before:absolute before:-inset-1.5"
              >
                <ChevronLeft aria-hidden size={22} />
              </Button>
              <DrawerTitle className="text-lg leading-6.5 font-bold">
                {t("repeat.endTitle")}
              </DrawerTitle>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              <DrawerTitle className="text-lg leading-6.5 font-bold">
                {t("plan.repeat")}
              </DrawerTitle>
              {taskName !== undefined && (
                <p className="text-[13px] leading-4.5 text-muted-foreground">{taskName}</p>
              )}
            </div>
          )}
          {!initialized ? (
            <div className="flex flex-col gap-3">
              {loading ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {t("common:aria.loading")}
                </p>
              ) : (
                <>
                  <p role="alert" className="text-sm text-muted-foreground">
                    {t("repeat.loadFailed")}
                  </p>
                  <Button
                    data-base-ui-swipe-ignore=""
                    variant="subtle"
                    onClick={onRetry ?? (() => onOpenChange(false))}
                  >
                    {t(onRetry ? "common:actions.retry" : "common:actions.close")}
                  </Button>
                </>
              )}
            </div>
          ) : panel === "end" ? (
            <>
              <fieldset className="flex flex-col" disabled={pending}>
                <legend className="sr-only">{t("repeat.endTitle")}</legend>
                <label
                  data-base-ui-swipe-ignore=""
                  className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-border px-0.5 text-[15px] leading-5.5 font-semibold"
                >
                  <input
                    type="radio"
                    name="planner-repeat-end"
                    checked={!value.endDate}
                    onChange={() => setValue({ ...value, endDate: null })}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden
                    className="size-5 shrink-0 rounded-full border-2 border-border-strong peer-checked:border-6 peer-checked:border-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
                  />
                  {t("repeat.noEnd")}
                </label>
                <label
                  data-base-ui-swipe-ignore=""
                  className="flex min-h-12 cursor-pointer items-center gap-3 px-0.5 text-[15px] leading-5.5 font-bold"
                >
                  <input
                    type="radio"
                    name="planner-repeat-end"
                    checked={Boolean(value.endDate)}
                    onClick={() => setPanel("date")}
                    onChange={() => {}}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden
                    className="size-5 shrink-0 rounded-full border-2 border-border-strong peer-checked:border-6 peer-checked:border-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
                  />
                  {t("repeat.chooseDate")}
                  {value.endDate && (
                    <span className="ml-auto text-sm text-primary">
                      {formatMonthDay(value.endDate)}
                    </span>
                  )}
                </label>
              </fieldset>
              {value.endDate && (
                <div data-base-ui-swipe-ignore="">
                  <Calendar
                    mode="single"
                    required
                    weekStartsOn={0}
                    month={dateOfDateKey(value.endDate)}
                    selected={dateOfDateKey(value.endDate)}
                    disabled={(date) => pending || dateKeyOfDate(date) < dateKey}
                    onSelect={(date) => setValue({ ...value, endDate: dateKeyOfDate(date) })}
                    modifiers={{
                      repeatRange: {
                        from: dateOfDateKey(dateKey),
                        to: dateOfDateKey(value.endDate),
                      },
                      repeatStart: dateOfDateKey(dateKey),
                      repeatDay: (date) =>
                        value.weekdays.includes(
                          DAYS[(weekdayIndexOfDateKey(dateKeyOfDate(date)) + 6) % 7]!,
                        ),
                    }}
                    components={{ DayButton: RepeatEndDay }}
                    classNames={{
                      weekdays: "mb-3 flex",
                      weekday:
                        "flex-1 text-center text-xs leading-4 font-semibold text-muted-foreground",
                      weeks: "flex flex-col gap-0.5",
                      week: "flex h-10",
                    }}
                  />
                </div>
              )}
              <p className="text-[13px] leading-4.5 text-muted-foreground">{summary}</p>
              {failed && (
                <p role="alert" className="text-sm text-state-distract-text">
                  {t("common:errors.retryLater")}
                </p>
              )}
              <Button
                data-base-ui-swipe-ignore=""
                className="h-13 w-full rounded-xl text-base leading-6 font-bold shadow-sb-cta"
                disabled={pending || invalidEnd}
                onClick={() => (initialPanel === "end" ? void saveRule() : setPanel("rule"))}
              >
                {t("record.save")}
              </Button>
            </>
          ) : (
            <div className="flex flex-col gap-4.5">
              <fieldset disabled={pending}>
                <PlannerRepeatControls
                  value={value}
                  onChange={setValue}
                  onEnd={() => setPanel("end")}
                />
              </fieldset>
              <p className="text-[13px] leading-4.5 text-muted-foreground">{summary}</p>
              {failed && (
                <p role="alert" className="text-sm text-state-distract-text">
                  {t("common:errors.retryLater")}
                </p>
              )}
              <Button
                data-base-ui-swipe-ignore=""
                className="h-13 w-full rounded-xl text-base leading-6 font-bold shadow-sb-cta"
                disabled={pending || invalidEnd}
                onClick={() => void saveRule()}
              >
                {t("record.save")}
              </Button>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function RepeatEndDay({ day, modifiers, ...props }: CalendarDayButtonProps) {
  return (
    <CalendarDayButton
      {...props}
      day={day}
      modifiers={modifiers}
      aria-label={formatMonthDay(dateKeyOfDate(day.date))}
      className={cn(
        "relative flex h-10 w-full items-center justify-center p-0 before:absolute before:-inset-y-0.5",
        modifiers.repeatRange && "bg-bg-guide",
        modifiers.repeatStart && "rounded-l-full",
        modifiers.selected && "rounded-r-full",
      )}
    >
      <span
        className={cn(
          "flex size-8 items-center justify-center rounded-full text-[15px] leading-5 font-medium tabular-nums",
          modifiers.repeatRange && modifiers.repeatDay && "font-bold text-primary",
          modifiers.selected && "bg-primary font-extrabold text-primary-foreground",
          modifiers.disabled && "text-text-tertiary",
        )}
      >
        {day.date.getDate()}
      </span>
    </CalendarDayButton>
  );
}
