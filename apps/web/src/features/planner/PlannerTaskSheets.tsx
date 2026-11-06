import { useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  CalendarArrowUp,
  CalendarDays,
  ChevronRight,
  Pencil,
  Plus,
  Repeat2,
  Trash2,
} from "lucide-react";
import type {
  PlannerDaySubject,
  PlannerTask,
  PlannerRepeatRequest,
  SubjectResponse,
} from "@focusmakers/types";
import { Button } from "@/components/ui/button";
import { CharCount } from "@/components/ui/char-count";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { addDaysToDateKey, formatMonthDay } from "@/features/records/recordsFormat";
import { subjectColorVar } from "@/features/records/recordsTimetable";
import { MAX_TASKS, TASK_NAME_MAX } from "@/features/study-session/subjectInteractions";
import { cn } from "@/lib/utils";
import { useKeyboardInset } from "@/lib/useKeyboardInset";
import { createSubject, listSubjects } from "@/lib/subjectApi";
import { plannerDayQuery } from "@/lib/plannerQueries";
import { getPlannerTaskRepeat } from "@/lib/plannerApi";
import { usePlannerPlanMutation } from "./usePlannerPlanMutation";
import { PlannerDateSheet } from "./PlannerDateSheet";
import { PlannerNameSheet } from "./PlannerNameSheet";
import { plannerMode } from "./plannerPermissions";
import { PlannerRepeatSheet, PlannerRepeatControls } from "./PlannerRepeatSheet";
import { PlannerRepeatScopeDialog } from "./PlannerRepeatScopeDialog";
import { PlannerSubjectSheets } from "./PlannerSubjectSheets";
import { usePlannerClock } from "./usePlannerClock";

function subscribeComposerViewport(onChange: () => void) {
  const viewport = window.visualViewport;
  window.addEventListener("resize", onChange);
  viewport?.addEventListener("resize", onChange);
  viewport?.addEventListener("scroll", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    viewport?.removeEventListener("resize", onChange);
    viewport?.removeEventListener("scroll", onChange);
  };
}

export interface PlannerTaskSheetsProps {
  theme?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: number | null;
  dateKey: string;
  todayKey: string;
  task: PlannerTask | null;
  subjectId: number | null;
  subjects: readonly PlannerDaySubject[];
  onStudyStart: (task: PlannerTask) => void;
}

