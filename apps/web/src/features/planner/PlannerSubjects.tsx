import { Check, Plus } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { formatDuration } from "@/features/records/recordsFormat";
import { subjectColorVar } from "@/features/records/recordsTimetable";
import { SUBJECT_SHEET_COPY, SUBJECT_SUGGESTIONS } from "@/features/study-session/sessionCopy";
import {
  LONG_PRESS_MS,
  MAX_SUBJECTS,
  MAX_TASKS,
  subjectIdUnderPoint,
  SWIPE_REMOVE_PX,
  SWIPE_SLOP_PX,
  useInlineNameEdit,
  usePressGestures,
  useSubjectReorder,
} from "@/features/study-session/subjectInteractions";
import type { SubjectsStore } from "@/features/study-session/useSubjects";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

import type { PlannerSubjectItem, PlannerTaskItem } from "./subjectItems";

type Editing =
  | { kind: "new-subject" }
  | { kind: "new-task"; subjectId: number }
  | { kind: "rename-subject"; subjectId: number }
  | { kind: "rename-task"; subjectId: number; taskId: number };

/** 길게 누르기 메뉴가 붙은 행 — `taskId`가 null이면 과목 머리다. */
interface Menu {
  subjectId: number;
  taskId: number | null;
}

/**
 * 플래너 왼쪽 열 — 과목마다 색·이름·그날 순공시간, 그 아래 할 일.
 *
 * 그날 완료한 할 일은 체크된 채 과목 아래에 보인다. 과목을 고르지 않고 공부한 순공은 목록 맨 아래에
 * `과목 없음` 행으로 따로 보인다(과목이 하나도 없으면 그 행이 맨 위다).
 *
 * `store`가 있으면(오늘 플래너) 세션 과목 시트와 같은 목록을 같은 방식으로 관리한다 — 할 일 탭=완료 토글,
 * 길게 누르기=`이름 변경 · 삭제` 메뉴, 할 일 왼쪽 스와이프=삭제, 과목을 길게 누른 채 끌기=순서 변경,
 * 추가·이름 변경은 그 자리의 입력 + `완료`. `store`가 없으면(지난 날) 보기 전용이다.
 */
export function PlannerSubjects({
  items,
  unassignedFocusSec,
  emptyMessage,
  store = null,
  onNotice,
  readOnly = false,
  onRetryLoad,
}: {
  items: readonly PlannerSubjectItem[];
  unassignedFocusSec: number;
  /** 보기 전용일 때 과목도 과목 없는 순공도 없으면 보여 줄 문구(여러 줄). */
  emptyMessage: readonly string[];
  /** 오늘 플래너의 과목 목록 — 있으면 관리할 수 있다. */
  store?: SubjectsStore | null;
  /** 개수 상한 같은 짧은 알림 — 호출부의 토스트. */
  onNotice?: (message: string) => void;
  /** 지난 날 플래너 — 볼 수만 있다는 안내를 붙인다. */
  readOnly?: boolean;
  /** 과목 목록 조회가 실패했을 때의 재시도 — 있으면 재시도 줄을 보여 준다. */
  onRetryLoad?: () => void;
}) {
  const hasUnassigned = unassignedFocusSec > 0;
  const unassigned = hasUnassigned && <UnassignedRow focusSec={unassignedFocusSec} />;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      {store !== null ? (
        <ManagedSubjects
          items={items}
          store={store}
          onNotice={onNotice ?? noop}
          unassigned={unassigned}
        />
      ) : (
        <>
          {items.length === 0 && !hasUnassigned && (
            <p className="pt-1 text-[13px] leading-[19px] text-muted-foreground">
              {emptyMessage.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </p>
          )}
          {items.map((item) => (
            <StaticSubject key={itemKey(item)} item={item} />
          ))}
          {unassigned}
          {onRetryLoad !== undefined && (
            <p className="text-xs leading-4 text-muted-foreground">
              {SUBJECT_SHEET_COPY.loadFailed}{" "}
              <button type="button" onClick={onRetryLoad} className="font-bold text-primary">
                {SUBJECT_SHEET_COPY.retry}
              </button>
            </p>
          )}
          {readOnly && items.length > 0 && (
            <p className="text-[11px] leading-[14px] text-text-tertiary">
              지난 날의 할 일은 볼 수만 있어요
            </p>
          )}
        </>
      )}

      <div className="flex items-center gap-3 pt-0.5">
        <span className="flex items-center gap-[5px]">
          <span aria-hidden className="size-2.5 rounded-[3px] bg-chart-rest" />
          <span className="text-[11px] leading-[14px] text-muted-foreground">휴식</span>
        </span>
        {hasUnassigned && (
          <span className="flex items-center gap-[5px]">
            <span aria-hidden className="size-2.5 rounded-[3px] bg-primary" />
            <span className="text-[11px] leading-[14px] text-muted-foreground">과목 없음</span>
          </span>
        )}
      </div>
    </div>
  );
}

