import { Check, Plus, Repeat2 } from "lucide-react";
import { useEffect, useLayoutEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { PlannerTask } from "@focusmakers/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { subjectColorVar } from "@/features/records/recordsTimetable";
import { formatDuration } from "@/features/records/recordsFormat";
import {
  subjectIdUnderPoint,
  useSubjectReorder,
} from "@/features/study-session/subjectInteractions";
import { cn } from "@/lib/utils";
import { showToast } from "@/lib/toast";
import { useHoldAndDrag } from "./usePlannerSubjectDrag";
import type { PlannerPlanSubject } from "./plannerPlanModel";
import type { PlannerMode } from "./plannerPermissions";

export interface PlanSubjectActions {
  addSubject: () => void;
  addTask: (subjectId: number) => void;
  task: (task: PlannerTask) => void;
  toggle: (task: PlannerTask) => void;
  rename: (subject: PlannerPlanSubject) => void;
  remove: (subject: PlannerPlanSubject) => void;
  delete: (subject: PlannerPlanSubject) => void;
  reorder: (ids: number[]) => Promise<void>;
}

export function PlannerPlanSubjects({
  subjects,
  mode,
  actions,
  pending,
}: {
  subjects: readonly PlannerPlanSubject[];
  mode: PlannerMode;
  actions: PlanSubjectActions;
  pending: boolean;
}) {
  const { t } = useTranslation(["planner", "study-session", "common"]);
  const [order, setOrder] = useState<number[] | null>(null);
  const [saving, setSaving] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const orderRef = useRef<number[] | null>(null);
  const initialOrder = useRef<number[]>([]);
  const cancelled = useRef(false);
  const validDrop = useRef(true);
  const previousTops = useRef<Map<HTMLElement, number> | null>(null);
  const animations = useRef<Animation[]>([]);
  function measurePositions() {
    previousTops.current = new Map(
      Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-subject-id]") ?? []).map(
        (element) => [element, element.getBoundingClientRect().top],
      ),
    );
  }
  useLayoutEffect(() => {
    const before = previousTops.current;
    previousTops.current = null;
    animations.current.forEach((animation) => animation.cancel());
    animations.current = [];
    if (!before || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const [element, top] of before) {
      const delta = top - element.getBoundingClientRect().top;
      if (delta && element.animate) {
        animations.current.push(
          element.animate(
            [{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }],
            { duration: 150, easing: "ease-out" },
          ),
        );
      }
    }
  }, [order]);
  useEffect(() => () => animations.current.forEach((animation) => animation.cancel()), []);
  const reorder = useSubjectReorder({
    startReorder() {
      cancelled.current = false;
      validDrop.current = true;
      orderRef.current = subjects.map((subject) => subject.id);
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
      measurePositions();
      orderRef.current = next;
      setOrder(next);
    },
    async commitReorder() {
      const ids = orderRef.current;
      orderRef.current = null;
      try {
        if (!cancelled.current && ids?.some((id, index) => id !== initialOrder.current[index])) {
          setSaving(true);
          await actions.reorder(ids);
        }
      } catch {
        showToast(t("common:errors.retryLater"));
      } finally {
        measurePositions();
        setOrder(null);
        setSaving(false);
      }
    },
  });
  return (
    <div
      ref={listRef}
      data-planner-subject-list=""
      className={cn("flex min-w-0 flex-1 flex-col", subjects.length >= 20 ? "gap-2.5" : "gap-3")}
    >
      {subjects.map((subject, index) => (
        <PlanSubject
          key={subject.id}
          subject={subject}
          mode={mode}
          actions={actions}
          pending={pending || saving}
          order={order?.indexOf(subject.id) ?? index}
          lifted={reorder.reorderingId === subject.id}
          onDragStart={() => reorder.start(subject.id)}
          onDragMove={(x, y) => {
            validDrop.current =
              document.elementFromPoint(x, y)?.closest("[data-planner-subject-list]") ===
              listRef.current;
            const over = subjectIdUnderPoint(x, y, subject.id);
            const current = orderRef.current;
            if (over === null || !current) {
              reorder.over(subject.id, null);
              return;
            }
            const target = listRef.current?.querySelector<HTMLElement>(
              `[data-subject-id="${over}"]`,
            );
            if (!target) return;
            const rect = target.getBoundingClientRect();
            const from = current.indexOf(subject.id),
              to = current.indexOf(over);
            if (
              (from < to && y < rect.top + rect.height / 2) ||
              (from > to && y > rect.top + rect.height / 2)
            )
              return;
            // 같은 상대 과목이라도 반대쪽 가운데를 다시 넘으면 원래 자리로 돌아갈 수 있다.
            reorder.over(subject.id, null);
            reorder.over(subject.id, over);
          }}
          onDragEnd={() => {
            if (!validDrop.current) cancelled.current = true;
            reorder.end();
          }}
          onDragCancel={() => {
            cancelled.current = true;
            reorder.end();
          }}
        />
      ))}
      {mode !== "past" && (
        <Button
          variant="unstyled"
          onClick={actions.addSubject}
          disabled={pending || saving}
          style={{ order: subjects.length }}
          className="relative h-8.5 min-h-0 w-full justify-start gap-1.5 rounded-[10px] border-[1.5px] border-dashed border-border-strong px-3 text-[13px] font-semibold text-muted-foreground before:absolute before:inset-x-0 before:-inset-y-1.5"
        >
          <Plus aria-hidden size={14} />
          {t("subjectSheet.title")}
        </Button>
      )}
    </div>
  );
}

