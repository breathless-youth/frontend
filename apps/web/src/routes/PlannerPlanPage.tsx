import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronRight, Pencil, Plus } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { PlannerDaySubject, PlannerTask, SubjectResponse } from "@focusmakers/types";
import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CtaToaster } from "@/components/ui/sonner";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { PlannerTimetable } from "@/features/planner/PlannerTimetable";
import { PlannerPlanSubjects } from "@/features/planner/PlannerPlanSubjects";
import { PlannerSample } from "@/features/planner/PlannerSample";
import type { PlannerPlanSubject } from "@/features/planner/plannerPlanModel";
import { plannerPlanDay } from "@/features/planner/plannerPlanDay";
import { usePlannerPlan } from "@/features/planner/usePlannerPlan";
import { usePlannerPlanMutation } from "@/features/planner/usePlannerPlanMutation";
import { usePlannerClock } from "@/features/planner/usePlannerClock";
import { plannerEntryOf } from "@/features/planner/useOpenPlanner";
import { SegmentedControl } from "@/features/records/SegmentedControl";
import {
  addDaysToDateKey,
  dayTitleWithWeekday,
  formatMonthDay,
  weekdayIndexOfDateKey,
  weekdayShortLabel,
  formatDuration,
} from "@/features/records/recordsFormat";
import { useHorizontalSwipe } from "@/features/records/useHorizontalSwipe";
import { trackPlannerOpened, trackPlannerDateChanged } from "@/lib/amplitude";
import { postToNative } from "@/lib/bridge";
import { ApiError } from "@/lib/api";
import { lazyWithPreload } from "@/lib/lazyWithPreload";
import { plannerKeys } from "@/lib/plannerQueries";
import { personalRecordsKeys } from "@/lib/personalRecordsQueries";
import { createSubject, deleteSubject, listSubjects, renameSubject } from "@/lib/subjectApi";
import { showCtaToast, showToast } from "@/lib/toast";
import { useUserId } from "@/lib/userId";

const { LazySheet: SubjectSheet } = lazyWithPreload(() =>
  import("@/features/planner/PlannerSubjectSheets").then((module) => module.PlannerSubjectSheets),
);
const { LazySheet: DateSheet } = lazyWithPreload(() =>
  import("@/features/planner/PlannerDateSheet").then((module) => module.PlannerDateSheet),
);
const { LazySheet: NameSheet } = lazyWithPreload(() =>
  import("@/features/planner/PlannerNameSheet").then((module) => module.PlannerNameSheet),
);
const { LazySheet: TaskSheet } = lazyWithPreload(() =>
  import("@/features/planner/PlannerTaskSheets").then((module) => module.PlannerTaskSheets),
);

const { LazySheet: GoalSheet } = lazyWithPreload(() =>
  import("@/features/planner/PlannerGoalSheet").then((module) => module.PlannerGoalSheet),
);
const { LazySheet: StudyStartSheet } = lazyWithPreload(() =>
  import("@/features/planner/PlannerStudyStartSheet").then(
    (module) => module.PlannerStudyStartSheet,
  ),
);
const PlannerWeek = lazy(() =>
  import("@/features/planner/PlannerWeek").then((module) => ({ default: module.PlannerWeek })),
);

const RecordEditor = lazy(() =>
  import("@/features/planner/record-edit/PlannerRecordEditor").then((module) => ({
    default: module.PlannerRecordEditor,
  })),
);

export function PlannerPlanPage() {
  const userId = useUserId();
  // 같은 날짜가 새 계정의 캐시에 있어도 기록 초안과 열린 시트를 이전 계정에서 이어받지 않는다.
  return <PlannerPlanContent key={userId} userId={userId} />;
}

