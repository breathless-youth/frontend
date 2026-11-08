import { Pencil, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toKoreanDuration } from "@/features/study-session/formatDuration";
import { subjectColorVar } from "@/features/records/recordsTimetable";
import { cn } from "@/lib/utils";
import { RecordDraftError, recordDraftDurationSec, type RecordDraftBlock } from "./recordDraft";
import { recordClock, recordClockTime } from "./recordGeometry";
import { useRecordPanelGesture } from "./useRecordPanelGesture";
import { plannerDayWindow } from "../plannerDay";

export function RecordBlockSheet({
  block,
  dateKey,
  timeZone,
  label,
  colorIndex,
  edited = block.edited ?? false,
  autoFocusTimes = false,
  hiddenBehindSheet = false,
  disabled,
  onChange,
  onSubject,
  onDelete,
  onDone,
  onDismiss = onDone,
  isDismissBlocked,
  getHeightLimit,
  onError,
  durationSec = recordDraftDurationSec(block),
  readOnlyReason,
  timeEdit,
}: {
  block: RecordDraftBlock;
  dateKey: string;
  timeZone: string;
  label: string;
  colorIndex: number | undefined;
  edited?: boolean;
  autoFocusTimes?: boolean;
  hiddenBehindSheet?: boolean;
  disabled: boolean;
  onChange: (patch: Partial<Pick<RecordDraftBlock, "startMs" | "endMs" | "subjectId">>) => boolean;
  onSubject: (applySubject: (subjectId: number | null) => boolean) => void;
  onDelete: () => void;
  onDone: () => void;
  onDismiss?: () => void;
  isDismissBlocked?: () => boolean;
  getHeightLimit?: () => number;
  onError: (code: RecordDraftError["code"]) => void;
  durationSec?: number;
  readOnlyReason?: string;
  timeEdit?: { active: boolean; available: boolean; blockedReason: string; onStart: () => void };
}) {
  const { t } = useTranslation(["planner", "records"]);
  const color = colorIndex === undefined ? "var(--primary)" : subjectColorVar(colorIndex);
  const [editingTimes, setEditingTimes] = useState(autoFocusTimes);
  const timesId = useId();
  const { panelRef, offsetY, maxHeight, dragging, handleProps } = useRecordPanelGesture({
    disabled: disabled || hiddenBehindSheet,
    onDismiss,
    isDismissBlocked,
    getHeightLimit,
  });
  const [times, setTimes] = useState({
    baseStart: block.startMs,
    baseEnd: block.endMs,
    start: recordClock(block.startMs, timeZone),
    end: recordClock(block.endMs, timeZone),
  });
  if (times.baseStart !== block.startMs || times.baseEnd !== block.endMs)
    setTimes({
      baseStart: block.startMs,
      baseEnd: block.endMs,
      start: recordClock(block.startMs, timeZone),
      end: recordClock(block.endMs, timeZone),
    });
  const window = plannerDayWindow(dateKey, timeZone);
  const shiftedDate = (days: number) =>
    new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  function applyTimes(next: typeof times, subjectId?: number | null): boolean {
    try {
      return onChange({
        ...(subjectId === undefined ? {} : { subjectId }),
        startMs:
          next.start === recordClock(block.startMs, timeZone)
            ? block.startMs
            : next.start
              ? recordClockTime(
                  next.start,
                  block.startMs < window.startMs ? shiftedDate(-1) : dateKey,
                  timeZone,
                  "start",
                  block.startMs,
                )
              : Number.NaN,
        endMs:
          next.end === recordClock(block.endMs, timeZone)
            ? block.endMs
            : next.end
              ? recordClockTime(
                  next.end,
                  block.endMs > window.endMs ? shiftedDate(1) : dateKey,
                  timeZone,
                  "end",
                  block.endMs,
                )
              : Number.NaN,
      });
    } catch (cause) {
      if (cause instanceof RecordDraftError) {
        onError(cause.code);
        return false;
      }
      throw cause;
    }
  }
  return (
    <section
      ref={panelRef}
      aria-label={t("record.selected")}
      style={{
        maxHeight,
        transform: `translateY(${offsetY}px)`,
        visibility: hiddenBehindSheet ? "hidden" : undefined,
      }}
      className={cn(
        "relative z-40 flex shrink-0 flex-col overflow-hidden rounded-t-3xl bg-muted px-5 shadow-[0_-12px_40px_rgba(0,0,0,0.18)] [@media(min-height:501px)]:touch-pan-x",
        !dragging && "motion-safe:transition-transform motion-safe:duration-200",
      )}
    >
      <button
        type="button"
        aria-label={t("record.closePanel")}
        disabled={disabled || hiddenBehindSheet}
        className="-mx-5 flex h-11 shrink-0 touch-none cursor-ns-resize justify-center pt-2.5 outline-none select-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        {...handleProps}
      >
        <span aria-hidden className="h-1 w-9 rounded-full bg-border-strong" />
      </button>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-clip [@media(max-height:500px)]:overflow-y-auto [@media(max-height:500px)]:overscroll-contain">
        {timeEdit && (
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{t(timeEdit.active ? "record.timeMode" : "record.rangeMode")}</span>
            {!timeEdit.active && (
              <Button
                variant="secondary"
                className="h-9 px-3 text-xs"
                disabled={disabled || !timeEdit.available}
                onClick={timeEdit.onStart}
              >
                {t("record.editTime")}
              </Button>
            )}
          </div>
        )}
        {timeEdit && !timeEdit.active && !timeEdit.available && (
          <p className="text-xs text-muted-foreground">{timeEdit.blockedReason}</p>
        )}
        {timeEdit?.active && (
          <p className="text-xs text-muted-foreground">{t("record.timeSaveHint")}</p>
        )}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-1.5 text-[13px] leading-4.5 font-semibold text-muted-foreground">
              <span
                aria-hidden
                className="size-3.5 shrink-0 rounded-xs border-l-3"
                style={{
                  borderColor: color,
                  background: `color-mix(in srgb, ${color} 30%, var(--muted))`,
                }}
              />
              <span className="font-bold wrap-break-word text-foreground">{label}</span>
              {edited && (
                <Pencil size={11} role="img" aria-label={t("record.edited")} className="shrink-0" />
              )}
              {block.source === "MANUAL" && <span>· {t("records:manualItem.badge")}</span>}
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2 text-[22px] leading-7.5 font-extrabold tabular-nums">
              <Button
                variant="unstyled"
                aria-expanded={editingTimes}
                aria-controls={timesId}
                onClick={() => setEditingTimes((value) => !value)}
                className="relative h-auto rounded-none p-0 text-[22px] leading-7.5 font-extrabold before:absolute before:inset-x-0 before:-inset-y-1.75"
              >
                {recordClock(block.startMs, timeZone)} – {recordClock(block.endMs, timeZone)}
              </Button>
              <span className="text-sm leading-5 font-semibold text-muted-foreground">
                {toKoreanDuration(durationSec)}
              </span>
            </div>
          </div>
          {!timeEdit?.active && (
            <Button
              variant="unstyled"
              aria-label={t("record.delete")}
              disabled={disabled || block.locked}
              onClick={onDelete}
              className="mt-0.5 size-11 shrink-0 rounded-full bg-feedback-danger/10 p-0 text-feedback-danger"
            >
              <Trash2 aria-hidden size={20} />
            </Button>
          )}
        </div>
        <div
          id={timesId}
          className={cn(
            "grid grid-cols-2 gap-3",
            !editingTimes && "sr-only focus-within:not-sr-only",
          )}
        >
          {(["start", "end"] as const).map((edge) => (
            <label key={edge} className="text-xs text-muted-foreground">
              {t(edge === "start" ? "record.start" : "record.end")}
              <Input
                type="time"
                step={60}
                autoFocus={autoFocusTimes && edge === "start"}
                onFocus={() => setEditingTimes(true)}
                disabled={disabled || block.locked}
                value={times[edge]}
                onChange={(event) => {
                  const value = event.target.value;
                  const next = { ...times, [edge]: value };
                  setTimes(next);
                  applyTimes(next);
                }}
                className="mt-1 h-11 appearance-none rounded-md px-3 tabular-nums"
              />
            </label>
          ))}
        </div>
        {block.locked && (
          <p role="alert" className="text-[13px] text-state-distract-text">
            {readOnlyReason ?? t("record.boundary")}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-2 pt-4 pb-[max(30px,env(safe-area-inset-bottom))]">
        {!timeEdit?.active && (
          <Button
            variant="secondary"
            disabled={disabled || block.locked}
            onClick={() => onSubject((subjectId) => applyTimes(times, subjectId))}
            className="h-13 flex-1 rounded-lg text-[15px] leading-5.5 font-bold"
          >
            {t("record.changeSubject")}
          </Button>
        )}
        <Button
          disabled={disabled || !times.start || !times.end}
          onClick={() => {
            if (block.locked || applyTimes(times)) onDone();
          }}
          className="h-13 flex-1 rounded-lg text-base leading-6 font-bold shadow-sb-cta"
        >
          {t(timeEdit?.active ? "record.applyTime" : "repeat.done")}
        </Button>
      </div>
    </section>
  );
}
