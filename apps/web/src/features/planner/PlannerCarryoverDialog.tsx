import type { PlannerTask, SubjectResponse } from "@focusmakers/types";
import { SquareCheck, SquareMinus } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { subjectColorVar } from "@/features/records/recordsTimetable";
import { cn } from "@/lib/utils";

import { groupCarryoverTasks } from "./plannerCarryover";
import { plannerErrorCopy } from "./plannerErrorCopy";

export function PlannerCarryoverDialog({
  open = true,
  tasks,
  subjects = [],
  uncertain = false,
  onConfirm,
  onDefer,
}: {
  open?: boolean;
  tasks: PlannerTask[];
  subjects?: readonly SubjectResponse[];
  uncertain?: boolean;
  onConfirm: (selected: string[]) => Promise<void>;
  onDefer: () => void;
}) {
  const { t, i18n } = useTranslation(["planner", "common"]);
  const [selected, setSelected] = useState(() => new Set(tasks.map((task) => task.key)));
  const [shownTasks, setShownTasks] = useState(tasks);
  // 후보를 새로 받으면 이전 선택은 없는 할 일을 가리키므로 새 후보 전체로 다시 고른다.
  if (shownTasks !== tasks) {
    setShownTasks(tasks);
    setSelected(new Set(tasks.map((task) => task.key)));
  }
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [listAtEnd, setListAtEnd] = useState(false);
  const saving = useRef(false);
  if (!open) return null;
  const allSelected = selected.size === tasks.length;
  const many = tasks.length > 4;
  const groups = groupCarryoverTasks(tasks);
  const subjectMap = new Map(
    subjects
      .filter((subject) => subject && typeof subject.name === "string")
      .map((subject) => [subject.id, subject]),
  );
  const dateFormat = new Intl.DateTimeFormat(i18n.language, {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const submit = (keys: string[]) => {
    if (saving.current) return;
    saving.current = true;
    setPending(true);
    setFailure(null);
    void onConfirm(keys)
      .catch((error: unknown) => setFailure(error ?? new Error("planner save failed")))
      .finally(() => {
        saving.current = false;
        setPending(false);
      });
  };
  const selectAll = (
    <Button
      variant="unstyled"
      disabled={pending || uncertain}
      className="relative h-7 gap-1 px-0.5 py-0 text-xs leading-4 font-semibold text-muted-foreground before:absolute before:inset-x-0 before:-inset-y-2"
      onClick={() => setSelected(allSelected ? new Set() : new Set(tasks.map((task) => task.key)))}
    >
      {allSelected ? <SquareMinus aria-hidden size={13} /> : <SquareCheck aria-hidden size={13} />}
      {t(allSelected ? "carryover.deselectAll" : "carryover.selectAll")}
    </Button>
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !saving.current) onDefer();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cn(
          "theme-soft-blue flex max-h-[calc(100dvh-48px)] w-[calc(100%-48px)] max-w-sm flex-col rounded-3xl border-0 bg-muted px-5 pt-6.5 pb-5 shadow-[0_20px_40px_rgba(31,42,61,0.24)] sm:rounded-3xl",
          many ? "top-[calc(50%-8px)] gap-3.5" : "top-[calc(50%-32px)] gap-4",
        )}
      >
        <div className="flex shrink-0 flex-col gap-1 text-center">
          <DialogTitle className="text-lg leading-6.5 font-bold tracking-normal">
            {t("carryover.title", { count: tasks.length })}
          </DialogTitle>
          <DialogDescription className="text-sm leading-5">
            {t("carryover.description")}
          </DialogDescription>
        </div>
        {many && <div className="flex shrink-0 justify-end">{selectAll}</div>}
        <div className="relative flex min-h-0 flex-col">
          <div
            className={cn("min-h-0 overflow-y-auto overscroll-contain", many && "max-h-82.5 pr-2")}
            onScroll={(event) => {
              const list = event.currentTarget;
              setListAtEnd(list.scrollTop + list.clientHeight >= list.scrollHeight - 1);
            }}
          >
            {groups.map(({ date, tasks: items }, index) => (
              <section
                key={date}
                aria-label={dateFormat.format(new Date(`${date}T12:00:00Z`))}
                className={cn("flex flex-col gap-1.5", index > 0 && "mt-3.5")}
              >
                <div
                  className={cn(
                    "flex items-center justify-between gap-2",
                    !many && index === 0 && "h-7",
                  )}
                >
                  <h3 className="text-[13px] leading-4.5 font-semibold text-muted-foreground">
                    {dateFormat.format(new Date(`${date}T12:00:00Z`))}
                  </h3>
                  {!many && index === 0 && selectAll}
                </div>
                {items.map((task) => {
                  const subject = subjectMap.get(task.subjectId);
                  const color =
                    subject && Number.isInteger(subject.colorIndex)
                      ? subjectColorVar(subject.colorIndex)
                      : "var(--text-tertiary)";
                  return (
                    <label
                      key={task.key}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-[14px] border-[1.5px] border-border pr-3 pl-2.5 text-sm leading-4.5 font-semibold",
                        many ? "min-h-11 py-3.25" : "min-h-12 py-1.75",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "shrink-0 rounded-[5px] border-l-3",
                          many ? "size-4" : "size-4.5",
                        )}
                        style={{
                          borderColor: color,
                          background: `color-mix(in srgb, ${color} 30%, var(--muted))`,
                        }}
                      />
                      <span className={cn("min-w-0 flex-1", !many && "flex flex-col")}>
                        <span className="wrap-anywhere whitespace-pre-wrap">{task.name}</span>
                        {!many && (
                          <span className="text-xs leading-4 font-normal wrap-anywhere text-muted-foreground">
                            {subject?.name || t("subjects.unassigned")}
                          </span>
                        )}
                      </span>
                      {many && (
                        <span className="max-w-16 text-xs leading-4 font-normal wrap-anywhere text-muted-foreground">
                          {subject?.name || t("subjects.unassigned")}
                        </span>
                      )}
                      <Checkbox
                        aria-label={task.name}
                        checked={selected.has(task.key)}
                        disabled={pending || uncertain}
                        className="relative size-5 shrink-0 rounded-full shadow-none before:absolute before:-inset-3 [&_svg]:size-3"
                        onCheckedChange={(checked) =>
                          setSelected((previous) => {
                            const next = new Set(previous);
                            if (checked === true) next.add(task.key);
                            else next.delete(task.key);
                            return next;
                          })
                        }
                      />
                    </label>
                  );
                })}
              </section>
            ))}
          </div>
          {many && !listAtEnd && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-b from-transparent to-muted to-90%"
            />
          )}
        </div>
        {failure !== null && (
          <p role="alert" className="shrink-0 text-sm text-state-distract-text">
            {plannerErrorCopy(failure, { taskTarget: true })}
          </p>
        )}
        <div className={cn("flex shrink-0 gap-2", !many && "pt-0.5")}>
          <Button
            variant="secondary"
            disabled={pending || uncertain}
            className="h-13 flex-1 rounded-lg px-1.5 text-[15px] leading-5.5 font-bold"
            onClick={() => submit([])}
          >
            {t("carryover.leave")}
          </Button>
          <Button
            disabled={pending || (selected.size === 0 && !uncertain)}
            className="h-13 flex-[1.3] rounded-lg px-1.5 text-[15px] leading-5.5 font-bold shadow-sb-cta"
            onClick={() => submit([...selected])}
          >
            {uncertain ? t("common:actions.retry") : t("carryover.bring", { count: selected.size })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
