import type { PlannerDaySubject, PlannerTask } from "@focusmakers/types";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  SubjectRow,
  TaskRow,
  type SubjectPanelProps,
} from "@/features/study-session/components/SubjectPanel";
import { SessionPageFooter } from "@/features/study-session/components/SessionPage";
import { formatDuration } from "@/features/records/recordsFormat";
import { subjectColorVar } from "@/features/records/recordsTimetable";
import { liveSubjectTime } from "@/features/study-session/subjectSegments";
import {
  SWIPE_REMOVE_PX,
  subjectIdUnderPoint,
  usePressGestures,
  useSubjectReorder,
} from "@/features/study-session/subjectInteractions";
import { lazyWithPreload } from "@/lib/lazyWithPreload";
import { plannerKeys } from "@/lib/plannerQueries";
import { createSubject, renameSubject, deleteSubject } from "@/lib/subjectApi";
import { cn } from "@/lib/utils";
import { SessionSubjectDrag } from "./SessionSubjectDrag";
import { usePlannerClock } from "./usePlannerClock";
import { usePlannerPlan } from "./usePlannerPlan";
import { usePlannerPlanMutation } from "./usePlannerPlanMutation";
const { LazySheet: TaskSheet } = lazyWithPreload(() =>
  import("./PlannerTaskSheets").then((module) => module.PlannerTaskSheets),
);
const { LazySheet: SubjectSheet } = lazyWithPreload(() =>
  import("./PlannerSubjectSheets").then((module) => module.PlannerSubjectSheets),
);
const { LazySheet: NameSheet } = lazyWithPreload(() =>
  import("./PlannerNameSheet").then((module) => module.PlannerNameSheet),
);

