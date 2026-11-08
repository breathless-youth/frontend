import type { PlannerDayResponse, SubjectResponse } from "@focusmakers/types";
import { ChevronDown, Hand, Pencil } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { GlassChrome } from "@/components/GlassChrome";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  formatDuration,
  formatMonthDay,
  weekdayIndexOfDateKey,
  weekdayShortLabel,
} from "@/features/records/recordsFormat";
import { subjectColorVar } from "@/features/records/recordsTimetable";
import { cn } from "@/lib/utils";
import { showToast, showTopToast } from "@/lib/toast";
import { useKeyboardInset } from "@/lib/useKeyboardInset";
import { PlannerDateSheet } from "../PlannerDateSheet";
import { plannerCurrentTime, plannerDateKeyOf, plannerHours } from "../plannerDay";
import { plannerRecordPaints } from "../plannerPlanDay";
import { usePlannerClock } from "../usePlannerClock";
import {
  createRecordDraft,
  recordDraftOperations,
  changeRecordDraft,
  RecordDraftError,
  type RecordDraftBlock,
  type RecordDraftOperation,
  firstRecordDraftMinute,
  recordDraftDurationSec,
} from "./recordDraft";
import {
  saveRecordDraft,
  acceptSavedRecords,
  recordSaveFailure,
  type RecordSaveFailure,
} from "./recordSave";
import { recordClock, recordWindowRects } from "./recordGeometry";
import { RecordBlockSheet } from "./RecordBlockSheet";
import { RecordSubjectSheet } from "./RecordSubjectSheet";
import {
  RecordDeletePopover,
  type RecordDeleteHandleRect,
  type RecordDeleteRect,
} from "./RecordDeletePopover";
import { addRecordDraft, deleteRecordDraft, type RecordDraftState } from "./recordDraft";
import { recordPointTime } from "./recordGeometry";
import { LONG_PRESS_MS, SWIPE_SLOP_PX } from "@/features/study-session/subjectInteractions";
export interface PlannerRecordEditorProps {
  day: PlannerDayResponse;
  userId?: number | null;
  subjects: readonly SubjectResponse[] | undefined;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onDateChange?: (date: string) => void;
}
export function PlannerRecordEditor({
  day,
  userId = null,
  subjects,
  onClose,
  onSaved,
  onDateChange,
}: PlannerRecordEditorProps) {
  const { t } = useTranslation(["planner", "common", "records"]);
  // 격자는 분 단위 시계를 쓰고, 기록 검증은 조작한 순간의 실제 시각으로 원본 초까지 판단한다.
  const clock = usePlannerClock();
  const keyboardInset = useKeyboardInset();
  const [draft, setDraft] = useState(() => createRecordDraft(day));
  const [selected, setSelected] = useState<string | null>(null);
  const [newRecordId, setNewRecordId] = useState<string | null>(null);
  const [autoFocusTimes, setAutoFocusTimes] = useState(false);
  const [pending, setPending] = useState(false),
    [failed, setFailed] = useState(false);
  const [saveFailure, setSaveFailure] = useState<RecordSaveFailure | null>(null);
  const [leave, setLeave] = useState<"close" | { date: string } | null>(null);
  const [datePicker, setDatePicker] = useState(false);
  const [uncertain, setUncertain] = useState<RecordDraftOperation[] | null>(null);
  const [error, setError] = useState<RecordDraftError["code"] | null>(null);
  const [subjectPicker, setSubjectPicker] = useState(false);
  const [dragMode, setDragMode] = useState<"create" | "start" | "end" | null>(null);
  const [deleteRects, setDeleteRects] = useState<RecordDeleteRect[] | null>(null);
  const [deleteHandles, setDeleteHandles] = useState<RecordDeleteHandleRect[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const editorBodyRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const newIdRef = useRef<string | null>(null);
  const applySubjectRef = useRef<((subjectId: number | null) => boolean) | null>(null);
  const dragRef = useRef<{
    id: string;
    pointerId: number;
    mode: "create" | "start" | "end";
    anchor: number;
    before: RecordDraftState;
    base: RecordDraftState;
    failure?: RecordDraftError["code"];
  } | null>(null);
  const block = draft.blocks.find((value) => value.id === selected);
  const todayKey = plannerDateKeyOf(new Date(clock.nowMs), draft.timeZone);
  const currentTime = plannerCurrentTime(day.date, clock.nowMs, draft.timeZone);
  const changedBlock = (value: RecordDraftBlock) => {
    const before = draft.baseline.get(value.id);
    return (
      !before ||
      value.startMs !== before.startMs ||
      value.endMs !== before.endMs ||
      value.subjectChanged
    );
  };
  const isEdited = (value: RecordDraftBlock) => value.edited || changedBlock(value);
  const dirty = draft.blocks.length !== draft.baseline.size || draft.blocks.some(changedBlock);
  const frozen = pending || uncertain !== null;
  useEffect(() => {
    const element = gridRef.current;
    const prevent = (event: TouchEvent) => {
      if (dragRef.current) event.preventDefault();
    };
    element?.addEventListener("touchmove", prevent, { passive: false });
    return () => {
      element?.removeEventListener("touchmove", prevent);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);
  function stopTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }
  function point(event: ReactPointerEvent<HTMLDivElement>, originalMs?: number) {
    return recordPointTime(
      { x: event.clientX, y: event.clientY },
      event.currentTarget.getBoundingClientRect(),
      day.date,
      draft.timeZone,
      originalMs,
    );
  }
  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      frozen ||
      !event.isPrimary ||
      (event.pointerType === "mouse" && event.button !== 0) ||
      pressRef.current ||
      dragRef.current
    )
      return;
    const handle = (event.target as Element).closest<HTMLElement>("[data-handle]");
    const record = (event.target as Element).closest("[data-record]");
    if (record && !handle) return;
    stopTimer();
    let anchor: number;
    try {
      anchor = point(
        event,
        handle && block
          ? handle.dataset.handle === "start"
            ? block.startMs
            : block.endMs
          : undefined,
      );
    } catch (cause) {
      if (cause instanceof RecordDraftError) {
        setError(cause.code);
        showTopToast(t(`record.errors.${cause.code}`));
      }
      return;
    }
    const before = draft,
      pointerId = event.pointerId,
      element = event.currentTarget;
    if (handle && block && !block.locked) {
      dragRef.current = {
        id: block.id,
        pointerId,
        mode: handle.dataset.handle as "start" | "end",
        anchor,
        before,
        base: before,
      };
      setDragMode(handle.dataset.handle as "start" | "end");
      try {
        element.setPointerCapture(pointerId);
      } catch {
        /* DOM이 교체된 뒤에는 캡처가 거부될 수 있다. */
      }
      event.preventDefault();
      return;
    }
    pressRef.current = { pointerId, x: event.clientX, y: event.clientY };
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const id = crypto.randomUUID();
      try {
        const next = addRecordDraft(
          before,
          { id, startMs: anchor, endMs: anchor + 60000, subjectId: null },
          Date.now(),
        );
        setDraft(next);
        setAutoFocusTimes(false);
        setSelected(id);
        setNewRecordId(id);
        setError(null);
        newIdRef.current = id;
        dragRef.current = { id, pointerId, mode: "create", anchor, before, base: next };
        setDragMode("create");
        try {
          element.setPointerCapture(pointerId);
        } catch {
          /* 포인터가 사라졌으면 화면 안에서만 끈다. */
        }
      } catch (cause) {
        if (cause instanceof RecordDraftError) setError(cause.code);
      }
    }, LONG_PRESS_MS);
  }
  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const owner = dragRef.current?.pointerId ?? pressRef.current?.pointerId;
    if (owner === undefined || owner !== event.pointerId) return;
    const drag = dragRef.current;
    if (!drag) {
      const press = pressRef.current;
      if (
        press &&
        (Math.abs(event.clientX - press.x) >= SWIPE_SLOP_PX ||
          Math.abs(event.clientY - press.y) >= SWIPE_SLOP_PX)
      )
        stopTimer();
      return;
    }
    event.preventDefault();
    try {
      const original = drag.base.blocks.find((value) => value.id === drag.id);
      const at = point(
        event,
        drag.mode === "create"
          ? undefined
          : drag.mode === "start"
            ? original?.startMs
            : original?.endMs,
      );
      const patch =
        drag.mode === "create"
          ? { startMs: Math.min(at, drag.anchor), endMs: Math.max(at, drag.anchor + 60000) }
          : { [drag.mode === "start" ? "startMs" : "endMs"]: at };
      // eslint-disable-next-line react-hooks/purity -- onPointerMove에서만 호출하며 렌더가 아니라 포인터 조작 순간을 검증한다.
      setDraft(changeRecordDraft(drag.base, drag.id, patch, Date.now()));
      drag.failure = undefined;
      setError(null);
    } catch (cause) {
      if (cause instanceof RecordDraftError) {
        drag.failure = cause.code;
        setError(cause.code);
      }
    }
  }
  function pointerEnd(event: ReactPointerEvent<HTMLDivElement>, cancel: boolean) {
    const owner = dragRef.current?.pointerId ?? pressRef.current?.pointerId;
    if (owner === undefined || owner !== event.pointerId) return;
    stopTimer();
    pressRef.current = null;
    const drag = dragRef.current;
    dragRef.current = null;
    setDragMode(null);
    if (!drag) return;
    if (cancel) {
      setDraft(drag.before);
      newIdRef.current = null;
      setNewRecordId(null);
      setSelected(null);
      setError(null);
    } else {
      // 유효하지 않은 포인터 위치는 초안에 넣지 않았다. 놓으면 마지막 유효 초안을 유지한다.
      // 본문 아래 오류는 스크롤 밖에 있을 수 있으므로 거절 이유를 손을 놓은 뒤에도 알린다.
      if (drag.failure) showTopToast(t(`record.errors.${drag.failure}`));
      setError(null);
      if (drag.mode === "create") {
        applySubjectRef.current = null;
        setSubjectPicker(true);
      }
    }
  }
  function addFromKeyboard() {
    if (frozen) return;
    const span = firstRecordDraftMinute(draft, clock.nowMs);
    if (!span) {
      showToast(t("record.noSpace"));
      return;
    }
    const id = crypto.randomUUID();
    setDraft(addRecordDraft(draft, { id, ...span, subjectId: null }, Date.now()));
    setAutoFocusTimes(true);
    setSelected(id);
    setError(null);
  }
  function askDelete() {
    if (!selected || frozen || block?.locked) return;
    const rects = [...(gridRef.current?.querySelectorAll<HTMLElement>("[data-record]") ?? [])]
      .filter((element) => element.dataset.record === selected)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const row = element.parentElement!.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          background: style.backgroundColor,
          color: style.color,
          borderLeft: style.borderLeft,
          label: element.querySelector("[data-record-label]")?.textContent ?? null,
          manual: element.querySelector("[data-record-manual]") !== null,
          edited: element.hasAttribute("data-record-edited"),
          rowLeft: row.left,
          rowWidth: row.width,
        };
      });
    setDeleteHandles(
      [...(gridRef.current?.querySelectorAll<HTMLElement>("[data-handle] > span") ?? [])].map(
        (element) => {
          const { left, top, width, height } = element.getBoundingClientRect();
          return { left, top, width, height };
        },
      ),
    );
    setDeleteRects(rects);
  }
  function close() {
    if (pending) return;
    if (dirty || uncertain || error) setLeave("close");
    else onClose();
  }
  function pickDate(date: string) {
    if (pending || !onDateChange || date === day.date || date > todayKey) return;
    if (dirty || uncertain || error) setLeave({ date });
    else onDateChange(date);
  }
  function confirmLeave() {
    if (pending || leave === null) return;
    setLeave(null);
    if (leave === "close") onClose();
    else onDateChange?.(leave.date);
  }
  async function save() {
    if (pending || error) return;
    setPending(true);
    setFailed(false);
    setSaveFailure(null);
    setError(null);
    try {
      const result = await saveRecordDraft(uncertain ?? recordDraftOperations(draft), {
        timeZone: draft.timeZone,
        ownerId: userId,
      });
      setDraft(acceptSavedRecords(draft, result));
      setUncertain(result.uncertain ? result.pending : null);
      setFailed(result.pending.length > 0);
      setSaveFailure(recordSaveFailure(result));
      await onSaved();
      if (!result.pending.length) onClose();
    } catch (cause) {
      if (cause instanceof RecordDraftError) setError(cause.code);
      else {
        setFailed(true);
        setSaveFailure("unknown");
      }
    } finally {
      setPending(false);
    }
  }
  function edit(patch: Partial<Pick<RecordDraftBlock, "startMs" | "endMs" | "subjectId">>) {
    if (frozen || !selected) return false;
    try {
      setDraft(changeRecordDraft(draft, selected, patch, Date.now()));
      setError(null);
      return true;
    } catch (cause) {
      if (cause instanceof RecordDraftError) {
        setError(cause.code);
        showTopToast(t(`record.errors.${cause.code}`));
      }
      return false;
    }
  }
  const refs = new Map([...day.subjects, ...(subjects ?? [])].map((value) => [value.id, value]));
  const label = (value: RecordDraftBlock) =>
    value.subjectIds.length
      ? value.subjectIds.map((id) => refs.get(id)?.name ?? t("subjects.unassigned")).join(" · ")
      : t("subjects.unassigned");
  const shapes = draft.blocks.flatMap((value) => {
    const original = draft.baseline.get(value.id);
    const unchanged =
      value.original &&
      !value.subjectChanged &&
      original?.startMs === value.startMs &&
      original.endMs === value.endMs;
    const paints = unchanged
      ? plannerRecordPaints(value.original!, draft)
      : [
          {
            startMs: value.startMs,
            endMs: value.endMs,
            manual: value.source === "MANUAL",
            ...(value.subjectId === null
              ? { kind: "focus" as const }
              : { kind: "subject" as const, subjectId: value.subjectId }),
          },
        ];
    return paints.flatMap((paint) =>
      recordWindowRects(paint, draft, draft.timeZone).map((rect) => ({
        block: value,
        paint,
        ...rect,
      })),
    );
  });
  const labelShapes = new Map<string, (typeof shapes)[number]>();
  for (const shape of shapes) {
    const previous = labelShapes.get(shape.block.id);
    if (!previous || shape.width > previous.width) labelShapes.set(shape.block.id, shape);
  }
  const bubbleRects = block && dragMode ? recordWindowRects(block, draft, draft.timeZone) : [];
  const bubbleRect = dragMode === "start" ? bubbleRects[0] : bubbleRects.at(-1);
  return (
    <main
      style={{ paddingBottom: keyboardInset }}
      className="theme-soft-blue flex h-dvh min-h-0 flex-col bg-muted [--glass-fade-top:var(--muted)] page-column text-foreground"
    >
      <GlassChrome
        top={{
          leading: "close",
          leadingLabel: t("common:actions.cancel"),
          leadingContent: t("common:actions.cancel"),
          appearance: "plain",
          center: (
            <h1 className="w-full truncate text-center text-[17px] leading-12 font-semibold">
              {t("plan.editRecords")}
            </h1>
          ),
          onLeading: close,
          trailing: (
            <Button
              variant="unstyled"
              disabled={pending || error !== null}
              onClick={() => void save()}
              className="h-11 px-3 text-[15px] leading-5.5 font-bold text-primary"
            >
              {t(uncertain || failed ? "common:actions.retry" : "record.save")}
            </Button>
          ),
        }}
      />
      <div
        ref={editorBodyRef}
        data-record-editor-body=""
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-0.5 pb-5"
      >
        <h1>
          <Button
            variant="unstyled"
            aria-label={t("plan.calendar")}
            aria-haspopup="dialog"
            aria-expanded={datePicker}
            disabled={pending || onDateChange === undefined}
            onClick={() => setDatePicker(true)}
            className="relative h-auto items-baseline gap-1.75 rounded-none p-0 before:absolute before:inset-x-0 before:-inset-y-1.75"
          >
            <span className="text-[22px] leading-7.5 font-bold tracking-[-0.4px] tabular-nums">
              {formatMonthDay(day.date)}
            </span>
            <span className="text-[22px] leading-7.5 font-semibold text-muted-foreground">
              {weekdayShortLabel(weekdayIndexOfDateKey(day.date))}
            </span>
            {onDateChange !== undefined && (
              <ChevronDown aria-hidden size={16} className="self-center text-muted-foreground" />
            )}
          </Button>
        </h1>
        <p className="mt-1.5 flex items-center gap-1.25 text-xs leading-4 text-muted-foreground">
          <Hand aria-hidden size={12} className="shrink-0" />
          {t("record.hint")}
        </p>
        <Button
          variant="subtle"
          disabled={frozen}
          onClick={addFromKeyboard}
          className="sr-only focus:not-sr-only focus:mt-3 focus:min-h-11"
        >
          {t("record.add")}
        </Button>
        <div className="mt-3.5 flex">
          <div aria-hidden className="flex w-11.5 shrink-0 flex-col pr-1.5">
            {plannerHours().map((hour) => (
              <span
                key={hour}
                className={cn(
                  "flex h-8 items-center justify-end text-[11px] leading-none tabular-nums",
                  currentTime?.hour === hour
                    ? "font-extrabold text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {currentTime?.hour === hour
                  ? currentTime.label
                  : `${String(hour).padStart(2, "0")}:00`}
              </span>
            ))}
          </div>
          <div
            ref={gridRef}
            aria-label={t("record.grid")}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={(event) => pointerEnd(event, false)}
            onPointerCancel={(event) => pointerEnd(event, true)}
            onContextMenu={(event) => event.preventDefault()}
            className="relative min-w-0 flex-1 touch-pan-y border-t border-l border-border select-none"
          >
            {plannerHours().map((hour, row) => (
              <div key={hour} className="relative grid h-8 grid-cols-6">
                {Array.from({ length: 6 }, (_, column) => (
                  <span
                    key={column}
                    className="pointer-events-none z-20 border-r border-b border-border"
                  />
                ))}
                {shapes
                  .filter((shape) => shape.row === row)
                  .map((shape, index) => {
                    const ghost = shape.block.id === newRecordId;
                    const shapeLabel = ghost ? t("record.new") : label(shape.block);
                    const color =
                      shape.paint.kind === "subject"
                        ? subjectColorVar(refs.get(shape.paint.subjectId)?.colorIndex ?? 0)
                        : "var(--primary)";
                    return (
                      <button
                        key={`${shape.block.id}:${index}`}
                        type="button"
                        data-record={shape.block.id}
                        data-record-edited={isEdited(shape.block) ? "" : undefined}
                        disabled={frozen}
                        aria-label={`${shapeLabel} ${recordClock(shape.block.startMs, draft.timeZone)} – ${recordClock(shape.block.endMs, draft.timeZone)}${isEdited(shape.block) ? `, ${t("record.edited")}` : ""}`}
                        onClick={() => {
                          setAutoFocusTimes(false);
                          setSelected(shape.block.id);
                          setError(null);
                        }}
                        className={cn(
                          "absolute inset-y-0 flex min-w-0 items-center justify-center gap-1 overflow-hidden text-xs font-bold whitespace-nowrap",
                          shape.width >= 25 / 60 ? "px-1" : "p-0",
                          ghost && "text-brand-subtle-text",
                          selected === shape.block.id && !ghost && "ring-2 ring-primary",
                        )}
                        style={{
                          left: `${shape.left * 100}%`,
                          width: `${shape.width * 100}%`,
                          background: ghost
                            ? "var(--brand-subtle)"
                            : `color-mix(in srgb, ${color} ${selected === shape.block.id ? "34%" : "28%"}, var(--muted))`,
                          border: ghost ? "1.5px dashed var(--primary)" : undefined,
                          borderLeft:
                            !ghost && shape.startsBlock ? `3px solid ${color}` : undefined,
                        }}
                      >
                        {labelShapes.get(shape.block.id) === shape && shape.width >= 25 / 60 && (
                          <>
                            {!ghost &&
                              (shape.block.source === "MANUAL" || isEdited(shape.block)) && (
                                <Pencil
                                  data-record-manual={
                                    shape.block.source === "MANUAL" ? "" : undefined
                                  }
                                  role="img"
                                  aria-label={
                                    isEdited(shape.block)
                                      ? t("record.edited")
                                      : t("records:manualItem.badge")
                                  }
                                  size={11}
                                  className="relative z-30 shrink-0"
                                />
                              )}
                            <span data-record-label="" className="relative z-30 truncate">
                              {shapeLabel}
                            </span>
                          </>
                        )}
                      </button>
                    );
                  })}
                {currentTime?.hour === hour && (
                  <span
                    role="img"
                    aria-label={t("timetable.aria.currentTime", { time: currentTime.label })}
                    className="pointer-events-none absolute -top-px z-20 h-0 w-0 -translate-x-1/2 border-x-5 border-t-7 border-x-transparent border-t-foreground"
                    style={{ left: `${currentTime.fraction * 100}%` }}
                  />
                )}
              </div>
            ))}
            {block &&
              !block.locked &&
              !frozen &&
              (["start", "end"] as const).map((edge) => {
                if (
                  (edge === "start" && block.startMs < draft.startMs) ||
                  (edge === "end" && block.endMs > draft.endMs)
                )
                  return null;
                const rects = recordWindowRects(block, draft, draft.timeZone);
                const rect = edge === "start" ? rects[0] : rects.at(-1);
                if (!rect) return null;
                return (
                  <button
                    key={edge}
                    type="button"
                    data-handle={edge}
                    aria-label={t(edge === "start" ? "record.adjustStart" : "record.adjustEnd")}
                    className="absolute z-30 flex size-11 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center"
                    style={{
                      left: `${(edge === "start" ? rect.left : rect.left + rect.width) * 100}%`,
                      top: `${((rect.row + (edge === "start" ? 0.25 : 0.75)) / 24) * 100}%`,
                    }}
                  >
                    <span
                      aria-hidden
                      className="h-6 w-2.25 rounded-full border-[2.5px] border-primary bg-background shadow-[0_2px_6px_rgba(31,42,61,0.2)]"
                    />
                  </button>
                );
              })}
            {block && dragMode && bubbleRect && (
              <div
                role="status"
                className="pointer-events-none absolute z-40 -mt-5 flex min-h-7.5 -translate-x-1/2 -translate-y-full items-center gap-1.5 rounded-full bg-foreground px-3 text-[13px] font-bold whitespace-nowrap text-background shadow-md tabular-nums"
                style={{
                  left: `${Math.max(0.15, Math.min(0.85, bubbleRect.left + (dragMode === "start" ? 0 : bubbleRect.width))) * 100}%`,
                  top: `${((bubbleRect.row + 0.5) / 24) * 100}%`,
                }}
              >
                {dragMode === "create" ? (
                  <>
                    {recordClock(block.startMs, draft.timeZone)} –{" "}
                    {recordClock(block.endMs, draft.timeZone)}
                    <span className="font-medium opacity-80">
                      {formatDuration(recordDraftDurationSec(block))}
                    </span>
                  </>
                ) : (
                  <>
                    {t(dragMode === "start" ? "record.start" : "record.end")}{" "}
                    {recordClock(
                      dragMode === "start" ? block.startMs : block.endMs,
                      draft.timeZone,
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        {draft.blocks.length > 0 && (
          <ul
            aria-label={t("record.list")}
            className="sr-only flex flex-col gap-2 focus-within:not-sr-only focus-within:mt-4"
          >
            {draft.blocks
              .toSorted((a, b) => a.startMs - b.startMs)
              .map((value) => (
                <li key={value.id}>
                  <Button
                    variant="unstyled"
                    disabled={frozen}
                    aria-pressed={selected === value.id}
                    data-record-select=""
                    onClick={(event) => {
                      setAutoFocusTimes(event.detail === 0);
                      setSelected(value.id);
                      setError(null);
                    }}
                    className="min-h-11 w-full justify-between gap-3 rounded-md border border-border px-3 py-2 text-left text-[13px] whitespace-normal"
                  >
                    <span className="min-w-0 flex-1 wrap-break-word">{label(value)}</span>
                    <span className="shrink-0 tabular-nums">
                      {recordClock(value.startMs, draft.timeZone)} –{" "}
                      {recordClock(value.endMs, draft.timeZone)}
                    </span>
                  </Button>
                </li>
              ))}
          </ul>
        )}
        {failed && (
          <p role="alert" className="mt-3 text-sm text-state-distract-text">
            {saveFailure && saveFailure !== "unknown"
              ? t(`record.saveFailures.${saveFailure}`)
              : t("record.saveFailed")}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-state-distract-text">
            {t(`record.errors.${error}`)}
          </p>
        )}
      </div>
      {block && !newRecordId && (
        <RecordBlockSheet
          key={block.id}
          block={block}
          edited={isEdited(block)}
          dateKey={day.date}
          timeZone={draft.timeZone}
          label={label(block)}
          colorIndex={block.subjectId === null ? undefined : refs.get(block.subjectId)?.colorIndex}
          autoFocusTimes={autoFocusTimes}
          hiddenBehindSheet={subjectPicker}
          disabled={frozen}
          onChange={edit}
          onError={setError}
          onSubject={(applySubject) => {
            applySubjectRef.current = applySubject;
            newIdRef.current = null;
            setNewRecordId(null);
            setSubjectPicker(true);
          }}
          onDelete={askDelete}
          getHeightLimit={() => {
            const body = editorBodyRef.current;
            const parent = body?.parentElement;
            if (!body || !parent) return Infinity;
            const parentRect = parent.getBoundingClientRect();
            if (parentRect.height <= 0) return Infinity;
            const bodyRect = body.getBoundingClientRect();
            const style = getComputedStyle(body);
            const bodySpace = [
              style.paddingTop,
              style.paddingBottom,
              style.borderTopWidth,
              style.borderBottomWidth,
            ].reduce((sum, value) => sum + (Number.parseFloat(value) || 0), 0);
            const viewport = window.visualViewport;
            const visibleTop = viewport?.offsetTop ?? 0;
            const bottom = Math.min(
              parentRect.bottom - (Number.parseFloat(getComputedStyle(parent).paddingBottom) || 0),
              window.innerHeight,
              viewport ? visibleTop + viewport.height : Infinity,
            );
            // 노치 포함 실제 상단 크롬과 본문이 줄어도 남는 여백을 함께 뺀다.
            return Math.max(0, bottom - Math.max(bodyRect.top, visibleTop) - bodySpace);
          }}
          onDone={() => setSelected(null)}
          onDismiss={() => {
            setSelected(null);
            setError(null);
          }}
          isDismissBlocked={() =>
            subjectPicker ||
            deleteRects !== null ||
            datePicker ||
            leave !== null ||
            frozen ||
            dragRef.current !== null
          }
        />
      )}
      <RecordSubjectSheet
        open={subjectPicker}
        subjects={subjects}
        subjectScopeUnknown={block?.subjectScopeUnknown}
        errorMessage={error ? t(`record.errors.${error}`) : undefined}
        summary={
          block
            ? `${recordClock(block.startMs, draft.timeZone)} – ${recordClock(block.endMs, draft.timeZone)} · ${formatDuration(recordDraftDurationSec(block))}`
            : undefined
        }
        onOpenChange={(open) => {
          if (!open) applySubjectRef.current = null;
          if (!open && newIdRef.current) {
            setDraft(deleteRecordDraft(draft, newIdRef.current));
            setSelected(null);
            newIdRef.current = null;
            setNewRecordId(null);
          }
          setSubjectPicker(open);
        }}
        onPick={(id) => {
          const applied = applySubjectRef.current
            ? applySubjectRef.current(id)
            : edit({ subjectId: id });
          if (applied) {
            applySubjectRef.current = null;
            newIdRef.current = null;
            setNewRecordId(null);
            setSubjectPicker(false);
          }
        }}
      />
      {onDateChange !== undefined && (
        <PlannerDateSheet
          key={day.date}
          open={datePicker}
          onOpenChange={setDatePicker}
          userId={userId}
          dateKey={day.date}
          todayKey={todayKey}
          maxDate={todayKey}
          onPick={pickDate}
        />
      )}
      <ConfirmDialog
        offsetY={-13.5}
        open={leave !== null}
        pending={pending}
        title={t("record.leaveTitle")}
        cancelLabel={t("common:actions.cancel")}
        confirmLabel={t("record.leave")}
        onCancel={() => setLeave(null)}
        onConfirm={confirmLeave}
      />
      <RecordDeletePopover
        open={deleteRects !== null}
        rects={deleteRects ?? []}
        handles={deleteHandles}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteRects(null);
            setDeleteHandles([]);
          }
        }}
        onConfirm={() => {
          if (selected) {
            setDraft(deleteRecordDraft(draft, selected));
            setSelected(null);
            setError(null);
          }
          setDeleteRects(null);
          setDeleteHandles([]);
        }}
      />
    </main>
  );
}