function PlanSubject({
  subject,
  mode,
  actions,
  pending,
  order,
  lifted,
  previewOnly = false,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
}: {
  subject: PlannerPlanSubject;
  mode: PlannerMode;
  actions: PlanSubjectActions;
  pending: boolean;
  order?: number;
  lifted: boolean;
  previewOnly?: boolean;
  onDragStart: () => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: () => void;
  onDragCancel: () => void;
}) {
  const { t } = useTranslation("planner");
  const [menu, setMenu] = useState(false);
  const [gesture, setGesture] = useState(false);
  const [preview, setPreview] = useState<{ rect: DOMRect; dx: number; dy: number } | null>(null);
  const pointer = useRef<{ id: number; x: number; y: number; rect: DOMRect } | null>(null);
  const cancelled = useRef(false);
  const cancelRef = useRef(onDragCancel);
  const heldClick = useRef(false);
  useEffect(() => {
    cancelRef.current = onDragCancel;
  });
  const color = subjectColorVar(subject.colorIndex);
  const canManage = mode !== "past" && !subject.deleted && !pending;
  const { elementRef, handlers } = useHoldAndDrag({
    onLongPress: () => {
      if (canManage) {
        heldClick.current = true;
        setMenu(true);
        // 길게 잡은 뒤에는 바깥 날짜 넘기기의 시작점도 끝낸다.
        elementRef.current?.parentElement?.dispatchEvent(
          new Event("pointercancel", { bubbles: true }),
        );
      }
    },
    onDragStart: () => {
      if (canManage && pointer.current) {
        setMenu(false);
        setPreview({ rect: pointer.current.rect, dx: 0, dy: 0 });
        onDragStart();
      }
    },
    onDragMove: (x, y) => {
      const start = pointer.current;
      if (canManage && start && !cancelled.current) {
        setPreview({ rect: start.rect, dx: x - start.x, dy: y - start.y });
        onDragMove(x, y);
      }
    },
    onDragEnd: () => (cancelled.current ? onDragCancel() : onDragEnd()),
  });
  useEffect(() => {
    if (!gesture) return;
    const element = elementRef.current;
    function cancel() {
      if (pointer.current)
        element?.dispatchEvent(
          new PointerEvent("pointercancel", {
            bubbles: true,
            pointerId: pointer.current.id,
          }),
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
  }, [elementRef, gesture]);
  function finish() {
    const current = pointer.current;
    pointer.current = null;
    setPreview(null);
    setGesture(false);
    if (current && elementRef.current?.hasPointerCapture?.(current.id)) {
      elementRef.current.releasePointerCapture(current.id);
    }
  }
  return (
    <>
      <div
        data-subject-id={previewOnly ? undefined : subject.id}
        style={{ order }}
        className={cn("relative flex min-w-0 flex-col gap-1", lifted && "opacity-35")}
        ref={elementRef}
        {...handlers}
        onClickCapture={(event) => {
          if (
            heldClick.current &&
            event.detail !== 0 &&
            event.target instanceof Element &&
            event.currentTarget.contains(event.target)
          ) {
            heldClick.current = false;
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onPointerDown={(event) => {
          if (
            !(event.target instanceof Element) ||
            !event.currentTarget.contains(event.target) ||
            previewOnly ||
            !event.isPrimary ||
            (event.pointerType === "mouse" && event.button !== 0)
          )
            return;
          heldClick.current = false;
          if (!canManage) return;
          cancelled.current = false;
          pointer.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            rect: event.currentTarget.getBoundingClientRect(),
          };
          setGesture(true);
          handlers.onPointerDown(event);
        }}
        onPointerUp={(event) => {
          if (!pointer.current) return;
          handlers.onPointerUp(event);
          finish();
        }}
        onPointerCancel={(event) => {
          if (!pointer.current) return;
          cancelled.current = true;
          heldClick.current = true;
          setMenu(false);
          handlers.onPointerCancel(event);
          finish();
        }}
        onLostPointerCapture={(event) => {
          if (event.target !== event.currentTarget || !pointer.current) return;
          cancelled.current = true;
          heldClick.current = true;
          setMenu(false);
          handlers.onPointerCancel(event);
          finish();
        }}
      >
        <div>
          <DropdownMenu open={menu} onOpenChange={setMenu} modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={!canManage}
                onPointerDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  if (event.detail === 0 && canManage) setMenu(true);
                }}
                className={cn(
                  "relative flex h-auto min-h-5 w-full items-center gap-1.5 pl-0.5 text-left select-none before:absolute before:inset-x-0 before:-inset-y-3",
                  menu && "rounded-[10px] bg-primary/10",
                )}
              >
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-[2px]"
                  style={{ background: color }}
                />
                <span className="min-w-0 flex-1 text-[13px] leading-4.5 font-bold wrap-break-word">
                  {subject.name}
                </span>
                {(mode === "past" || (mode === "today" && subject.focusSec > 0)) && (
                  <span
                    className={cn(
                      "shrink-0 text-xs leading-4 font-bold tabular-nums",
                      mode === "past" && subject.focusSec === 0 && "text-text-tertiary",
                    )}
                  >
                    {formatDuration(Math.ceil(subject.focusSec / 60) * 60)}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            {canManage && !gesture && !lifted && !previewOnly && (
              <DropdownMenuContent
                align="start"
                alignOffset={14}
                className="theme-soft-blue w-42 rounded-[14px] border-0 p-1.5 shadow-[0_12px_16px_0_color-mix(in_srgb,var(--foreground)_18%,transparent)]"
                onCloseAutoFocus={(event) => event.preventDefault()}
              >
                <DropdownMenuItem
                  className="h-10 rounded-[10px] px-3 py-0 text-sm leading-4.5 font-medium"
                  onSelect={() => actions.rename(subject)}
                >
                  {t("rowMenu.rename")}
                </DropdownMenuItem>
                {subject.canRemove && (
                  <DropdownMenuItem
                    className="h-10 rounded-[10px] px-3 py-0 text-sm leading-4.5 font-medium"
                    onSelect={() => actions.remove(subject)}
                  >
                    {t("plan.removeSubject")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="h-10 rounded-[10px] px-3 py-0 text-sm leading-4.5 font-medium text-feedback-danger"
                  onSelect={() => actions.delete(subject)}
                >
                  {t("plan.deleteSubject")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            )}
          </DropdownMenu>
        </div>
        {subject.tasks.length > 0 && (
          <ul className="flex min-w-0 flex-col gap-1">
            {subject.tasks.map((task) => (
              <li
                key={task.key}
                className="relative flex min-h-8.5 items-start gap-2 rounded-l-[3px] rounded-r-[10px] border-l-3"
                style={{
                  borderColor: task.done ? "var(--border-strong)" : color,
                  background: task.done
                    ? "var(--bg-layer-2)"
                    : `color-mix(in srgb, ${color} 16%, var(--muted))`,
                }}
              >
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => actions.task(task)}
                  className={cn(
                    "relative min-h-8.5 min-w-0 flex-1 py-2 pl-2.25 text-left text-[13px] leading-4.5 font-semibold wrap-break-word break-keep whitespace-normal transition-opacity duration-150 before:absolute before:inset-x-0 before:-inset-y-1.25 active:opacity-80 motion-reduce:transition-none",
                    task.done && "font-medium text-muted-foreground line-through",
                  )}
                >
                  {task.seriesId !== null && (
                    <Repeat2 aria-label={t("plan.repeating")} size={12} className="mr-1 inline" />
                  )}
                  {task.name}
                </button>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={task.done}
                  aria-label={task.name}
                  disabled={pending}
                  onClick={() => actions.toggle(task)}
                  className={cn(
                    "relative mt-2 mr-2 flex size-4.5 shrink-0 items-center justify-center rounded-full transition-[background-color,border-color,opacity] duration-150 before:absolute before:-inset-3.25 active:opacity-80 motion-reduce:transition-none",
                    mode === "past" && subject.focusSec === 0 && !task.done && "opacity-50",
                  )}
                  style={{
                    border: task.done
                      ? "none"
                      : `1.5px solid color-mix(in srgb, ${color} 55%, var(--muted))`,
                    background: task.done
                      ? `color-mix(in srgb, ${color} 72%, var(--foreground))`
                      : "var(--muted)",
                  }}
                >
                  {task.done && (
                    <Check
                      aria-hidden
                      size={11}
                      strokeWidth={3.2}
                      className="text-primary-foreground"
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        {mode !== "past" && !subject.deleted && (
          <Button
            variant="unstyled"
            disabled={pending}
            onClick={() => actions.addTask(subject.id)}
            className="relative h-7 min-h-0 self-start justify-start gap-1.25 rounded-none pr-1.5 pl-3 text-xs leading-4 font-semibold text-muted-foreground before:absolute before:inset-x-0 before:-inset-y-2"
          >
            <Plus aria-hidden size={12} strokeWidth={2.4} />
            {t("plan.addTask")}
          </Button>
        )}
      </div>
      {preview &&
        createPortal(
          <div
            data-testid="planner-subject-drag-preview"
            aria-hidden="true"
            inert
            className="theme-soft-blue pointer-events-none fixed z-[80] transition-none"
            style={{
              left: preview.rect.left,
              top: preview.rect.top,
              width: preview.rect.width,
              transform: `translate3d(${preview.dx}px, ${preview.dy}px, 0)`,
            }}
          >
            <div className="-translate-y-1 rounded-[10px] bg-muted shadow-lg motion-reduce:translate-y-0">
              <PlanSubject
                subject={subject}
                mode={mode}
                actions={actions}
                pending={pending}
                lifted={false}
                previewOnly
                onDragStart={() => {}}
                onDragMove={() => {}}
                onDragEnd={() => {}}
                onDragCancel={() => {}}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