export function PlannerSessionSubjectPanel({
  userId,
  store,
  selection,
  onSelect,
  onRequestClose,
  paused,
  onNotice,
  liveTotals,
  landscape,
}: SubjectPanelProps & { userId: number }) {
  const { t } = useTranslation(["planner", "study-session", "common"]);
  const clock = usePlannerClock();
  const state = usePlannerPlan(userId, clock.todayKey);
  const mutation = usePlannerPlanMutation(userId);
  const queryClient = useQueryClient();
  const [sheet, setSheet] = useState<"task" | "addTask" | "subjects" | "rename" | null>(null);
  const [task, setTask] = useState<PlannerTask | null>(null);
  const [subject, setSubject] = useState<PlannerDaySubject | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<PlannerDaySubject | null>(null);
  const [globalPending, setGlobalPending] = useState(false);
  const [order, setOrder] = useState<number[] | null>(null);
  const [viewedId, setViewedId] = useState<number | null>(null);
  const busy = useRef(false);
  const orderRef = useRef<number[] | null>(null);
  const initialOrder = useRef<number[]>([]);
  const cancelled = useRef(false);
  const validDrop = useRef(true);
  const listRef = useRef<HTMLDivElement>(null);
  const today = state.plan?.subjects ?? [];
  const included = new Set(today.map((value) => value.id));
  const others: PlannerDaySubject[] = store.subjects
    .filter((value) => !included.has(value.id))
    .map((value) => ({
      ...value,
      selected: false,
      deleted: false,
      tasks: [],
      studySec: 0,
      focusSec: 0,
    }));
  const all = [...today, ...others];
  const viewed =
    all.find((value) => value.id === viewedId) ??
    all.find((value) => value.id === selection) ??
    all[0];
  const pending = mutation.isPending || globalPending;
  async function run(action: Parameters<typeof mutation.mutateAsync>[0], then?: () => void) {
    if (busy.current) return;
    busy.current = true;
    try {
      await mutation.mutateAsync(action);
      then?.();
    } catch {
      onNotice(t("common:errors.retryLater"));
    } finally {
      busy.current = false;
    }
  }
  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: plannerKeys.user(userId) }),
      store.reload(),
    ]);
  }
  const reorder = useSubjectReorder({
    startReorder() {
      cancelled.current = false;
      validDrop.current = true;
      orderRef.current = today.map((value) => value.id);
      initialOrder.current = orderRef.current;
      setOrder(orderRef.current);
    },
    reorderSubject(id, over) {
      const current = orderRef.current;
      if (!current) return;
      const from = current.indexOf(id),
        to = current.indexOf(over);
      if (from < 0 || to < 0) return;
      const next = [...current];
      next.splice(from, 1);
      next.splice(to, 0, id);
      orderRef.current = next;
      setOrder(next);
    },
    async commitReorder() {
      const ids = orderRef.current;
      orderRef.current = null;
      try {
        if (!cancelled.current && ids?.some((id, index) => id !== initialOrder.current[index]))
          await run({ kind: "reorderSubjects", date: clock.todayKey, body: { subjectIds: ids } });
      } finally {
        setOrder(null);
      }
    },
  });
  function addTask() {
    const value = landscape ? viewed : all.find((item) => item.id === selection);
    if (value && value.tasks.length >= 30) {
      onNotice(t("study-session:subjectSheet.taskLimit"));
      return;
    }
    setSubject(value && !value.deleted ? value : null);
    setTask(null);
    setSheet("addTask");
  }
  function play(value: PlannerDaySubject) {
    if (busy.current || pending) return;
    const selected = () => {
      onSelect(value.id);
      onRequestClose();
    };
    if (included.has(value.id)) selected();
    else void run({ kind: "selectSubject", date: clock.todayKey, subjectId: value.id }, selected);
  }
  function tasks(value: PlannerDaySubject) {
    const Row = landscape ? TaskRow : SessionPlanTaskRow;
    return (
      <div className={cn("flex min-h-0 flex-col", landscape && "gap-1")}>
        {value.tasks.map((item) => (
          <Row
            key={item.key}
            task={{ name: item.name, doneAt: item.doneAt }}
            disabled={pending}
            onToggle={(done) => void run({ kind: "updateTask", key: item.key, body: { done } })}
            onLongPress={() => {
              setTask(item);
              setSubject(value);
              setSheet("task");
            }}
            onRemove={() => {
              setTask(item);
              setSubject(value);
              setSheet("task");
            }}
          />
        ))}
        {landscape && !value.deleted && (
          <Button
            variant="subtle"
            disabled={pending}
            className="mt-1 min-h-11 w-full text-white/70"
            onClick={() => {
              if (value.tasks.length >= 30) {
                onNotice(t("study-session:subjectSheet.taskLimit"));
                return;
              }
              setSubject(value);
              setTask(null);
              setSheet("addTask");
            }}
          >
            + {t("plan.addTask")}
          </Button>
        )}
      </div>
    );
  }
  function row(value: PlannerDaySubject, other = false) {
    return (
      <SessionSubjectDrag
        key={value.id}
        subjectId={value.id}
        order={
          other
            ? undefined
            : (order?.indexOf(value.id) ?? today.findIndex((item) => item.id === value.id))
        }
        disabled={pending || other}
        lifted={reorder.reorderingId === value.id}
        onMenu={() => setMenu(value.id)}
        onDragStart={() => {
          setMenu(null);
          reorder.start(value.id);
        }}
        onDragMove={(x, y) => {
          validDrop.current =
            document.elementFromPoint(x, y)?.closest("[data-session-subject-list]") ===
            listRef.current;
          const over = subjectIdUnderPoint(x, y, value.id);
          const current = orderRef.current;
          if (over === null || !current || !validDrop.current) {
            reorder.over(value.id, null);
            return;
          }
          const target = listRef.current?.querySelector<HTMLElement>(`[data-subject-id="${over}"]`);
          if (!target) return;
          const rect = target.getBoundingClientRect();
          const from = current.indexOf(value.id),
            to = current.indexOf(over);
          if (
            (from < to && y < rect.top + rect.height / 2) ||
            (from > to && y > rect.top + rect.height / 2)
          )
            return;
          reorder.over(value.id, null);
          reorder.over(value.id, over);
        }}
        onDragEnd={() => {
          if (!validDrop.current) cancelled.current = true;
          reorder.end();
        }}
        onDragCancel={() => {
          cancelled.current = true;
          reorder.end();
        }}
        className={cn(
          other && !landscape
            ? "relative border-t border-(--session-sheet-line) px-3.5 first:border-t-0"
            : "relative rounded-lg bg-(--session-sheet-surface) px-3.5 pt-1 pb-1.5",
          !other &&
            selection === value.id &&
            "shadow-[inset_0_0_0_1.5px_var(--session-sheet-selected-card-ring)]",
        )}
      >
        <div data-session-subject-head="">
          {landscape ? (
            <SubjectRow
              layout={landscape || other ? "row" : "card"}
              subject={value}
              focusSec={value.focusSec + liveSubjectTime(liveTotals, value.id).focusSec}
              selected={selection === value.id}
              running={selection === value.id && !paused}
              reorderMode={false}
              viewing={landscape && viewed?.id === value.id}
              onTap={landscape ? () => setViewedId(value.id) : undefined}
              onPlay={() => play(value)}
              onDeselect={() => onSelect(null)}
              onLongPress={() => {
                if (!pending) setMenu(value.id);
              }}
              onReorderStart={() => reorder.start(value.id)}
              onReorderOver={(id) => reorder.over(value.id, id)}
              onReorderEnd={reorder.end}
            />
          ) : (
            <SessionPlanSubjectHead
              subject={value}
              focusSec={value.focusSec + liveSubjectTime(liveTotals, value.id).focusSec}
              other={other}
              running={selection === value.id && !paused}
              disabled={pending}
              onPlay={() => play(value)}
              onDeselect={() => onSelect(null)}
              onLongPress={() => setMenu(value.id)}
            />
          )}
        </div>
        {menu === value.id && (
          <DropdownMenu
            modal={false}
            open
            onOpenChange={(open) => {
              if (!open) setMenu(null);
            }}
          >
            <DropdownMenuTrigger className="sr-only">{value.name}</DropdownMenuTrigger>
            <DropdownMenuContent
              className="theme-dark"
              onCloseAutoFocus={(event) => event.preventDefault()}
            >
              <DropdownMenuItem
                onSelect={() => {
                  setSubject(value);
                  setSheet("rename");
                }}
              >
                {t("rowMenu.rename")}
              </DropdownMenuItem>
              {included.has(value.id) && !value.tasks.length && (
                <DropdownMenuItem
                  onSelect={() =>
                    void run({ kind: "removeSubject", date: clock.todayKey, subjectId: value.id })
                  }
                >
                  {t("plan.removeSubject")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="text-feedback-danger"
                onSelect={() => setDeleting(value)}
              >
                {t("plan.deleteSubject")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {!landscape && !other && tasks(value)}
      </SessionSubjectDrag>
    );
  }
  return (
    <>
      <div className={cn("min-h-0 flex-1", landscape ? "grid grid-cols-2 gap-4" : "flex flex-col")}>
        <div
          data-scroll-list=""
          className="min-h-0 overflow-y-auto overscroll-contain px-4 pt-2 pb-4 scrollbar-none"
        >
          {state.isError ? (
            <Button variant="subtle" onClick={() => void state.refetch()}>
              {t("common:actions.retry")}
            </Button>
          ) : !state.plan ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <section className="flex flex-col gap-2.5">
              <h2 className="text-[13px] leading-4.5 font-semibold text-muted-foreground">
                {t("studyStart.todaySubjects")}
              </h2>
              <div ref={listRef} data-session-subject-list="" className="flex flex-col gap-2.5">
                {today.map((value) => row(value))}
              </div>
            </section>
          )}
          {others.length > 0 && (
            <section className="mt-6 flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-[13px] leading-4.5 font-semibold text-muted-foreground">
                  {t("studyStart.otherSubjects")}
                </h2>
                <span className="text-xs leading-4 text-muted-foreground">
                  {t("studyStart.otherHint")}
                </span>
              </div>
              <div className="overflow-hidden rounded-lg bg-(--session-sheet-surface)">
                {others.map((value) => row(value, true))}
              </div>
            </section>
          )}
          {store.status === "error" && (
            <Button variant="subtle" onClick={() => void store.reload()}>
              {t("common:actions.retry")}
            </Button>
          )}
        </div>
        {landscape && viewed && (
          <section data-scroll-list="" className="min-h-0 overflow-y-auto overscroll-contain pb-4">
            <h2 className="mb-2 text-base font-semibold">{viewed.name}</h2>
            {tasks(viewed)}
          </section>
        )}
      </div>
      <SessionPageFooter
        landscape={landscape}
        actions={
          !landscape && (
            <div className="flex gap-2 px-4 pt-2 pb-7">
              <Button
                variant="unstyled"
                className="h-12 flex-1 rounded-[14px] bg-(--session-sheet-surface) text-[15px] leading-5.5 font-semibold text-foreground"
                disabled={pending}
                onClick={addTask}
              >
                {t("plan.addTask")}
              </Button>
              <Button
                variant="unstyled"
                className="h-12 flex-1 rounded-[14px] bg-(--session-sheet-surface) text-[15px] leading-5.5 font-semibold text-foreground"
                disabled={pending}
                onClick={() => setSheet("subjects")}
              >
                {t("subjectSheet.title")}
              </Button>
            </div>
          )
        }
        leading={
          landscape && (
            <div className="flex w-full gap-2">
              <Button variant="subtle" disabled={pending} onClick={addTask}>
                {t("plan.addTask")}
              </Button>
              <Button variant="subtle" disabled={pending} onClick={() => setSheet("subjects")}>
                + {t("subjectSheet.title")}
              </Button>
            </div>
          )
        }
      />
      {(sheet === "task" || sheet === "addTask") && (
        <TaskSheet
          theme="theme-dark"
          key={`${sheet}:${task?.key ?? subject?.id}:${clock.todayKey}`}
          open
          onOpenChange={() => setSheet(null)}
          userId={userId}
          dateKey={clock.todayKey}
          todayKey={clock.todayKey}
          task={sheet === "task" ? task : null}
          subjectId={subject?.id ?? null}
          subjects={all}
          onStudyStart={(value) => {
            const found = all.find((item) => item.id === value.subjectId);
            if (found) play(found);
          }}
        />
      )}
      {sheet === "subjects" && (
        <SubjectSheet
          theme="theme-dark"
          open
          onOpenChange={() => setSheet(null)}
          dateKey={clock.todayKey}
          subjects={store.status === "ready" ? store.subjects : undefined}
          includedSubjectIds={today.map((value) => value.id)}
          loadError={store.status === "error" ? { retry: () => void store.reload() } : undefined}
          onCreateSubject={async (name) => {
            const created = await createSubject({ name });
            await store.reload();
            return created;
          }}
          onAddSubjects={async (date, ids) => {
            for (const id of ids)
              await mutation.mutateAsync({
                kind: "selectSubject",
                ownerId: userId,
                date,
                subjectId: id,
              });
          }}
        />
      )}
      {sheet === "rename" && subject && (
        <NameSheet
          theme="theme-dark"
          open
          onOpenChange={() => setSheet(null)}
          initial={subject.name}
          label={t("editor.aria.subjectName")}
          title={t("rowMenu.rename")}
          maxLength={12}
          onSave={async (name) => {
            await renameSubject(subject.id, { name });
            await refresh();
          }}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        title={t("plan.deleteConfirm", { name: deleting?.name ?? "" })}
        confirmLabel={t("rowMenu.remove")}
        cancelLabel={t("common:actions.cancel")}
        pending={globalPending}
        theme="theme-dark"
        maskFromAnalytics
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting || globalPending) return;
          setGlobalPending(true);
          void deleteSubject(deleting.id)
            .then(async () => {
              if (selection === deleting.id) onSelect(null);
              await refresh();
              setDeleting(null);
            })
            .catch(() => onNotice(t("common:errors.retryLater")))
            .finally(() => setGlobalPending(false));
        }}
      />
    </>
  );
}

function SessionPlanSubjectHead({
  subject,
  focusSec,
  running,
  other,
  disabled,
  onPlay,
  onDeselect,
  onLongPress,
}: {
  subject: PlannerDaySubject;
  focusSec: number;
  running: boolean;
  other: boolean;
  disabled: boolean;
  onPlay: () => void;
  onDeselect: () => void;
  onLongPress: () => void;
}) {
  const { t } = useTranslation("planner");
  const activate = () => {
    if (disabled) return;
    if (running) onDeselect();
    else onPlay();
  };
  const { handlers } = usePressGestures({
    onTap: activate,
    onLongPress: () => {
      if (!disabled) onLongPress();
    },
  });
  return (
    <div
      {...handlers}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-label={t(running ? "studyStart.deselectSubject" : "studyStart.selectSubject", {
        name: subject.name,
      })}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate();
        }
      }}
      className={cn(
        "relative flex min-h-10 w-full touch-pan-y items-center gap-2 text-left before:absolute before:inset-x-0 before:-inset-y-0.5",
        other && "min-h-12",
      )}
    >
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-[2px]"
        style={{ background: subjectColorVar(subject.colorIndex) }}
      />
      <span
        className={cn(
          "min-w-0 flex-1 text-[15px] leading-5.5 wrap-break-word",
          other ? "font-semibold" : "font-bold",
        )}
      >
        {subject.name}
      </span>
      {other ? (
        <Plus aria-hidden size={18} strokeWidth={2.2} className="shrink-0 text-muted-foreground" />
      ) : (
        <>
          {running && (
            <span className="shrink-0 text-xs font-semibold text-primary">
              {t("studyStart.studying")}
            </span>
          )}
          <span className="shrink-0 text-[13px] leading-4.5 text-muted-foreground tabular-nums">
            {formatDuration(Math.ceil(focusSec / 60) * 60)}
          </span>
        </>
      )}
    </div>
  );
}