function noop() {}

function itemKey(item: PlannerSubjectItem) {
  return `${item.name}-${String(item.subjectId)}`;
}

function UnassignedRow({ focusSec }: { focusSec: number }) {
  return (
    <section className="flex flex-col gap-[3px]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden className="h-3.5 w-[3px] shrink-0 rounded-[2px] bg-primary" />
          <span className="truncate text-sm leading-[18px] font-bold text-foreground">
            과목 없음
          </span>
        </h2>
        <span className="shrink-0 text-[12.5px] leading-4 font-medium text-muted-foreground tabular-nums">
          {formatDuration(focusSec)}
        </span>
      </div>
      <p className="pl-[9px] text-[11px] leading-[14px] text-text-tertiary">
        세션에서 과목을 고르지 않은 시간이에요
      </p>
    </section>
  );
}

/** 과목 머리의 내용 — 색 막대 · 이름 · 그날 순공. 순서를 바꾸는 동안에는 앞에 핸들이 보인다. */
function SubjectHeadContent({ item, grip = false }: { item: PlannerSubjectItem; grip?: boolean }) {
  return (
    <>
      <h2 className={cn("flex min-w-0 items-center", grip ? "gap-2" : "gap-1.5")}>
        {grip && (
          <span aria-hidden className="grid shrink-0 grid-cols-2 gap-[3px]">
            {[0, 1, 2, 3, 4, 5].map((dot) => (
              <span key={dot} className="size-[3px] rounded-full bg-text-tertiary" />
            ))}
          </span>
        )}
        <span
          aria-hidden
          className="h-3.5 w-[3px] shrink-0 rounded-[2px]"
          style={{ background: subjectColorVar(item.colorIndex) }}
        />
        <span className="truncate text-sm leading-[18px] font-bold text-foreground">
          {item.name}
        </span>
      </h2>
      <span className="shrink-0 text-[12.5px] leading-4 font-medium text-muted-foreground tabular-nums">
        {formatDuration(item.focusSec)}
      </span>
    </>
  );
}

function TaskCheck({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-[18px] shrink-0 items-center justify-center rounded-full",
        done ? "bg-primary" : "border-[1.5px] border-text-tertiary",
      )}
    >
      {done && <Check size={11} strokeWidth={3} className="text-primary-foreground" />}
    </span>
  );
}

function taskNameClass(done: boolean) {
  return cn(
    "min-w-0 flex-1 text-[13px] leading-[17px]",
    done ? "text-text-tertiary" : "text-foreground",
  );
}

/** 보기 전용 할 일 줄 — 지난 날, 그리고 오늘이라도 목록에서 지워진 할 일. */
function StaticTask({ task }: { task: PlannerTaskItem }) {
  return (
    <li className="flex items-center gap-2 py-0.5 pl-[9px]">
      <span role="img" aria-label={task.done ? "완료" : "미완료"} className="flex shrink-0">
        <TaskCheck done={task.done} />
      </span>
      <span className={taskNameClass(task.done)}>{task.name}</span>
    </li>
  );
}

