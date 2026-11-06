import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, GripVertical, Plus, Repeat2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { PlannerDaySubject, PlannerTask, SubjectResponse } from "@focusmakers/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  addDaysToDateKey,
  dayOfDateKey,
  dayTitleWithWeekday,
  formatDuration,
  formatMonthDay,
} from "@/features/records/recordsFormat";
import { subjectColorVar } from "@/features/records/recordsTimetable";
import { useHorizontalSwipe } from "@/features/records/useHorizontalSwipe";
import { createSubject, listSubjects } from "@/lib/subjectApi";
import { lazyWithPreload } from "@/lib/lazyWithPreload";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { initialWeekExpanded } from "./plannerWeekModel";
import { useHoldAndDrag } from "./usePlannerSubjectDrag";
import { usePlannerPlanMutation } from "./usePlannerPlanMutation";
import { usePlannerWeek } from "./usePlannerWeek";

const { LazySheet: TaskSheet } = lazyWithPreload(() =>
  import("./PlannerTaskSheets").then((module) => module.PlannerTaskSheets),
);
const { LazySheet: SubjectSheet } = lazyWithPreload(() =>
  import("./PlannerSubjectSheets").then((module) => module.PlannerSubjectSheets),
);

interface WeekSheet {
  kind: "task" | "subjects";
  date: string;
  task: PlannerTask | null;
  subjectId: number | null;
}