function PlannerPlanContent({ userId }: { userId: number | null }) {
  const { t } = useTranslation(["planner", "common", "study-session"]);
  const clock = usePlannerClock();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requested = params.get("date");
  const dateKey =
    requested &&
    /^\d{4}-\d{2}-\d{2}$/.test(requested) &&
    addDaysToDateKey(requested, 0) === requested
      ? requested
      : clock.todayKey;
  const [view, setView] = useState<"daily" | "weekly">("daily");
  const [sheet, setSheet] = useState<
    | null
    | "subjects"
    | "date"
    | "goal"
    | "records"
    | "addTask"
    | "task"
    | "renameSubject"
    | "studyStart"
  >(() => (params.get("edit") === "records" ? "records" : null));
  const [task, setTask] = useState<PlannerTask | null>(null);
  const [subject, setSubject] = useState<PlannerPlanSubject | null>(null);
  const [confirm, setConfirm] = useState<"remove" | "delete" | null>(null);
  const [globalPending, setGlobalPending] = useState(false);
  const [dismissedSample, setDismissedSample] = useState(false);
  const [noticeAppearance, setNoticeAppearance] = useState<"planner" | "planner-limit">("planner");
  const [samplePromptContainer, setSamplePromptContainer] = useState<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();
  const state = usePlannerPlan(userId, dateKey);
  const plan = state.plan;
  const mutation = usePlannerPlanMutation(userId);
  const allSubjects = useQuery({
    queryKey: ["subjects", userId],
    queryFn: listSubjects,
    enabled: userId !== null,
  });
  const pending = mutation.isPending || globalPending;
  const showSample =
    plan?.subjects.length === 0 &&
    plan.mode !== "past" &&
    allSubjects.data?.length === 0 &&
    !dismissedSample;
  const opened = useRef(false);
  useEffect(() => {
    if (!opened.current) {
      opened.current = true;
      trackPlannerOpened({
        via: plannerEntryOf(location) ?? "unknown",
        isToday: dateKey === clock.todayKey,
      });
    }
  }, [location, dateKey, clock.todayKey]);
  function pickDate(date: string, method: "button" | "swipe" | "picker" = "picker") {
    trackPlannerDateChanged({
      delta: Math.round((Date.parse(date) - Date.parse(dateKey)) / 86_400_000),
      method,
    });
    setSheet(null);
    setTask(null);
    setSubject(null);
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set("date", date);
        return next;
      },
      { replace: true, state: location.state },
    );
  }
  const swipe = useHorizontalSwipe((delta) => pickDate(addDaysToDateKey(dateKey, delta), "swipe"));
  function closeRecords() {
    if (params.get("edit") !== "records") {
      setSheet(null);
      return;
    }
    const history = window.history.state as { idx?: number } | null;
    if (history?.idx) {
      navigate(-1);
      return;
    }
    const next = new URLSearchParams(location.search);
    const returnDate = next.get("returnDate");
    next.delete("edit");
    next.delete("returnDate");
    next.delete("from");
    const via = plannerEntryOf(location);
    if (via === "home") next.delete("date");
    else
      next.set(
        "date",
        returnDate &&
          /^\d{4}-\d{2}-\d{2}$/.test(returnDate) &&
          addDaysToDateKey(returnDate, 0) === returnDate
          ? returnDate
          : dateKey,
      );
    navigate(
      { pathname: via === "home" ? "/home" : "/records", search: next.toString() },
      { replace: true },
    );
  }
  async function refresh() {
    postToNative({ type: "records-changed", atMs: Date.now() });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: plannerKeys.user(userId ?? 0) }),
      queryClient.invalidateQueries({ queryKey: personalRecordsKeys.user(userId ?? 0) }),
      queryClient.invalidateQueries({ queryKey: ["subjects"] }),
    ]);
  }
  async function run(action: Parameters<typeof mutation.mutateAsync>[0]) {
    try {
      await mutation.mutateAsync(action);
    } catch {
      showToast(t("common:errors.retryLater"));
    }
  }
  async function removeSubject(value: PlannerPlanSubject) {
    try {
      await mutation.mutateAsync({ kind: "removeSubject", date: dateKey, subjectId: value.id });
      setConfirm(null);
    } catch {
      showToast(t("common:errors.retryLater"));
    }
  }
  async function deleteGlobal() {
    if (!subject || pending) return;
    setGlobalPending(true);
    try {
      await deleteSubject(subject.id);
      await refresh();
      setConfirm(null);
    } catch {
      showToast(t("common:errors.retryLater"));
    } finally {
      setGlobalPending(false);
    }
  }
  const day = plan ? plannerPlanDay(plan) : null;
  const taskSubjects: PlannerDaySubject[] = (allSubjects.data ?? []).map(
    (value) =>
      plan?.subjects.find((item) => item.id === value.id) ?? {
        id: value.id,
        name: value.name,
        colorIndex: value.colorIndex,
        deleted: false,
        selected: false,
        studySec: 0,
        focusSec: 0,
        tasks: [],
      },
  );
  for (const value of plan?.subjects ?? [])
    if (!taskSubjects.some((item) => item.id === value.id)) taskSubjects.push(value);
  if (sheet === "records") {
    const placeholder = (
      <main className="theme-soft-blue min-h-dvh bg-muted page-column">
        <ScreenBackHeader appearance="plain" title={t("plan.editRecords")} onBack={closeRecords} />
        {state.isError ? (
          <ErrorState
            message={t("page.loadFailed")}
            onRetry={() => void state.refetch()}
            screen="planner"
          />
        ) : (
          <Skeleton className="h-96 w-full" />
        )}
      </main>
    );
    return (
      <Suspense fallback={placeholder}>
        {plan ? (
          <RecordEditor
            key={dateKey}
            day={plan}
            userId={userId}
            subjects={allSubjects.data}
            onDateChange={(date) => {
              pickDate(date);
              setSheet("records");
            }}
            onClose={closeRecords}
            onSaved={refresh}
          />
        ) : (
          placeholder
        )}
      </Suspense>
    );
  }

  return (
    <main
      data-testid="planner-page"
      className="theme-soft-blue bg-soft-blue relative flex min-h-dvh flex-col page-column text-foreground"
      style={{
        backgroundImage: `linear-gradient(180deg, var(--bg-soft-blue-start) 0%, var(--bg-soft-blue-end) ${view === "weekly" ? "30%" : "38%"})`,
      }}
    >
      <ScreenBackHeader
        appearance="plain"
        center={
          <SegmentedControl
            value={view}
            options={[
              { value: "daily", label: t("plan.daily") },
              { value: "weekly", label: t("plan.weekly") },
            ]}
            onChange={setView}
            nativeControlId={null}
            className={view === "weekly" ? "w-45 gap-0 p-0.75" : "w-40 gap-0 p-0.75"}
            triggerClassName={
              view === "weekly"
                ? "h-8 flex-1 justify-center px-0 py-0 text-sm leading-5 font-semibold"
                : "h-7.5 flex-1 justify-center px-0 py-0 text-sm leading-5 font-semibold"
            }
          />
        }
        onBack={() => {
          const history = window.history.state as { idx?: number } | null;
          if (history?.idx) {
            navigate(-1);
            return;
          }
          const next = new URLSearchParams(location.search);
          next.delete("date");
          next.delete("from");
          navigate(
            {
              pathname: plannerEntryOf(location) === "home" ? "/home" : "/records",
              search: next.toString(),
            },
            { replace: true },
          );
        }}
      />
      {view === "weekly" ? (
        <div className="flex-1 px-5 pb-6">
          <Suspense fallback={<Skeleton className="h-96 w-full" />}>
            <PlannerWeek
              userId={userId}
              dateKey={dateKey}
              onDateChange={pickDate}
              onStudyStart={(value) => {
                setTask(value);
                setSheet("studyStart");
              }}
            />
          </Suspense>
        </div>
      ) : (
        <div className="flex-1 px-5 pb-6">
          <div className="flex items-end justify-between gap-2 pt-0.5 pb-4.5">
            <h1
              aria-label={dayTitleWithWeekday(dateKey, true)}
              className="flex items-baseline gap-1.75 font-bold tabular-nums"
            >
              <span className="text-[22px] leading-9 tracking-[-0.5px]">
                {formatMonthDay(dateKey)}
              </span>
              <span className="text-[22px] leading-9 font-semibold text-muted-foreground">
                {weekdayShortLabel(weekdayIndexOfDateKey(dateKey))}
              </span>
            </h1>
            {plan &&
              (plan.mode === "future" ? (
                <Button
                  variant="unstyled"
                  onClick={() => setSheet("goal")}
                  aria-label={
                    plan.goal.goalSec === null
                      ? t("plan.setGoal")
                      : t("plan.goal", { duration: formatDuration(plan.goal.goalSec) })
                  }
                  className="relative h-auto min-h-0 flex-col items-end gap-px rounded-none p-0 text-foreground before:absolute before:inset-x-0 before:-inset-y-2"
                >
                  <span className="text-xs leading-4 font-normal text-muted-foreground">
                    {t("plan.goalLabel")}
                  </span>
                  {plan.goal.goalSec === null ? (
                    <span className="flex items-center gap-0.75 text-base leading-5.5 font-extrabold text-primary">
                      <Plus aria-hidden size={14} strokeWidth={2.6} />
                      {t("goal.save")}
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5 text-lg leading-5.5 font-extrabold tabular-nums">
                      {formatDuration(plan.goal.goalSec)}
                      <ChevronRight aria-hidden size={14} className="text-muted-foreground" />
                    </span>
                  )}
                </Button>
              ) : (
                <span
                  aria-label={t("head.focusTime")}
                  className="flex flex-col items-end gap-px text-lg leading-5.5 font-extrabold tabular-nums"
                >
                  <span className="text-xs leading-4 font-normal text-muted-foreground">
                    {t(showSample ? "plan.focusLabel" : "head.focusTime")}
                  </span>
                  {formatDuration(Math.ceil(plan.focusSec / 60) * 60)}
                </span>
              ))}
          </div>
          {userId === null ? (
            <p>{t("page.unregistered")}</p>
          ) : state.isError ? (
            <ErrorState
              variant="planner"
              screen="planner"
              message={t("page.loadFailed")}
              onRetry={() => void state.refetch()}
            />
          ) : !plan || !day ? (
            <Skeleton className="h-96 w-full rounded-lg" />
          ) : (
            <div data-testid="planner-swipe-area" {...swipe} className="flex items-start gap-3.5">
              {showSample ? (
                <PlannerSample
                  promptContainer={samplePromptContainer}
                  dateKey={dateKey}
                  onDirect={() => {
                    setDismissedSample(true);
                    setSheet("subjects");
                  }}
                  onCreated={refresh}
                />
              ) : (
                <div className="min-w-0 flex-1">
                  {plan.subjects.length === 0 && plan.mode === "future" ? (
                    <div className="flex flex-col items-center gap-1.5 pt-10 text-center">
                      <p className="text-[15px] leading-5.5 font-bold">{t("sample.emptyTitle")}</p>
                      <p className="text-[13px] leading-4.5 text-muted-foreground">
                        {t("sample.emptyHint")}
                      </p>
                      <Button
                        variant="unstyled"
                        disabled={pending}
                        onClick={() => setSheet("subjects")}
                        className="relative mt-2.5 h-10 gap-1.5 rounded-[14px] bg-primary px-4 text-sm font-bold text-primary-foreground shadow-sb-cta before:absolute before:inset-x-0 before:-inset-y-0.5"
                      >
                        <Plus aria-hidden size={14} strokeWidth={2.6} />
                        {t("subjectSheet.title")}
                      </Button>
                    </div>
                  ) : (
                    <PlannerPlanSubjects
                      key={dateKey}
                      subjects={plan.subjects}
                      mode={plan.mode}
                      pending={pending}
                      actions={{
                        addSubject: () => setSheet("subjects"),
                        addTask: (id) => {
                          const found = plan.subjects.find((item) => item.id === id);
                          if (!found?.canAddTask) {
                            setNoticeAppearance("planner-limit");
                            showCtaToast(t("plan.taskLimit"));
                            return;
                          }
                          setSubject(found);
                          setSheet("addTask");
                        },
                        task: (value) => {
                          setTask(value);
                          setSheet("task");
                        },
                        toggle: (value) => {
                          if (plan.mode === "future") {
                            setNoticeAppearance("planner");
                            showCtaToast(t("plan.futureCheck"));
                            return;
                          }
                          void run({
                            kind: "updateTask",
                            key: value.key,
                            body: { done: !value.done },
                          });
                        },
                        rename: (value) => {
                          setSubject(value);
                          setSheet("renameSubject");
                        },
                        remove: (value) => {
                          setSubject(value);
                          if (value.tasks.length) setConfirm("remove");
                          else void removeSubject(value);
                        },
                        delete: (value) => {
                          setSubject(value);
                          setConfirm("delete");
                        },
                        reorder: async (ids) => {
                          await run({
                            kind: "reorderSubjects",
                            date: dateKey,
                            body: { subjectIds: ids },
                          });
                        },
                      }}
                    />
                  )}
                </div>
              )}
              <div className="relative shrink-0 regular:w-[calc((100%-14px)/2)]">
                <PlannerTimetable
                  size="plan"
                  day={day}
                  nowMs={clock.nowMs}
                  onCellTap={plan.mode === "future" ? undefined : () => setSheet("records")}
                />
                {plan.records.length === 0 && (plan.mode !== "today" || showSample) && (
                  <p className="pointer-events-none absolute top-[46%] right-0 left-5.5 text-center text-xs leading-4.5 font-semibold whitespace-pre-line text-muted-foreground">
                    {t(plan.mode === "past" ? "plan.pastEmpty" : "plan.timetableEmpty")}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {view === "daily" && (
        <div className="sticky bottom-0 z-10 px-4 pt-0 pb-[max(24px,env(safe-area-inset-bottom))]">
          {plan && plan.subjects.length >= 20 && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-45"
              style={{
                background: "linear-gradient(180deg, transparent 0%, var(--background) 70%)",
              }}
            />
          )}
          <CtaToaster appearance={noticeAppearance} />
          {showSample && <div ref={setSamplePromptContainer} className="relative h-0" />}
          <div className="relative flex justify-between gap-2">
            <Button
              variant="unstyled"
              className="h-11 rounded-full bg-muted px-4.5 text-sm leading-5 font-bold shadow-sb-card ring-1 ring-border"
              onClick={() => pickDate(clock.todayKey)}
            >
              {t("calendar.today")}
            </Button>
            {view === "daily" && plan && plan.mode !== "future" && (
              <Button
                variant="unstyled"
                className={
                  showSample
                    ? "h-11 gap-1.5 rounded-full bg-muted px-4.5 text-sm leading-5 font-semibold shadow-sb-card ring-1 ring-border"
                    : "h-11 flex-1 gap-1.5 rounded-full bg-muted px-0 text-sm leading-5 font-semibold shadow-sb-card ring-1 ring-border"
                }
                onClick={() => setSheet("records")}
              >
                <Pencil aria-hidden size={16} />
                {t("plan.editRecords")}
              </Button>
            )}
            {showSample && <span className="flex-1" />}
            <Button
              variant="unstyled"
              className="size-11 rounded-full bg-muted p-0 shadow-sb-card ring-1 ring-border"
              aria-label={t("plan.calendar")}
              onClick={() => setSheet("date")}
            >
              <CalendarDays aria-hidden size={20} />
            </Button>
          </div>
        </div>
      )}
      <SubjectSheet
        key={`subjects:${dateKey}`}
        open={sheet === "subjects"}
        onOpenChange={(open) => setSheet(open ? "subjects" : null)}
        dateKey={dateKey}
        subjects={allSubjects.isError ? undefined : allSubjects.data}
        includedSubjectIds={plan?.subjects.map((value) => value.id) ?? []}
        loadError={allSubjects.isError ? { retry: () => void allSubjects.refetch() } : undefined}
        onCreateSubject={async (name) => {
          const created = await createSubject({ name });
          queryClient.setQueryData<SubjectResponse[]>(["subjects", userId], (old) => [
            ...(old ?? []),
            created,
          ]);
          return created;
        }}
        onAddSubjects={async (date, ids) => {
          for (const id of ids)
            await mutation.mutateAsync({ kind: "selectSubject", date, subjectId: id });
        }}
      />
      <DateSheet
        key={`date:${dateKey}`}
        open={sheet === "date"}
        onOpenChange={(open) => setSheet(open ? "date" : null)}
        userId={userId}
        dateKey={dateKey}
        todayKey={clock.todayKey}
        onPick={pickDate}
      />
      {sheet === "renameSubject" && subject && (
        <NameSheet
          key={`rename:${subject.id}`}
          open
          onOpenChange={() => setSheet(null)}
          initial={subject.name}
          label={t("editor.aria.subjectName")}
          title={t("rowMenu.rename")}
          maxLength={12}
          getErrorMessage={(error) =>
            t(
              error instanceof ApiError && error.status === 409
                ? "study-session:subjectSheet.duplicateName"
                : "common:errors.retryLater",
            )
          }
          onSave={async (name) => {
            await renameSubject(subject.id, { name });
            await refresh();
          }}
        />
      )}
      {subject && (
        <ConfirmDialog
          variant="planner"
          offsetY={confirm === "remove" ? -9 : 0}
          open={confirm !== null}
          title={
            confirm === "remove"
              ? t("plan.removeConfirm", { name: subject.name })
              : t("plan.deleteConfirm", { name: subject.name })
          }
          description={
            confirm === "remove"
              ? t("plan.removeTasks", { count: subject.tasks.length })
              : undefined
          }
          pending={pending}
          maskFromAnalytics
          cancelLabel={t("common:actions.cancel")}
          confirmLabel={confirm === "remove" ? t("plan.remove") : t("rowMenu.remove")}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm === "remove") void removeSubject(subject);
            else void deleteGlobal();
          }}
        />
      )}
      {(sheet === "task" || sheet === "addTask") && (
        <TaskSheet
          key={`${sheet}:${task?.key ?? subject?.id}:${dateKey}`}
          open
          onOpenChange={() => setSheet(null)}
          userId={userId}
          dateKey={dateKey}
          todayKey={clock.todayKey}
          task={sheet === "task" ? task : null}
          subjectId={subject?.id ?? task?.subjectId ?? null}
          subjects={taskSubjects}
          onStudyStart={(value) => {
            setTask(value);
            setSheet("studyStart");
          }}
        />
      )}
      {sheet === "studyStart" && task && (
        <StudyStartSheet
          key={task.key}
          open
          userId={userId}
          task={task}
          subject={taskSubjects.find((value) => value.id === task.subjectId)}
          onOpenChange={() => setSheet(null)}
        />
      )}
      {sheet === "goal" && plan?.mode === "future" && (
        <GoalSheet
          key={dateKey}
          open
          onOpenChange={() => setSheet(null)}
          userId={userId}
          dateKey={dateKey}
          goal={plan.goal}
        />
      )}
    </main>
  );
}