export function PlannerTaskSheets({
  open,
  onOpenChange,
  userId,
  dateKey,
  todayKey,
  task,
  subjectId,
  subjects,
  onStudyStart,
  theme = "theme-soft-blue",
}: PlannerTaskSheetsProps) {
  const { t } = useTranslation(["planner", "common"]);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState(subjectId);
  const [date, setDate] = useState(dateKey);
  const [failed, setFailed] = useState(false);
  const [panel, setPanel] = useState(task ? "menu" : "create");
  const [repeat, setRepeat] = useState<PlannerRepeatRequest>({ weekdays: [], endDate: null });
  const keyboardInset = useKeyboardInset();
  const composerViewportHeight = useSyncExternalStore(subscribeComposerViewport, () => {
    // iOS는 창 높이가 이미 줄어들어도 offsetTop을 남기므로 보이는 높이를 직접 쓴다.
    return window.visualViewport?.height ?? window.innerHeight;
  });
  const [rename, setRename] = useState(task?.name ?? "");
  const [addedSubjects, setAddedSubjects] = useState<SubjectResponse[]>([]);
  const [addedSubjectIdsByDate, setAddedSubjectIdsByDate] = useState<Record<string, number[]>>({});
  const queryClient = useQueryClient();
  const { timeZone } = usePlannerClock();
  const targetDay = useQuery({
    ...plannerDayQuery(userId ?? 0, date, timeZone),
    enabled: userId !== null && panel === "create" && open,
  });
  const repeatQuery = useQuery({
    queryKey: ["planner", userId, "taskRepeat", task?.key, task?.date, timeZone],
    queryFn: ({ signal }) => getPlannerTaskRepeat(task!.key, { timeZone, signal }),
    enabled: open && panel === "repeat" && userId !== null && task?.seriesId != null,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const allSubjects = useQuery({
    queryKey: ["subjects", userId],
    queryFn: listSubjects,
    enabled: userId !== null && panel === "subjects",
  });
  const mutation = usePlannerPlanMutation(userId);
  const composerSubjects = [
    ...subjects.filter((value) => !value.deleted),
    ...addedSubjects.filter((value) => !subjects.some((existing) => existing.id === value.id)),
  ];
  const confirmedDay =
    targetDay.isSuccess && targetDay.data.date === date ? targetDay.data : undefined;
  const includedSubjectIds = [
    ...new Set([
      ...(confirmedDay?.subjects?.filter((value) => value.selected).map((value) => value.id) ?? []),
      ...(addedSubjectIdsByDate[date] ?? []),
    ]),
  ];
  const over = name.length > TASK_NAME_MAX;
  const taskLimitReached =
    (confirmedDay?.subjects?.find((value) => value.id === subject)?.tasks.length ?? 0) >= MAX_TASKS;
  const invalidRepeatEnd =
    repeat.weekdays.length > 0 && repeat.endDate != null && repeat.endDate < date;
  const canSave =
    !mutation.isPending &&
    !over &&
    name.trim().length > 0 &&
    subject !== null &&
    date >= todayKey &&
    !taskLimitReached &&
    !invalidRepeatEnd;
  async function save() {
    if (taskLimitReached) return;
    if (!canSave || subject === null) return;
    setFailed(false);
    try {
      await mutation.mutateAsync({
        kind: "createTask",
        body: {
          subjectId: subject,
          date,
          name: name.trim(),
          ...(repeat.weekdays.length ? { repeat } : {}),
        },
      });
      onOpenChange(false);
    } catch {
      setFailed(true);
    }
  }
  if (panel === "subjects")
    return (
      <PlannerSubjectSheets
        theme={theme}
        open={open}
        onOpenChange={() => setPanel("create")}
        dateKey={date}
        subjects={allSubjects.isError ? undefined : allSubjects.data}
        includedSubjectIds={includedSubjectIds}
        loadError={allSubjects.isError ? { retry: () => void allSubjects.refetch() } : undefined}
        onCreateSubject={async (subjectName) => {
          const created = await createSubject({ name: subjectName });
          queryClient.setQueryData<SubjectResponse[]>(["subjects", userId], (old) => [
            ...(old ?? []),
            created,
          ]);
          return created;
        }}
        onAddSubjects={async (pickedDate, ids) => {
          const metadata = queryClient.getQueryData<SubjectResponse[]>(["subjects", userId]) ?? [];
          for (const id of ids)
            await mutation.mutateAsync({
              kind: "selectSubject",
              ownerId: userId,
              date: pickedDate,
              subjectId: id,
            });
          setAddedSubjectIdsByDate((current) => ({
            ...current,
            [pickedDate]: [...new Set([...(current[pickedDate] ?? []), ...ids])],
          }));
          setAddedSubjects((current) => [
            ...current,
            ...metadata.filter(
              (value) =>
                ids.includes(value.id) && !current.some((existing) => existing.id === value.id),
            ),
          ]);
          setSubject(ids[0] ?? subject);
        }}
      />
    );
  if (panel === "repeat" || panel === "repeatEnd")
    return (
      <PlannerRepeatSheet
        key={`${task?.key ?? "new"}:${task?.date ?? date}:${task?.seriesId != null && repeatQuery.isSuccess && !repeatQuery.isFetching ? "loaded" : "waiting"}`}
        theme={theme}
        open={open}
        onOpenChange={() => (task ? onOpenChange(false) : setPanel("create"))}
        dateKey={task?.date ?? date}
        userId={userId}
        initial={
          task
            ? task.seriesId === null
              ? null
              : repeatQuery.isSuccess && !repeatQuery.isFetching
                ? { weekdays: repeatQuery.data.weekdays, endDate: repeatQuery.data.endDate }
                : undefined
            : repeat
        }
        loading={task?.seriesId != null && repeatQuery.isFetching}
        onRetry={
          task?.seriesId != null && userId !== null ? () => void repeatQuery.refetch() : undefined
        }
        taskName={task?.name}
        initialPanel={panel === "repeatEnd" ? "end" : "rule"}
        onSave={async (value) => {
          if (task) await mutation.mutateAsync({ kind: "repeatTask", key: task.key, body: value });
          else {
            setRepeat(value);
            setPanel("create");
          }
        }}
      />
    );
  if ((panel === "deleteScope" || panel === "renameScope") && task)
    return (
      <PlannerRepeatScopeDialog
        theme={theme}
        open={open}
        onOpenChange={() => setPanel(panel === "deleteScope" ? "menu" : "rename")}
        action={panel === "deleteScope" ? "delete" : "rename"}
        onConfirm={async (scope) => {
          await mutation.mutateAsync(
            panel === "deleteScope"
              ? { kind: "deleteTask", key: task.key, scope }
              : { kind: "updateTask", key: task.key, body: { name: rename, scope } },
          );
          onOpenChange(false);
        }}
      />
    );
  if (panel === "date")
    return (
      <PlannerDateSheet
        theme={theme}
        open={open}
        onOpenChange={() => setPanel("create")}
        userId={userId}
        dateKey={date}
        todayKey={todayKey}
        minDate={todayKey}
        onPick={(value) => {
          setDate(value);
          setPanel("create");
        }}
      />
    );
  if (panel === "move" && task)
    return (
      <PlannerDateSheet
        theme={theme}
        open={open}
        onOpenChange={onOpenChange}
        userId={userId}
        dateKey={task.date}
        todayKey={todayKey}
        minDate={todayKey}
        excludeDate={task.date}
        title={t("plan.moveTitle")}
        subtitle={task.name}
        confirmLabel={(value) => t("plan.moveConfirm", { date: formatMonthDay(value) })}
        onPick={() => {}}
        onConfirm={async (value) => {
          await mutation.mutateAsync({ kind: "moveTask", key: task.key, body: { date: value } });
        }}
      />
    );
  if (panel === "rename" && task)
    return (
      <PlannerNameSheet
        theme={theme}
        open={open}
        onOpenChange={onOpenChange}
        initial={rename}
        label={t("editor.aria.taskName")}
        title={t("rowMenu.rename")}
        maxLength={TASK_NAME_MAX}
        closeOnSave={task.seriesId === null}
        onSave={async (value) => {
          if (task.seriesId !== null) {
            setRename(value);
            setPanel("renameScope");
            return;
          }
          await mutation.mutateAsync({ kind: "updateTask", key: task.key, body: { name: value } });
        }}
      />
    );
  if (panel === "menu" && task) {
    const mode = plannerMode(task.date, todayKey);
    const taskSubject = subjects.find((value) => value.id === task.subjectId);
    return (
      <Drawer
        open={open}
        onOpenChange={(next, details) => {
          if (mutation.isPending) {
            details.cancel();
            return;
          }
          onOpenChange(next);
        }}
      >
        <DrawerContent
          variant="planner"
          bottomSpacing="compact"
          className={theme}
          initialFocus={false}
          finalFocus={false}
        >
          <div className="flex flex-col gap-4 pt-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-[13px] leading-4.5 font-semibold text-muted-foreground">
                {taskSubject && (
                  <span
                    aria-hidden
                    className="size-3.5 shrink-0 rounded-xs border-l-3"
                    style={{
                      background: `color-mix(in srgb, ${subjectColorVar(taskSubject.colorIndex)} 30%, var(--muted))`,
                      borderColor: subjectColorVar(taskSubject.colorIndex),
                    }}
                  />
                )}
                <span>
                  {taskSubject?.name ?? t("subjects.unassigned")}
                  {mode !== "today" && ` · ${formatMonthDay(task.date)}`}
                </span>
              </div>
              <DrawerTitle className="text-xl leading-7 font-extrabold wrap-break-word whitespace-normal">
                {task.name}
              </DrawerTitle>
            </div>
            {mode === "today" && (
              <Button
                data-base-ui-swipe-ignore=""
                onClick={() => {
                  onOpenChange(false);
                  onStudyStart(task);
                }}
                className="h-13 rounded-xl text-base leading-6 font-bold shadow-sb-cta"
              >
                {t("plan.studyStart")}
              </Button>
            )}
            <div className="flex flex-col">
              <Button
                data-base-ui-swipe-ignore=""
                variant="ghost"
                aria-label={t("plan.move")}
                onClick={() => setPanel("move")}
                className={cn(
                  "h-13 justify-start gap-3 rounded-none px-1 py-0 text-[15px] leading-5.5 font-semibold",
                  mode !== "past" && "border-b border-border",
                )}
              >
                <CalendarArrowUp aria-hidden size={20} className="shrink-0 text-muted-foreground" />
                <span className="flex-1 text-left">{t("plan.move")}</span>
                {mode === "today" && (
                  <span className="text-sm font-normal text-muted-foreground">
                    {formatMonthDay(addDaysToDateKey(todayKey, 1))}
                  </span>
                )}
                <ChevronRight aria-hidden size={16} className="shrink-0 text-muted-foreground" />
              </Button>
              {mode !== "past" && (
                <>
                  <Button
                    data-base-ui-swipe-ignore=""
                    variant="ghost"
                    onClick={() => setPanel("repeat")}
                    aria-label={t("plan.repeat")}
                    className="h-13 justify-start gap-3 rounded-none border-b border-border px-1 py-0 text-[15px] leading-5.5 font-semibold"
                  >
                    <Repeat2 aria-hidden size={20} className="shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-left">{t("plan.repeat")}</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      {t(task.seriesId === null ? "repeat.none" : "plan.repeating")}
                    </span>
                    <ChevronRight
                      aria-hidden
                      size={16}
                      className="shrink-0 text-muted-foreground"
                    />
                  </Button>
                  <Button
                    data-base-ui-swipe-ignore=""
                    variant="ghost"
                    onClick={() => setPanel("rename")}
                    className="h-13 justify-start gap-3 rounded-none border-b border-border px-1 py-0 text-[15px] leading-5.5 font-semibold"
                  >
                    <Pencil aria-hidden size={20} className="shrink-0 text-muted-foreground" />
                    {t("rowMenu.rename")}
                  </Button>
                  <Button
                    data-base-ui-swipe-ignore=""
                    variant="ghost"
                    disabled={mutation.isPending}
                    className="h-13 justify-start gap-3 rounded-none px-1 py-0 text-[15px] leading-5.5 font-semibold text-feedback-danger"
                    onClick={() => {
                      if (task.seriesId !== null) {
                        setPanel("deleteScope");
                        return;
                      }
                      setFailed(false);
                      void mutation
                        .mutateAsync({ kind: "deleteTask", key: task.key, scope: "THIS" })
                        .then(
                          () => onOpenChange(false),
                          () => setFailed(true),
                        );
                    }}
                  >
                    <Trash2 aria-hidden size={20} className="shrink-0" />
                    {t("rowMenu.remove")}
                  </Button>
                </>
              )}
            </div>
            {mode === "past" && (
              <p className="text-[13px] leading-4.5 text-muted-foreground">{t("plan.pastTask")}</p>
            )}
            {failed && (
              <p role="alert" className="text-sm text-state-distract-text">
                {t("common:errors.retryLater")}
              </p>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Drawer
      open={open}
      onOpenChange={(next, details) => {
        if (mutation.isPending) {
          details.cancel();
          return;
        }
        onOpenChange(next);
      }}
    >
      <DrawerContent
        variant="planner"
        className={cn(theme, "flex flex-col")}
        style={{
          marginBottom: keyboardInset,
          maxHeight: `calc(${composerViewportHeight}px - max(24px, env(safe-area-inset-top)))`,
        }}
        initialFocus={false}
        finalFocus={false}
      >
        <form
          className="flex min-h-0 flex-col gap-4 pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain">
            <div className="flex items-center justify-between gap-3">
              <DrawerTitle className="text-lg leading-6.5 font-bold">
                {task?.name ?? t("plan.addTask")}
              </DrawerTitle>
              <Button
                data-base-ui-swipe-ignore=""
                variant="secondary"
                onClick={() => setPanel("date")}
                disabled={mutation.isPending}
                className="relative h-8.5 gap-1.5 rounded-full px-3 py-0 text-[13px] leading-4.5 font-semibold before:absolute before:-inset-y-1.25"
              >
                <CalendarDays aria-hidden size={15} />
                {formatMonthDay(date)}
              </Button>
            </div>
            <div className="flex flex-col gap-2.5">
              <p className="text-[13px] leading-4.5 font-semibold text-muted-foreground">
                {t("plan.subjectLabel")}
              </p>
              <div
                className="grid grid-cols-5 gap-2"
                role="group"
                aria-label={t("subjectSheet.mySubjects")}
              >
                {composerSubjects.map((value) => (
                  <Button
                    key={value.id}
                    data-base-ui-swipe-ignore=""
                    variant="unstyled"
                    aria-pressed={subject === value.id}
                    disabled={mutation.isPending}
                    onClick={() => setSubject(value.id)}
                    className={cn(
                      "flex h-16 min-w-0 flex-col gap-1.5 rounded-lg border-[1.5px] border-border bg-muted p-0 text-xs leading-4 font-semibold",
                      subject === value.id && "border-2 font-extrabold",
                    )}
                    style={
                      subject === value.id
                        ? {
                            borderColor: `color-mix(in srgb, ${subjectColorVar(value.colorIndex)} 72%, var(--foreground))`,
                            background: `color-mix(in srgb, ${subjectColorVar(value.colorIndex)} 14%, var(--muted))`,
                          }
                        : undefined
                    }
                  >
                    <span
                      aria-hidden
                      className="size-5 shrink-0 rounded-[6px] border-l-3"
                      style={{
                        background: `color-mix(in srgb, ${subjectColorVar(value.colorIndex)} 30%, var(--muted))`,
                        borderColor: subjectColorVar(value.colorIndex),
                      }}
                    />
                    <span className="max-w-full wrap-break-word whitespace-normal">
                      {value.name}
                    </span>
                  </Button>
                ))}
                <Button
                  data-base-ui-swipe-ignore=""
                  variant="unstyled"
                  disabled={mutation.isPending || userId === null}
                  onClick={() => setPanel("subjects")}
                  className="flex h-16 min-w-0 flex-col gap-1.5 rounded-lg border-[1.5px] border-dashed border-border-strong p-0 text-xs leading-4 font-semibold text-muted-foreground"
                >
                  <Plus aria-hidden size={20} strokeWidth={2.2} />
                  {t("plan.subjectLabel")}
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              <label
                htmlFor="planner-task-name"
                className="text-[13px] leading-4.5 font-semibold text-muted-foreground"
              >
                {t("plan.taskLabel")}
              </label>
              <Input
                id="planner-task-name"
                data-base-ui-swipe-ignore=""
                autoFocus
                aria-label={t("editor.aria.taskName")}
                className="border-[1.5px] leading-5.5 focus-visible:ring-0"
                value={name}
                disabled={mutation.isPending}
                aria-invalid={over || undefined}
                aria-describedby="planner-task-count"
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && event.nativeEvent.isComposing)
                    event.preventDefault();
                }}
              />
              <CharCount
                id="planner-task-count"
                length={name.length}
                max={TASK_NAME_MAX}
                showFrom={0.75}
                overMessage={t("editor.overLimit", { count: TASK_NAME_MAX })}
              />
              {taskLimitReached && (
                <p role="status" className="text-sm text-state-distract-text">
                  {t("plan.taskLimit")}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2.5">
              <p className="text-[13px] leading-4.5 font-semibold text-muted-foreground">
                {t("plan.repeat")}
              </p>
              <fieldset disabled={mutation.isPending}>
                <PlannerRepeatControls
                  compact
                  value={repeat}
                  onChange={setRepeat}
                  onEnd={() => setPanel("repeatEnd")}
                />
              </fieldset>
              {invalidRepeatEnd && (
                <p role="alert" className="text-sm text-state-distract-text">
                  {t("repeat.endBeforeStart")}
                </p>
              )}
            </div>
            {failed && (
              <p role="alert" className="text-sm text-state-distract-text">
                {t("common:errors.retryLater")}
              </p>
            )}
          </div>
          <Button
            data-base-ui-swipe-ignore=""
            type="submit"
            disabled={!canSave}
            className="h-13 shrink-0 rounded-xl text-base leading-6 font-bold shadow-sb-cta"
          >
            {t("plan.add")}
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