function StaticSubject({ item }: { item: PlannerSubjectItem }) {
  return (
    <section className="flex flex-col gap-[5px]">
      <div className="flex items-center justify-between gap-2">
        <SubjectHeadContent item={item} />
      </div>
      {item.tasks.length > 0 && (
        <ul className="flex flex-col gap-[5px]">
          {item.tasks.map((task) => (
            <StaticTask key={task.id} task={task} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** 이름 입력 + `완료` — 추가와 이름 변경이 같이 쓴다. 규칙은 과목 시트와 같다(`useInlineNameEdit`). */
function InlineEditor({
  initial,
  maxLength,
  placeholder,
  ariaLabel,
  bold = false,
  onCommit,
  onCancel,
}: {
  initial?: string;
  maxLength: number;
  placeholder: string;
  ariaLabel: string;
  /** 과목 이름은 굵게 쓴다. */
  bold?: boolean;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const { value, setValue, commit, handleKeyDown } = useInlineNameEdit({
    initial,
    onCommit,
    onCancel,
  });
  return (
    <div
      className="flex w-full items-center gap-1.5 pt-1 pb-0.5"
      // 입력 안에서의 드래그가 날짜 넘김 스와이프로 읽히지 않게 한다.
      onPointerDown={(event) => event.stopPropagation()}
    >
      <input
        // 사용자가 방금 누른 자리에 열리는 입력이라 autoFocus가 흐름을 끊지 않는다.
        autoFocus
        aria-label={ariaLabel}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        enterKeyHint="done"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        className={cn(
          "min-w-0 flex-1 rounded-[10px] border-[1.5px] border-primary bg-muted px-2.5 py-2 leading-[17px] text-foreground outline-none placeholder:text-text-tertiary",
          bold ? "text-sm font-bold" : "text-[13px]",
        )}
      />
      <button
        type="button"
        // blur보다 먼저 잡아 두 번 확정되지 않게 한다.
        onPointerDown={(event) => event.preventDefault()}
        onClick={commit}
        className="shrink-0 rounded-[10px] bg-primary px-2.5 py-2 text-xs leading-4 font-bold text-primary-foreground active:opacity-80"
      >
        {SUBJECT_SHEET_COPY.done}
      </button>
    </div>
  );
}

/** 길게 누르기 메뉴 — 누른 행 바로 아래에 뜬다. 바깥을 누르면 닫힌다. */
function RowMenu({
  onRename,
  onRemove,
  onDismiss,
}: {
  onRename: () => void;
  onRemove: () => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onPointerDown(event: globalThis.PointerEvent) {
      if (ref.current !== null && !ref.current.contains(event.target as Node)) {
        onDismiss();
      }
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [onDismiss]);
  return (
    <div
      ref={ref}
      role="menu"
      className="absolute top-full left-7 z-20 mt-1 flex w-[150px] flex-col overflow-hidden rounded-[12px] border border-border bg-muted py-1.5 shadow-[0_6px_20px_0_rgba(31,41,61,0.16)]"
    >
      <button
        type="button"
        role="menuitem"
        onClick={onRename}
        className="px-3.5 py-2.5 text-left text-sm leading-[18px] font-medium text-foreground active:bg-bg-layer-2"
      >
        이름 변경
      </button>
      <div aria-hidden className="h-px w-full bg-border" />
      <button
        type="button"
        role="menuitem"
        onClick={onRemove}
        className="px-3.5 py-2.5 text-left text-sm leading-[18px] font-medium text-feedback-danger active:bg-bg-layer-2"
      >
        삭제
      </button>
    </div>
  );
}

/**
 * 과목 머리의 길게 누르기와, 누른 채 끌기.
 *
 * 길게 누르면 메뉴가 뜨고(`onLongPress`), 손을 떼지 않고 움직이면 순서 끌기로 넘어간다(`onDragStart` →
 * `onDragMove` → `onDragEnd`). 길게 누르기 전의 움직임은 페이지 스크롤이라 취소한다.
 */
function useHoldAndDrag(handlers: {
  onLongPress: () => void;
  onDragStart: () => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: () => void;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [pressed, setPressed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef<{ x: number; y: number; held: boolean; dragging: boolean } | null>(null);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  function clearTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => {
    const element = elementRef.current;
    if (element === null) return;
    // 길게 누른 뒤의 끌기가 페이지 스크롤로 넘어가지 않게 한다. `touch-action`은 터치가 시작될 때
    // 정해져 중간에 바꿀 수 없어서, 길게 누르기가 발화한 뒤의 touchmove만 막는다.
    function blockScroll(event: TouchEvent) {
      if (stateRef.current?.held === true) {
        event.preventDefault();
      }
    }
    element.addEventListener("touchmove", blockScroll, { passive: false });
    return () => {
      element.removeEventListener("touchmove", blockScroll);
      clearTimer();
    };
  }, []);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    const element = event.currentTarget;
    const pointerId = event.pointerId;
    const state = { x: event.clientX, y: event.clientY, held: false, dragging: false };
    stateRef.current = state;
    clearTimer();
    setPressed(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      state.held = true;
      setPressed(false);
      try {
        element.setPointerCapture(pointerId);
      } catch {
        // 캡처를 못 잡아도 메뉴는 뜬다 — 끌기만 머리 밖에서 끊긴다.
      }
      haptic("medium");
      handlersRef.current.onLongPress();
    }, LONG_PRESS_MS);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const state = stateRef.current;
    if (state === null) return;
    const moved =
      Math.abs(event.clientX - state.x) >= SWIPE_SLOP_PX ||
      Math.abs(event.clientY - state.y) >= SWIPE_SLOP_PX;
    if (!state.held) {
      if (moved) {
        clearTimer();
        setPressed(false);
        stateRef.current = null;
      }
      return;
    }
    if (!state.dragging) {
      if (!moved) return;
      state.dragging = true;
      handlersRef.current.onDragStart();
    }
    handlersRef.current.onDragMove(event.clientX, event.clientY);
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    clearTimer();
    setPressed(false);
    const state = stateRef.current;
    stateRef.current = null;
    if (state?.dragging === true) {
      // 끌다 놓은 것이 날짜 넘김 스와이프로 읽히지 않게 한다.
      event.stopPropagation();
      handlersRef.current.onDragEnd();
    }
  }

  return {
    elementRef,
    pressed,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      // Android 길게 누르기 컨텍스트 메뉴 차단.
      onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
    },
  };
}

function ManagedTask({
  task,
  menuOpen,
  onToggle,
  onOpenMenu,
  onRemove,
  menu,
}: {
  task: PlannerTaskItem;
  menuOpen: boolean;
  onToggle: (done: boolean) => void;
  onOpenMenu: () => void;
  onRemove: () => void;
  menu: ReactNode;
}) {
  const { swipeX, pressed, handlers } = usePressGestures({
    onTap: () => onToggle(!task.done),
    onLongPress: onOpenMenu,
    onSwipeLeft: onRemove,
  });
  return (
    <li className={cn("relative", menuOpen && "z-20")}>
      <div className="relative overflow-hidden">
        {/* 스와이프로 드러나는 삭제 표시 — 임계의 절반쯤 밀면 다 진해진다(시안은 72px에서 불투명). */}
        <span
          aria-hidden
          style={{ opacity: Math.min(1, (-swipeX * 2) / SWIPE_REMOVE_PX) }}
          className="absolute inset-y-0 right-0 flex w-16 items-center justify-center rounded-[8px] bg-feedback-danger text-xs leading-4 font-bold text-white"
        >
          삭제
        </span>
        <div
          role="checkbox"
          tabIndex={0}
          aria-checked={task.done}
          aria-label={task.name}
          {...handlers}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onToggle(!task.done);
            }
          }}
          style={{ transform: `translateX(${String(swipeX)}px)` }}
          className={cn(
            "session-no-drag relative flex touch-pan-y items-center gap-2 py-0.5 pl-[9px] select-none",
            pressed && "opacity-60",
            // 밀리는 동안에만 바탕을 칠해 뒤의 삭제 표시를 가린다 — 평소에는 과목 강조색이 비쳐야 한다.
            swipeX === 0
              ? "transition-transform duration-200 ease-out motion-reduce:transition-none"
              : "bg-muted",
          )}
        >
          <TaskCheck done={task.done} />
          <span className={taskNameClass(task.done)}>{task.name}</span>
        </div>
      </div>
      {menu}
    </li>
  );
}

function ManagedSubject({
  item,
  store,
  editing,
  menu,
  reordering,
  lifted,
  onEditing,
  onMenu,
  onNotice,
  onReorderStart,
  onReorderOver,
  onReorderEnd,
}: {
  item: PlannerSubjectItem;
  store: SubjectsStore;
  editing: Editing | null;
  menu: Menu | null;
  /** 어느 과목이든 순서를 끄는 중인가 — 모든 과목에 핸들이 보인다. */
  reordering: boolean;
  /** 이 과목이 들려 있는가. */
  lifted: boolean;
  onEditing: (next: Editing | null) => void;
  onMenu: (next: Menu | null) => void;
  onNotice: (message: string) => void;
  onReorderStart: () => void;
  onReorderOver: (overId: number | null) => void;
  onReorderEnd: () => void;
}) {
  const subjectId = item.subjectId;
  const {
    elementRef,
    pressed,
    handlers: holdHandlers,
  } = useHoldAndDrag({
    onLongPress: () => onMenu({ subjectId, taskId: null }),
    onDragStart: () => {
      onMenu(null);
      onReorderStart();
    },
    onDragMove: (x, y) => onReorderOver(subjectIdUnderPoint(x, y, subjectId)),
    onDragEnd: onReorderEnd,
  });
  const menuHere = menu !== null && menu.subjectId === subjectId;
  const headMenuOpen = menuHere && menu.taskId === null;
  const renaming = editing?.kind === "rename-subject" && editing.subjectId === subjectId;
  const addingTask = editing?.kind === "new-task" && editing.subjectId === subjectId;
  const liveTaskCount = item.tasks.filter((task) => task.live).length;

  function rowMenu(taskId: number | null) {
    return (
      <RowMenu
        onRename={() => {
          onMenu(null);
          onEditing(
            taskId === null
              ? { kind: "rename-subject", subjectId }
              : { kind: "rename-task", subjectId, taskId },
          );
        }}
        onRemove={() => {
          onMenu(null);
          if (taskId === null) {
            void store.removeSubject(subjectId);
          } else {
            void store.removeTask(subjectId, taskId);
          }
        }}
        onDismiss={() => onMenu(null)}
      />
    );
  }

  return (
    <section
      data-subject-id={subjectId}
      className={cn(
        "relative flex flex-col gap-[5px] rounded-[4px]",
        // 바깥으로 8px 번지는 그림자로 칠해 자리를 밀지 않는다.
        headMenuOpen && "z-20 bg-bg-layer-2 shadow-[0_0_0_8px_var(--bg-layer-2)]",
        lifted &&
          "z-10 bg-muted shadow-[0_0_0_8px_var(--muted),0_0_0_9.5px_var(--primary),0_8px_20px_8px_rgba(31,41,61,0.18)]",
      )}
    >
      {renaming ? (
        <InlineEditor
          initial={item.name}
          maxLength={50}
          placeholder="과목 이름"
          ariaLabel="과목 이름"
          bold
          onCommit={(name) => {
            onEditing(null);
            void store.renameSubject(subjectId, name);
          }}
          onCancel={() => onEditing(null)}
        />
      ) : (
        <div className="relative">
          <div
            ref={elementRef}
            role="button"
            tabIndex={0}
            aria-haspopup="menu"
            aria-expanded={headMenuOpen}
            {...holdHandlers}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onMenu({ subjectId, taskId: null });
              }
            }}
            className={cn(
              "session-no-drag flex touch-pan-y items-center justify-between gap-2 select-none",
              pressed && "opacity-60",
            )}
          >
            <SubjectHeadContent item={item} grip={reordering} />
          </div>
          {headMenuOpen && rowMenu(null)}
        </div>
      )}

      {item.tasks.length > 0 && (
        <ul className="flex flex-col gap-[5px]">
          {item.tasks.map((task) => {
            if (!task.live) {
              return <StaticTask key={task.id} task={task} />;
            }
            if (editing?.kind === "rename-task" && editing.taskId === task.id) {
              return (
                <li key={task.id}>
                  <InlineEditor
                    initial={task.name}
                    maxLength={100}
                    placeholder="할 일 이름"
                    ariaLabel="할 일 이름"
                    onCommit={(name) => {
                      onEditing(null);
                      void store.renameTask(subjectId, task.id, name);
                    }}
                    onCancel={() => onEditing(null)}
                  />
                </li>
              );
            }
            const taskMenuOpen = menuHere && menu.taskId === task.id;
            return (
              <ManagedTask
                key={task.id}
                task={task}
                menuOpen={taskMenuOpen}
                onToggle={(done) => void store.toggleTask(subjectId, task.id, done)}
                onOpenMenu={() => onMenu({ subjectId, taskId: task.id })}
                onRemove={() => void store.removeTask(subjectId, task.id)}
                menu={taskMenuOpen ? rowMenu(task.id) : null}
              />
            );
          })}
        </ul>
      )}

      {addingTask ? (
        <InlineEditor
          maxLength={100}
          placeholder="할 일 이름"
          ariaLabel="새 할 일 이름"
          onCommit={(name) => {
            onEditing(null);
            void store.addTask(subjectId, name);
          }}
          onCancel={() => onEditing(null)}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            if (liveTaskCount >= MAX_TASKS) {
              onNotice(SUBJECT_SHEET_COPY.taskLimit);
              return;
            }
            onMenu(null);
            onEditing({ kind: "new-task", subjectId });
          }}
          className="flex w-full items-center gap-1.5 py-[3px] pl-[9px] text-xs leading-4 font-medium text-text-tertiary"
        >
          <Plus size={10} strokeWidth={2.5} aria-hidden />
          {SUBJECT_SHEET_COPY.addTask}
        </button>
      )}
    </section>
  );
}