function SessionPlanTaskRow({
  task,
  disabled = false,
  onToggle,
  onLongPress,
  onRemove,
}: {
  task: Pick<PlannerTask, "name" | "doneAt">;
  disabled?: boolean;
  onToggle: (done: boolean) => void;
  onLongPress: (element: HTMLElement) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation("study-session");
  const done = task.doneAt !== null;
  const { swipeX, pressed, handlers } = usePressGestures({
    onTap: () => {
      if (!disabled) onToggle(!done);
    },
    onLongPress: (element) => {
      if (!disabled) onLongPress(element);
    },
    onSwipeLeft: () => {
      if (!disabled) onRemove();
    },
  });
  return (
    <div className="relative">
      <div
        aria-hidden
        style={{ opacity: Math.min(1, -swipeX / SWIPE_REMOVE_PX) }}
        className="absolute inset-0 flex items-center justify-end rounded-md bg-(--session-exit-bg) pr-3 text-sm font-semibold text-white"
      >
        {t("subjectSheet.remove")}
      </div>
      <div
        {...handlers}
        role="checkbox"
        tabIndex={disabled ? -1 : 0}
        aria-label={task.name}
        aria-checked={done}
        aria-disabled={disabled || undefined}
        onKeyDown={(event) => {
          if (!disabled && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            onToggle(!done);
          }
        }}
        style={{ transform: `translateX(${swipeX}px)` }}
        className={cn(
          "relative flex min-h-9 touch-pan-y items-start gap-2.5 rounded-md pl-4 text-left select-none before:absolute before:inset-x-0 before:-inset-y-1",
          pressed && "opacity-70",
          swipeX !== 0 ? "bg-(--session-dialog-bg)" : "bg-transparent",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "mt-2.25 flex size-4.5 shrink-0 items-center justify-center rounded-full",
            done ? "bg-primary" : "border-2 border-white/35",
          )}
        >
          {done && <Check size={11} strokeWidth={3.2} className="text-white" />}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 py-2 text-sm leading-5 wrap-break-word whitespace-normal",
            done && "text-muted-foreground line-through",
          )}
        >
          {task.name}
        </span>
      </div>
    </div>
  );
}