export function PlannerWeek({
  userId,
  dateKey,
  onDateChange,
  onStudyStart,
}: {
  userId: number | null;
  dateKey: string;
  onDateChange: (date: string, method: "button" | "swipe") => void;
  onStudyStart: (task: PlannerTask) => void;
}) {
  const { t } = useTranslation(["planner", "common"]);
  const week = usePlannerWeek(userId, dateKey);
  const client = useQueryClient();
  const mutation = usePlannerPlanMutation(userId);
  const allSubjects = useQuery({
    queryKey: ["subjects", userId],
    queryFn: listSubjects,
    enabled: userId !== null,
  });
  const weekStart = week.dates[0]!;
  const [expandedByWeek, setExpandedByWeek] = useState<Record<string, string[]>>({});
  const expanded = expandedByWeek[weekStart] ?? initialWeekExpanded(dateKey, week.todayKey);
  const [sheet, setSheet] = useState<WeekSheet | null>(null);
  const [dropDate, setDropDate] = useState<string | null>(null);
  const held = useRef<{ task: PlannerTask; date: string | null } | null>(null);
  const busy = week.isSaving || mutation.isPending;
  const swipe = useHorizontalSwipe((delta) => {
    if (!held.current && !busy) onDateChange(addDaysToDateKey(dateKey, delta * 7), "swipe");
  });
  const from = week.dates[0]!;
  const to = week.dates[6]!;
  const range =
    from.slice(0, 7) === to.slice(0, 7)
      ? t("week.rangeSameMonth", { start: formatMonthDay(from), day: dayOfDateKey(to) })
      : t("week.rangeCrossMonth", { start: formatMonthDay(from), end: formatMonthDay(to) });
  function clearDrag() {
    held.current = null;
    setDropDate(null);
    swipe.onPointerCancel();
  }
  function dragOver(x: number, y: number) {
    const value = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-week-date]")
      ?.dataset.weekDate;
    const date = value && week.dates.includes(value) ? value : null;
    if (held.current) held.current.date = date;
    setDropDate(
      date && date >= week.todayKey && date !== held.current?.task.date && !busy ? date : null,
    );
  }
  function drop() {
    const current = held.current;
    clearDrag();
    if (!current?.date || current.date === current.task.date || busy) return;
    if (current.date < week.todayKey) {
      showToast(t("week.pastDrop"));
      return;
    }
    const date = current.date;
    setExpandedByWeek((previous) => ({
      ...previous,
      [weekStart]: [...new Set([...expanded, date])],
    }));
    void week.moveTask(current.task.key, date).catch(() => showToast(t("week.moveFailed")));
  }
  const selectedDay = week.days.find((day) => day.date === sheet?.date);
  // 전체 내 과목에서는 색·이름만 가져온다. 누적 시간과 구 계약 할 일은 날짜별 계획에 섞지 않는다.
  const subjectChoices: PlannerDaySubject[] = (allSubjects.data ?? []).map(
    (subject) =>
      selectedDay?.subjects.find((item) => item.id === subject.id) ?? {
        id: subject.id,
        name: subject.name,
        colorIndex: subject.colorIndex,
        deleted: false,
        selected: false,
        studySec: 0,
        focusSec: 0,
        tasks: [],
      },
  );
  for (const subject of selectedDay?.subjects ?? []) {
    if (!subjectChoices.some((item) => item.id === subject.id)) subjectChoices.push(subject);
  }
  return (
    <section aria-label={t("plan.weekly")}>
      <div className="flex items-end justify-between gap-x-2 pt-1.5 pb-3.5">
        <h1 className="text-[22px] leading-8 font-bold tracking-[-0.4px] tabular-nums">{range}</h1>
        {!week.isPending && !week.isError && (
          <span
            aria-label={t("week.focusTime")}
            className="flex flex-col items-end gap-px text-lg leading-5.5 font-extrabold tabular-nums"
          >
            <span className="text-xs leading-4 font-normal text-muted-foreground">
              {t("week.focusLabel")}
            </span>
            {formatDuration(Math.ceil(week.focusSec / 60) * 60)}
          </span>
        )}
      </div>
      <div className="sr-only focus-within:not-sr-only focus-within:flex focus-within:gap-2">
        <Button
          variant="subtle"
          disabled={busy}
          onClick={() => onDateChange(addDaysToDateKey(dateKey, -7), "button")}
        >
          {t("week.prev")}
        </Button>
        <Button
          variant="subtle"
          disabled={busy}
          onClick={() => onDateChange(addDaysToDateKey(dateKey, 7), "button")}
        >
          {t("week.next")}
        </Button>
      </div>
      {userId === null ? (
        <p>{t("page.unregistered")}</p>
      ) : week.isError ? (
        <ErrorState
          screen="planner"
          message={t("page.loadFailed")}
          onRetry={() => void week.refetch()}
        />
      ) : week.isPending ? (
        <Skeleton className="h-96 w-full rounded-lg" />
      ) : (
        <div
          data-testid="planner-week-swipe"
          {...swipe}
          className="touch-pan-y border-t border-border"
        >
          <Accordion
            type="multiple"
            value={expanded}
            onValueChange={(value) =>
              setExpandedByWeek((previous) => ({ ...previous, [weekStart]: value }))
            }
          >
            {week.days.map((day) => {
              const title = dayTitleWithWeekday(day.date, true);
              return (
                <AccordionItem
                  key={day.date}
                  value={day.date}
                  data-week-date={day.date}
                  className={cn(
                    "transition-colors duration-150 motion-reduce:transition-none",
                    dropDate === day.date && "rounded-md bg-brand-subtle ring-1 ring-primary/40",
                  )}
                >
                  <AccordionTrigger
                    aria-label={title}
                    aria-current={day.mode === "today" ? "date" : undefined}
                    className="h-11.5 gap-2 px-0.5 py-0 transition-colors duration-150 motion-reduce:transition-none [&>svg]:size-4.5 motion-reduce:[&>svg]:transition-none"
                  >
                    <span
                      className={cn(
                        "w-24 shrink-0 text-sm leading-5 font-bold whitespace-nowrap",
                        day.mode === "today" && "font-extrabold text-primary",
                      )}
                    >
                      {title}
                    </span>
                    <span className="min-w-0 flex-1 text-[13px] leading-4.5 font-normal text-muted-foreground tabular-nums">
                      {day.mode === "future"
                        ? day.taskCount
                          ? t("week.tasks", { count: day.taskCount })
                          : t("week.empty")
                        : t("week.completed", { done: day.completedCount, count: day.taskCount })}
                    </span>
                    {day.mode !== "future" && (
                      <span className="shrink-0 text-[13px] leading-4.5 font-semibold tabular-nums">
                        {formatDuration(Math.ceil(day.focusSec / 60) * 60)}
                      </span>
                    )}
                  </AccordionTrigger>
                  <AccordionContent
                    aria-label={title}
                    animated={false}
                    overflowVisible
                    className="pb-2.5"
                  >
                    <ul className="flex flex-col gap-1">
                      {day.subjects.flatMap((subject) =>
                        subject.tasks.map((task) => (
                          <WeekTask
                            key={`${userId}:${task.key}`}
                            task={task}
                            colorIndex={subject.colorIndex}
                            future={day.mode === "future"}
                            pending={busy}
                            onOpen={() =>
                              setSheet({
                                kind: "task",
                                date: day.date,
                                task,
                                subjectId: task.subjectId,
                              })
                            }
                            onToggle={() => {
                              if (day.mode === "future") {
                                showToast(t("plan.futureCheck"));
                                return;
                              }
                              void week
                                .toggleTask(task.key, !task.done)
                                .catch(() => showToast(t("common:errors.retryLater")));
                            }}
                            onHold={() => {
                              if (!busy) held.current = { task, date: null };
                            }}
                            onDragMove={dragOver}
                            onDrop={drop}
                            onCancel={clearDrag}
                          />
                        )),
                      )}
                    </ul>
                    {day.mode !== "past" && (
                      <Button
                        variant="unstyled"
                        disabled={busy || allSubjects.isPending}
                        className="relative mt-1 h-7 min-h-0 justify-start gap-1.25 self-start rounded-none pr-1.5 pl-2.5 text-xs leading-4 font-semibold text-muted-foreground before:absolute before:inset-x-0 before:-inset-y-2"
                        onClick={() => {
                          if (allSubjects.isError) {
                            void allSubjects.refetch();
                            showToast(t("common:errors.retryLater"));
                            return;
                          }
                          setSheet({
                            kind: (allSubjects.data?.length ?? 0) === 0 ? "subjects" : "task",
                            date: day.date,
                            task: null,
                            subjectId: null,
                          });
                        }}
                      >
                        <Plus aria-hidden size={12} strokeWidth={2.4} />
                        {t("plan.addTask")}
                      </Button>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      )}
      {dropDate && (
        <p role="status" className="sr-only">
          {t("week.dropHint")}
        </p>
      )}
      {sheet?.kind === "task" && selectedDay && (
        <TaskSheet
          key={`${sheet.date}:${sheet.task?.key ?? "new"}`}
          open
          onOpenChange={(open) => {
            if (!open) setSheet(null);
          }}
          userId={userId}
          dateKey={sheet.date}
          todayKey={week.todayKey}
          task={sheet.task}
          subjectId={sheet.subjectId}
          subjects={subjectChoices}
          onStudyStart={onStudyStart}
        />
      )}
      {sheet?.kind === "subjects" && (
        <SubjectSheet
          key={sheet.date}
          open
          onOpenChange={(open) => {
            if (!open) setSheet((current) => (current?.kind === "subjects" ? null : current));
          }}
          dateKey={sheet.date}
          subjects={allSubjects.data}
          includedSubjectIds={selectedDay?.subjects.map((subject) => subject.id) ?? []}
          loadError={allSubjects.isError ? { retry: () => void allSubjects.refetch() } : undefined}
          onCreateSubject={async (name) => {
            const created = await createSubject({ name });
            client.setQueryData<SubjectResponse[]>(["subjects", userId], (old) => [
              ...(old ?? []),
              created,
            ]);
            return created;
          }}
          onAddSubjects={async (date, ids) => {
            for (const subjectId of ids)
              await mutation.mutateAsync({
                kind: "selectSubject",
                ownerId: userId,
                date,
                subjectId,
              });
            setSheet({ kind: "task", date, task: null, subjectId: ids[0] ?? null });
          }}
        />
      )}
    </section>
  );
}

function WeekTask({
  task,
  colorIndex,
  future,
  pending,
  onOpen,
  onToggle,
  onHold,
  onDragMove,
  onDrop,
  onCancel,
}: {
  task: PlannerTask;
  colorIndex: number;
  future: boolean;
  pending: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onHold: () => void;
  onDragMove: (x: number, y: number) => void;
  onDrop: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("planner");
  const suppressClick = useRef(false);
  const cancelled = useRef(false);
  const pointer = useRef<{
    id: number;
    x: number;
    y: number;
    rect: DOMRect;
  } | null>(null);
  const [preview, setPreview] = useState<{
    rect: DOMRect;
    dx: number;
    dy: number;
  } | null>(null);
  const lifted = preview !== null;
  const cancelRef = useRef(onCancel);
  useEffect(() => {
    cancelRef.current = onCancel;
  });
  const { elementRef, handlers, pressed } = useHoldAndDrag({
    onLongPress: () => {
      if (!pending && pointer.current) {
        suppressClick.current = true;
        setPreview({ rect: pointer.current.rect, dx: 0, dy: 0 });
        onHold();
      }
    },
    onDragStart: () => {},
    onDragMove: (x, y) => {
      const start = pointer.current;
      if (!start || cancelled.current || pending) return;
      setPreview({ rect: start.rect, dx: x - start.x, dy: y - start.y });
      onDragMove(x, y);
    },
    onDragEnd: () => {
      if (!cancelled.current) onDrop();
    },
  });
  // 캡처가 사라지거나 앱을 떠난 경우에도 공유 훅의 hold 상태를 끝내 touchmove 차단을 푼다.
  useEffect(() => {
    if (!lifted) return;
    const element = elementRef.current;
    function cancel() {
      if (!pointer.current) return;
      element?.dispatchEvent(
        new PointerEvent("pointercancel", { bubbles: true, pointerId: pointer.current.id }),
      );
    }
    function keyDown(event: KeyboardEvent) {
      if (event.key === "Escape") cancel();
    }
    function visibilityChange() {
      if (document.hidden) cancel();
    }
    window.addEventListener("blur", cancel);
    document.addEventListener("keydown", keyDown);
    document.addEventListener("visibilitychange", visibilityChange);
    return () => {
      window.removeEventListener("blur", cancel);
      document.removeEventListener("keydown", keyDown);
      document.removeEventListener("visibilitychange", visibilityChange);
      const current = pointer.current;
      pointer.current = null;
      if (current) {
        if (element?.hasPointerCapture?.(current.id)) element.releasePointerCapture(current.id);
        cancelRef.current();
      }
    };
  }, [elementRef, lifted]);
  function finishPreview() {
    const current = pointer.current;
    pointer.current = null;
    setPreview(null);
    if (current && elementRef.current?.hasPointerCapture?.(current.id)) {
      elementRef.current.releasePointerCapture(current.id);
    }
  }
  const color = subjectColorVar(colorIndex);
  const taskStyle = {
    borderColor: task.done ? "var(--border-strong)" : color,
    background: task.done ? "var(--bg-layer-2)" : `color-mix(in srgb, ${color} 16%, var(--muted))`,
  };
  return (
    <>
      <li
        className={cn(
          "flex min-h-7.5 min-w-0 items-start gap-2 rounded-l-[3px] rounded-r-[9px] border-l-3 transition-opacity duration-150 motion-reduce:transition-none",
          preview ? "opacity-35" : pressed && !pending && "opacity-80",
        )}
        style={taskStyle}
      >
        <div
          ref={elementRef}
          {...handlers}
          className="flex min-w-0 flex-1 items-start gap-2"
          onPointerDown={(event) => {
            if (
              !event.isPrimary ||
              (event.pointerType === "mouse" && event.button !== 0) ||
              pending
            )
              return;
            cancelled.current = false;
            suppressClick.current = false;
            pointer.current = {
              id: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              rect: event.currentTarget.closest("li")!.getBoundingClientRect(),
            };
            handlers.onPointerDown(event);
          }}
          onPointerUp={(event) => {
            const wasHeld = suppressClick.current;
            handlers.onPointerUp(event);
            finishPreview();
            if (wasHeld) {
              event.stopPropagation();
              onCancel();
            }
          }}
          onPointerCancel={(event) => {
            cancelled.current = true;
            suppressClick.current = true;
            handlers.onPointerCancel(event);
            finishPreview();
            onCancel();
          }}
          onLostPointerCapture={(event) => {
            if (event.target !== event.currentTarget || !pointer.current) return;
            cancelled.current = true;
            suppressClick.current = true;
            handlers.onPointerCancel(event);
            finishPreview();
            onCancel();
          }}
        >
          <button
            type="button"
            aria-label={task.name}
            disabled={pending}
            className={cn(
              "relative min-h-7.5 min-w-0 flex-1 py-1.5 pr-0 pl-2.25 text-left text-[12.5px] leading-4.5 font-semibold wrap-break-word whitespace-normal select-none before:absolute before:inset-x-0 before:-inset-y-1.75",
              task.done && "font-medium text-muted-foreground line-through",
            )}
            onClick={() => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              onOpen();
            }}
          >
            {task.seriesId !== null && (
              <Repeat2 aria-label={t("plan.repeating")} size={12} className="mr-1 inline" />
            )}
            {task.name}
          </button>
          <button
            type="button"
            role="checkbox"
            aria-label={task.name}
            aria-checked={task.done}
            disabled={pending}
            onClick={() => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              onToggle();
            }}
            className={cn(
              "relative mt-1.5 mr-2 flex size-4 shrink-0 items-center justify-center before:absolute before:-inset-3.5",
              future && "mt-2.25 size-3 before:-inset-4",
            )}
          >
            {future ? (
              <GripVertical aria-hidden size={12} className="text-muted-foreground" />
            ) : (
              <span
                className="flex size-4 items-center justify-center rounded-full border-[1.5px]"
                style={{
                  borderColor: task.done
                    ? "transparent"
                    : `color-mix(in srgb, ${color} 55%, var(--muted))`,
                  background: task.done ? color : "var(--muted)",
                }}
              >
                {task.done && (
                  <Check
                    aria-hidden
                    size={10}
                    strokeWidth={3.2}
                    className="text-primary-foreground"
                  />
                )}
              </span>
            )}
          </button>
        </div>
      </li>
      {preview &&
        createPortal(
          <div
            data-testid="planner-week-drag-preview"
            aria-hidden="true"
            className="theme-soft-blue pointer-events-none fixed z-50 text-foreground transition-none"
            style={{
              left: preview.rect.left,
              top: preview.rect.top,
              width: preview.rect.width,
              transform: `translate3d(${preview.dx}px, ${preview.dy}px, 0)`,
            }}
          >
            <div
              className="flex min-h-7.5 min-w-0 items-start gap-2 rounded-l-[3px] rounded-r-[9px] border-l-3 shadow-md motion-safe:-translate-y-1"
              style={taskStyle}
            >
              <span
                className={cn(
                  "min-h-7.5 min-w-0 flex-1 py-1.5 pr-0 pl-2.25 text-[12.5px] leading-4.5 font-semibold wrap-break-word whitespace-normal",
                  task.done && "font-medium text-muted-foreground line-through",
                )}
              >
                {task.seriesId !== null && <Repeat2 size={12} className="mr-1 inline" />}
                {task.name}
              </span>
              <span
                className={cn(
                  "mt-1.5 mr-2 flex size-4 shrink-0 items-center justify-center",
                  future && "mt-2.25 size-3",
                )}
              >
                {future ? (
                  <GripVertical size={12} className="text-muted-foreground" />
                ) : (
                  <span
                    className="flex size-4 items-center justify-center rounded-full border-[1.5px]"
                    style={{
                      borderColor: task.done
                        ? "transparent"
                        : `color-mix(in srgb, ${color} 55%, var(--muted))`,
                      background: task.done ? color : "var(--muted)",
                    }}
                  >
                    {task.done && (
                      <Check size={10} strokeWidth={3.2} className="text-primary-foreground" />
                    )}
                  </span>
                )}
              </span>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