function ManagedSubjects({
  items,
  store,
  onNotice,
  unassigned,
}: {
  items: readonly PlannerSubjectItem[];
  store: SubjectsStore;
  onNotice: (message: string) => void;
  unassigned: ReactNode;
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  /** 응답을 기다리는 추천 과목 — 반응이 없다고 한 번 더 누르면 같은 과목이 두 개 생긴다. */
  const [pendingPick, setPendingPick] = useState<string | null>(null);
  const reorder = useSubjectReorder(store);
  const empty = items.length === 0;

  const subjects = items.map((item) =>
    item.live ? (
      <ManagedSubject
        key={itemKey(item)}
        item={item}
        store={store}
        editing={editing}
        menu={menu}
        reordering={reorder.reorderingId !== null}
        lifted={reorder.reorderingId === item.subjectId}
        onEditing={setEditing}
        onMenu={setMenu}
        onNotice={onNotice}
        onReorderStart={() => reorder.start(item.subjectId)}
        onReorderOver={(overId) => reorder.over(item.subjectId, overId)}
        onReorderEnd={reorder.end}
      />
    ) : (
      // 오늘 공부했지만 지금은 지운 과목 — 기록에만 남아 관리할 수 없다.
      <StaticSubject key={itemKey(item)} item={item} />
    ),
  );

  return (
    <>
      {/* 과목이 하나도 없으면 과목 없이 공부한 행이 맨 위다. */}
      {empty ? unassigned : subjects}
      {!empty && unassigned}

      {empty && (
        <div className="flex flex-col gap-1 pt-1.5 pb-2">
          <p className="text-sm leading-[19px] font-bold text-foreground">아직 과목이 없어요</p>
          <p className="text-xs leading-4 text-muted-foreground">
            과목을 추가하면 할 일과 공부한 시간이 여기에 쌓여요
          </p>
          <div className="flex flex-col gap-1.5 pt-2.5">
            <p className="text-[11px] leading-[14px] text-text-tertiary">자주 쓰는 과목</p>
            <ul className="flex flex-wrap gap-1.5" aria-label="추천 과목">
              {SUBJECT_SUGGESTIONS.map((name) => (
                <li key={name}>
                  <button
                    type="button"
                    disabled={pendingPick !== null}
                    aria-busy={pendingPick === name}
                    onClick={() => {
                      setPendingPick(name);
                      void store.addSubject(name, true).then(() => setPendingPick(null));
                    }}
                    className={cn(
                      "rounded-full bg-bg-layer-2 px-2.5 py-[5px] text-xs leading-4 font-medium text-brand-subtle-text disabled:opacity-50",
                      pendingPick === name && "animate-pulse motion-reduce:animate-none",
                    )}
                  >
                    + {name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {editing?.kind === "new-subject" ? (
        <InlineEditor
          maxLength={50}
          placeholder="과목 이름"
          ariaLabel="새 과목 이름"
          bold
          onCommit={(name) => {
            setEditing(null);
            void store.addSubject(name);
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            if (store.subjects.length >= MAX_SUBJECTS) {
              onNotice(SUBJECT_SHEET_COPY.subjectLimit);
              return;
            }
            setMenu(null);
            setEditing({ kind: "new-subject" });
          }}
          className="flex w-full items-center justify-center gap-1.5 rounded-[10px] bg-bg-layer-2 py-[9px] text-[13px] leading-4 font-bold text-brand-subtle-text active:opacity-80"
        >
          <Plus size={10} strokeWidth={3} aria-hidden />
          {SUBJECT_SHEET_COPY.addSubject}
        </button>
      )}
    </>
  );
}
