import { ArrowUpDown } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import type { SubjectResponse, TaskResponse } from "@focusmakers/types";

import checkIcon from "@/assets/icons/sheet-check.svg";
import gripRowIcon from "@/assets/icons/sheet-grip-row.svg";
import pauseIcon from "@/assets/icons/sheet-pause.svg";
import playIcon from "@/assets/icons/sheet-play.svg";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/Skeleton";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

import { formatElapsed, toKoreanDuration } from "../formatDuration";
import { SUBJECT_SHEET_COPY, SUBJECT_SUGGESTIONS } from "../sessionCopy";
import {
  MAX_SUBJECTS,
  MAX_TASKS,
  subjectIdUnderPoint,
  SWIPE_REMOVE_PX,
  useInlineNameEdit,
  usePressGestures,
  useSubjectReorder,
} from "../subjectInteractions";
import type { SubjectSelection, SubjectTotals } from "../subjectSegments";
import { liveSubjectTime } from "../subjectSegments";
import type { SubjectsStore } from "../useSubjects";
import { SessionPageFooter } from "./SessionPage";

/**
 * 과목 페이지 본문
 *
 * 측정 단위는 과목이고 할 일은 체크리스트다.
 * 세로는 과목 카드를 한 열로 늘어놓고 카드마다 그 과목의 할 일을 보인다.
 * 가로는 왼쪽에 과목 줄을, 오른쪽에 보고 있는 과목의 할 일을 두는 두 열이다.
 * 측정 과목은 재생 버튼으로만 바뀌고, 재생은 과목을 고른 뒤 페이지를 닫으며 정지는 해제만 한다.
 * 과목 머리를 길게 누르면 수정·제거 메뉴가 뜬다.
 * 할 일 줄은 탭으로 완료를 바꾸고, 길게 누르면 메뉴가 뜨고, 왼쪽으로 96px 밀면 제거된다.
 * 이름 편집은 줄 자리의 인라인 입력과 `완료` 버튼으로 하고 별도 다이얼로그를 쓰지 않는다.
 * 빈 상태는 안내 문구와 추천 과목 줄이고, 추천 과목을 누르면 만든 뒤 바로 측정 과목으로 고른다.
 * 상한(과목 20·할 일 30)에 닿으면 버튼은 유지하고 토스트로 알린다.
 * 시간은 서버 누적(저장된 세션)에 이 세션 몫을 더한 값이다.
 * 순서 변경 모드에서만 핸들이 보이고, 핸들을 끌면 다른 과목 위를 지날 때마다 자리를 바꾼다.
 * 드래그 중 자리 바꿈은 화면에만 반영하고, 놓을 때 순서가 바뀌었으면 전체 순서를 서버에 한 번 저장한다(`PUT /api/subjects/order`).
 * 저장에 실패하면 토스트 뒤 서버 순서로 되돌린다.
 */

type Editing =
  | { kind: "new-subject" }
  | { kind: "new-task"; subjectId: number }
  | { kind: "rename-subject"; subjectId: number }
  | { kind: "rename-task"; subjectId: number; taskId: number };

/** 길게 누르기 메뉴의 대상과, 메뉴가 붙는 상자(`data-menu-anchor`) 윗변 기준 세로 위치(px). */
interface Menu {
  subjectId: number;
  taskId: number | null;
  top: number;
}

export interface SubjectPanelProps {
  store: SubjectsStore;
  /** 지금 시간이 쌓이는 과목 id. 없으면 null. */
  selection: SubjectSelection | null;
  onSelect: (next: SubjectSelection | null) => void;
  /** 재생 버튼으로 골랐을 때. 호출부가 필요하면 세션을 다시 시작하고 페이지를 닫는다. */
  onRequestClose: () => void;
  /** 세션이 일시정지인가 — 고른 과목도 멈춘 모양(재생 버튼)으로 보이고, 그 버튼이 세션을 다시 시작한다. */
  paused: boolean;
  /** 상한 안내 등 짧은 알림 — 호출부의 토스트. */
  onNotice: (message: string) => void;
  /** 이 세션에서 과목별로 쌓인 시간(`deriveSubjectTotals`의 결과). */
  liveTotals: ReadonlyMap<number, SubjectTotals>;
  /** 가로면 목록과 상세 두 열로 나눈다. */
  landscape: boolean;
  /** 페이지 아래 순공 타이머. */
  timer: ReactNode;
}

/** 이름 입력 + `완료`(원본 Editing). Enter·완료 확정, Escape 취소, 포커스 이탈은 내용이 있으면 확정. */
function InlineNameEditor({
  initial = "",
  maxLength,
  placeholder,
  ariaLabel,
  large = false,
  onCommit,
  onCancel,
}: {
  initial?: string;
  maxLength: number;
  placeholder: string;
  ariaLabel: string;
  /** 과목 이름은 17px 세미볼드, 할 일은 15px 미디엄. */
  large?: boolean;
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
      className={cn(
        "flex w-full items-center gap-2 pr-3",
        large ? "min-h-14 pl-3" : "min-h-12 pl-4",
      )}
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
          "h-10 min-w-0 flex-1 rounded-xl bg-white/8 px-3 text-white shadow-[inset_0_0_0_1px_var(--session-control-resume-bg)] outline-none placeholder:text-white/40",
          large ? "text-[17px] font-semibold" : "text-[15px] font-medium",
        )}
      />
      <Button
        variant="secondary"
        // blur보다 먼저 잡아 두 번 확정되지 않게 한다.
        onPointerDown={(event) => event.preventDefault()}
        onClick={commit}
        className="h-11 shrink-0 rounded-md px-3.5 text-[14px] font-semibold"
      >
        {SUBJECT_SHEET_COPY.done}
      </Button>
    </div>
  );
}

/**
 * 순서 이동 핸들 — 누르는 즉시 잡히고(포인터 캡처), 끌면서 지나는 카드의 자리로 옮긴다.
 * 행의 탭·길게 누르기와 겹치지 않게 포인터 이벤트를 행으로 올리지 않는다. 캡처 중에도
 * `elementFromPoint`는 손가락 아래 요소를 돌려주므로 그걸로 어느 카드 위인지 안다.
 */
function Grip({
  subjectId,
  label,
  onStart,
  onOver,
  onEnd,
}: {
  subjectId: number;
  label: string;
  onStart: () => void;
  onOver: (overId: number | null) => void;
  onEnd: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={-1}
      aria-label={label}
      onPointerDown={(event) => {
        if (!event.isPrimary) return;
        event.stopPropagation();
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // 캡처를 못 잡아도 같은 카드 안에서는 이동이 된다.
        }
        onStart();
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        onOver(subjectIdUnderPoint(event.clientX, event.clientY, subjectId));
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        onEnd();
      }}
      onPointerCancel={onEnd}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
      // 보이는 폭은 28px이지만 터치 영역은 가상 요소로 좌우 8px씩 넓혀 44px로 맞춘다.
      className="relative flex h-11 w-7 shrink-0 cursor-grab touch-none flex-col items-center justify-center gap-0.75 before:absolute before:inset-y-0 before:-inset-x-2 before:content-[''] active:cursor-grabbing"
    >
      {[0, 1, 2].map((row) => (
        <img key={row} src={gripRowIcon} alt="" className="h-1 w-2.75" />
      ))}
    </div>
  );
}

/** 길게 누르기 메뉴(원본 `role=menu`) — 카드 안 행 아래 우측 20에 뜬다. 바깥 포인터다운으로 닫힌다. */
function ContextMenu({
  top,
  onEdit,
  onRemove,
  onDismiss,
}: {
  top: number;
  onEdit: () => void;
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
      style={{ top }}
      className="absolute right-5 z-10 flex w-42 flex-col rounded-[14px] bg-(--session-dialog-cancel-bg) p-1.5 shadow-[0_12px_32px_0_rgba(0,0,0,0.45),inset_0_0_0_1px_rgba(255,255,255,0.08)]"
    >
      <button
        type="button"
        role="menuitem"
        onClick={onEdit}
        className="h-11 w-full rounded-[10px] px-3 text-left text-[15px] font-medium text-white active:bg-white/6"
      >
        {SUBJECT_SHEET_COPY.edit}
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={onRemove}
        className="h-11 w-full rounded-[10px] px-3 text-left text-[15px] font-medium text-(--session-exit-bg) active:bg-white/6"
      >
        {SUBJECT_SHEET_COPY.remove}
      </button>
    </div>
  );
}

/** `할 일 추가`와 동작 줄 버튼이 같이 쓰는 옅은 버튼 모양. */
const SOFT_BUTTON_CLASS =
  "flex h-11 items-center justify-center gap-1.5 rounded-md bg-(--session-sheet-surface) px-3.5 text-[14px] font-semibold text-white/70 active:bg-white/10";

function AddTaskButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn(SOFT_BUTTON_CLASS, "mt-1 w-full")}>
      <span aria-hidden="true" className="text-[18px] leading-4.5">
        +
      </span>
      {SUBJECT_SHEET_COPY.addTask}
    </button>
  );
}

function TaskRow({
  task,
  onToggle,
  onLongPress,
  onRemove,
}: {
  task: TaskResponse;
  onToggle: (done: boolean) => void;
  onLongPress: (element: HTMLElement) => void;
  onRemove: () => void;
}) {
  const done = task.doneAt !== null;
  const { swipeX, pressed, handlers } = usePressGestures({
    onTap: () => onToggle(!done),
    onLongPress,
    onSwipeLeft: onRemove,
  });
  const swiping = swipeX !== 0;
  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* 스와이프로 드러나는 빨간 제거 배경 — 임계에 가까워질수록 진해진다(원본 delOpacity). */}
      <div
        aria-hidden="true"
        style={{ opacity: Math.min(1, -swipeX / SWIPE_REMOVE_PX) }}
        className="absolute inset-0 flex items-center justify-end rounded-xl bg-(--session-exit-bg) pr-4.5 text-[14px] font-semibold text-white"
      >
        {SUBJECT_SHEET_COPY.remove}
      </div>
      <div
        role="checkbox"
        tabIndex={0}
        aria-checked={done}
        aria-label={task.name}
        {...handlers}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle(!done);
          }
        }}
        style={{ transform: `translateX(${swipeX}px)` }}
        className={cn(
          "relative flex min-h-12 w-full touch-pan-y items-center gap-1 rounded-xl pr-3 pl-2 select-none",
          pressed && "scale-[0.98] opacity-70",
          swiping
            ? "bg-[rgb(16,20,25)]"
            : "bg-transparent transition-transform duration-220 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
        )}
      >
        <span className="flex size-11 shrink-0 items-center justify-center">
          <span
            className={cn(
              "flex size-5.5 items-center justify-center rounded-full",
              // 파란색은 집중과 측정 중 표시에만 쓰므로 완료 체크는 중립 회색이다.
              done ? "bg-text-tertiary" : "shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.35)]",
            )}
          >
            {done && <img src={checkIcon} alt="" aria-hidden="true" className="size-3" />}
          </span>
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[15px] leading-5 font-medium",
            done ? "text-white/45 line-through" : "text-white/90",
          )}
        >
          {task.name}
        </span>
      </div>
    </div>
  );
}

/**
 * 과목 머리 줄
 *
 * 세로 카드의 머리이자 가로 목록의 한 줄이다.
 * 눌러도 측정 과목이 바뀌지 않는다.
 * 할 일을 관리하다 카드를 건드려도 측정 과목이 그대로 남아야 해서 측정 과목은 재생 버튼으로만 바꾼다.
 */
function SubjectRow({
  layout,
  viewing = false,
  subject,
  focusSec,
  selected,
  running,
  reorderMode,
  onTap,
  onLongPress,
  onPlay,
  onDeselect,
  onReorderStart,
  onReorderOver,
  onReorderEnd,
}: {
  /** `card`는 세로 카드 머리, `row`는 가로 목록 줄이다. */
  layout: "card" | "row";
  /** 가로 목록에서 이 과목의 할 일이 오른쪽에 보이는가. */
  viewing?: boolean;
  subject: SubjectResponse;
  focusSec: number;
  selected: boolean;
  /** 고른 과목의 시간이 지금 흐르는가 — 세션이 일시정지면 고른 과목도 멈춰 있다. */
  running: boolean;
  /** 순서 변경 모드에서만 핸들을 그리고 재생 버튼을 숨긴다. */
  reorderMode: boolean;
  /** 가로 목록 줄을 눌렀을 때. 세로 카드 머리는 눌러도 아무 일이 없다. */
  onTap?: () => void;
  onLongPress: (element: HTMLElement) => void;
  onPlay: () => void;
  onDeselect: () => void;
  onReorderStart: () => void;
  onReorderOver: (overId: number | null) => void;
  onReorderEnd: () => void;
}) {
  const { pressed, handlers } = usePressGestures({ onTap: () => onTap?.(), onLongPress });
  // 가로 줄은 보는 과목을 고르는 버튼이다. 재생 버튼과 겹치지 않게 이름·시간 영역에만 역할을 단다.
  const tappable = onTap !== undefined && !reorderMode;
  return (
    <div
      // 순서 변경 모드에서는 핸들 끌기와 같은 손가락 동작이라 길게 누르기 메뉴를 받지 않는다.
      {...(reorderMode ? {} : handlers)}
      className={cn(
        "flex w-full touch-pan-y items-center rounded-[14px] text-left transition-[scale,opacity] duration-150 select-none motion-reduce:transition-none",
        layout === "card"
          ? cn("min-h-14 gap-3 pr-3", reorderMode ? "pl-1" : "pl-3")
          : cn(
              "h-14 gap-2.5 px-3.5",
              viewing ? "bg-white/12" : !selected && "bg-(--session-sheet-surface)",
              selected
                ? "shadow-[inset_0_0_0_1px_var(--session-sheet-selected-ring)]"
                : viewing && "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]",
            ),
        pressed && "scale-[0.98] opacity-70",
        selected ? "text-(--state-focus)" : "text-white",
      )}
    >
      {reorderMode && (
        <Grip
          subjectId={subject.id}
          label={`${subject.name} 순서 이동`}
          onStart={onReorderStart}
          onOver={onReorderOver}
          onEnd={onReorderEnd}
        />
      )}
      <span
        className="flex min-w-0 flex-1 flex-col gap-0.5"
        {...(tappable && {
          role: "button",
          tabIndex: 0,
          "aria-current": viewing ? "true" : undefined,
          onKeyDown: (event: KeyboardEvent<HTMLSpanElement>) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onTap();
            }
          },
        })}
      >
        <span
          className={cn(
            "truncate font-semibold",
            layout === "card" ? "text-[17px] leading-5.5" : "text-[15px] leading-4.75",
          )}
        >
          {subject.name}
        </span>
        <span
          className={cn(
            "font-bold tabular-nums",
            layout === "card" ? "text-[15px] leading-4.5" : "text-[13px] leading-4",
            !selected && "text-white/55",
          )}
        >
          <span aria-hidden="true">{formatElapsed(focusSec)}</span>
          <span className="sr-only">{`순공 ${toKoreanDuration(focusSec)}`}</span>
        </span>
      </span>
      {/* 재생/정지(원본 Play Button): 히트 44 · 원 36.
          재생은 고르고 페이지를 닫고, 정지는 해제만 한다. */}
      {!reorderMode && (
        <button
          type="button"
          aria-label={running ? `${subject.name} 측정 멈추기` : `${subject.name} 측정 시작`}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            if (running) {
              onDeselect();
            } else {
              onPlay();
            }
          }}
          className="flex size-11 shrink-0 items-center justify-center active:scale-[0.92]"
        >
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-full transition-colors duration-200 motion-reduce:transition-none",
              running ? "bg-primary" : "bg-white/12",
            )}
          >
            <img
              key={running ? "pause" : "play"}
              src={running ? pauseIcon : playIcon}
              alt=""
              aria-hidden="true"
              className={cn(
                "animate-[control-icon-pop_220ms_ease-out] motion-reduce:animate-none",
                running ? "h-3.75 w-[13.3px]" : "size-3.75",
              )}
            />
          </span>
        </button>
      )}
    </div>
  );
}

/**
 * 과목의 할 일 묶음
 *
 * 완료율 바, 할 일 줄, `할 일 추가`를 그린다.
 * 세로 카드 본문과 가로 상세 열이 같이 쓴다.
 */
function SubjectTasks({
  subject,
  editing,
  onEditing,
  onNotice,
  onTaskLongPress,
  store,
  scrollable = false,
}: {
  subject: SubjectResponse;
  editing: Editing | null;
  onEditing: (next: Editing | null) => void;
  onNotice: (message: string) => void;
  onTaskLongPress: (element: HTMLElement, taskId: number) => void;
  store: SubjectsStore;
  /** 가로 상세 열은 높이가 정해져 있어 할 일 목록만 스크롤한다. */
  scrollable?: boolean;
}) {
  const doneCount = subject.tasks.filter((task) => task.doneAt !== null).length;
  const addingTask = editing?.kind === "new-task" && editing.subjectId === subject.id;

  function startAddTask() {
    if (subject.tasks.length >= MAX_TASKS) {
      onNotice(SUBJECT_SHEET_COPY.taskLimit);
      return;
    }
    onEditing({ kind: "new-task", subjectId: subject.id });
  }

  const taskList = subject.tasks.length > 0 && (
    <ul className="flex flex-col gap-0.5">
      {subject.tasks.map((task, index) => (
        <li key={task.id} className="flex flex-col gap-0.5">
          {/* 구분선은 할 일 사이에만 둔다 — 첫 할 일 위는 완료율 바가 이미 선 역할을 해서 두 줄로 겹쳐 보인다. */}
          {index > 0 && (
            <div aria-hidden="true" className="py-0.5 pr-3 pl-13">
              <div className="h-px w-full bg-white/8" />
            </div>
          )}
          {editing?.kind === "rename-task" && editing.taskId === task.id ? (
            <InlineNameEditor
              initial={task.name}
              maxLength={100}
              placeholder={SUBJECT_SHEET_COPY.addTask}
              ariaLabel="할 일 이름"
              onCommit={(name) => {
                onEditing(null);
                void store.renameTask(subject.id, task.id, name);
              }}
              onCancel={() => onEditing(null)}
            />
          ) : (
            <TaskRow
              task={task}
              onToggle={(done) => {
                if (done) {
                  haptic("light");
                }
                void store.toggleTask(subject.id, task.id, done);
              }}
              onLongPress={(element) => onTaskLongPress(element, task.id)}
              onRemove={() => void store.removeTask(subject.id, task.id)}
            />
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <>
      {subject.tasks.length > 0 && (
        <div className="px-3 pb-1.5">
          <div
            role="progressbar"
            aria-label="할 일 완료율"
            aria-valuemin={0}
            aria-valuemax={subject.tasks.length}
            aria-valuenow={doneCount}
            className="h-0.75 w-full overflow-hidden rounded-full bg-white/8"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-250 motion-reduce:transition-none"
              style={{ width: `${(doneCount / subject.tasks.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {scrollable ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-none">
          {taskList}
        </div>
      ) : (
        taskList
      )}

      {addingTask ? (
        <InlineNameEditor
          maxLength={100}
          placeholder="할 일 이름"
          ariaLabel="새 할 일 이름"
          onCommit={(name) => {
            onEditing(null);
            void store.addTask(subject.id, name);
          }}
          onCancel={() => onEditing(null)}
        />
      ) : (
        <AddTaskButton onClick={startAddTask} />
      )}
    </>
  );
}

function EmptyState({
  pending,
  onPick,
}: {
  /** 만드는 중인 추천 과목 — 응답이 올 때까지 그 행을 강조하고 나머지는 잠근다. */
  pending: string | null;
  onPick: (name: string) => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex flex-col items-center gap-1.5 px-2 pt-9 pb-5 text-center">
        <p className="text-[17px] leading-5.5 font-semibold text-white">
          {SUBJECT_SHEET_COPY.empty}
        </p>
        <p className="text-[13px] leading-4 text-white/50">{SUBJECT_SHEET_COPY.emptySub}</p>
      </div>
      <ul className="flex flex-col gap-1.5 px-2 py-1" aria-label="추천 과목">
        {SUBJECT_SUGGESTIONS.map((name) => (
          <li key={name}>
            <button
              type="button"
              disabled={pending !== null}
              aria-busy={pending === name}
              onClick={() => onPick(name)}
              className={cn(
                "flex h-13 w-full items-center rounded-[14px] pr-2 pl-4 text-left shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)] active:bg-white/12",
                pending === name
                  ? "animate-pulse bg-white/12 motion-reduce:animate-none"
                  : "bg-(--session-sheet-surface) disabled:opacity-50",
              )}
            >
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-white">
                {name}
              </span>
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center text-[20px] leading-5 text-(--state-focus)"
              >
                +
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SubjectPanel({
  store,
  selection,
  onSelect,
  onRequestClose,
  paused,
  onNotice,
  liveTotals,
  landscape,
  timer,
}: SubjectPanelProps) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  /** 가로에서 사용자가 고른 보는 과목. 고르지 않았거나 그 과목이 사라지면 측정 과목, 그다음 첫 과목을 본다. */
  const [viewedId, setViewedId] = useState<number | null>(null);
  const reorder = useSubjectReorder(store);
  /**
   * 응답을 기다리는 추천 과목. 추가는 서버 id를 받아야 목록에 넣을 수 있어 그 사이 화면이 그대로인데,
   * 반응이 없다고 한 번 더 누르면 같은 과목이 두 개 생긴다.
   */
  const [pendingPick, setPendingPick] = useState<string | null>(null);
  const { subjects, status } = store;
  const empty = status === "ready" && subjects.length === 0;
  // 바꿀 과목이 없으면 모드에 남아 있을 이유가 없다.
  if (reorderMode && subjects.length === 0) {
    setReorderMode(false);
  }
  /** 가로 상세 열에 보이는 과목. */
  const viewed =
    subjects.find((subject) => subject.id === viewedId) ??
    subjects.find((subject) => subject.id === selection) ??
    subjects[0] ??
    null;
  const viewedFocusSec =
    viewed === null ? 0 : viewed.focusSec + liveSubjectTime(liveTotals, viewed.id).focusSec;

  function startAddSubject() {
    if (subjects.length >= MAX_SUBJECTS) {
      onNotice(SUBJECT_SHEET_COPY.subjectLimit);
      return;
    }
    setMenu(null);
    setEditing({ kind: "new-subject" });
  }

  function startReorderMode() {
    setMenu(null);
    setEditing(null);
    setReorderMode(true);
  }

  /** 메뉴는 누른 줄 바로 아래(+4)에 뜬다. 메뉴가 붙는 상자 윗변 기준 좌표로 바꿔 둔다. */
  function openMenu(element: HTMLElement, subjectId: number, taskId: number | null) {
    const anchor = element.closest<HTMLElement>("[data-menu-anchor]");
    const top =
      anchor === null
        ? 64
        : element.getBoundingClientRect().bottom - anchor.getBoundingClientRect().top + 4;
    setMenu({ subjectId, taskId, top });
  }

  function subjectHead(subject: SubjectResponse, layout: "card" | "row") {
    if (editing?.kind === "rename-subject" && editing.subjectId === subject.id) {
      return (
        <InlineNameEditor
          initial={subject.name}
          maxLength={50}
          placeholder={SUBJECT_SHEET_COPY.addSubject}
          ariaLabel="과목 이름"
          large
          onCommit={(name) => {
            setEditing(null);
            void store.renameSubject(subject.id, name);
          }}
          onCancel={() => setEditing(null)}
        />
      );
    }
    const selected = selection === subject.id;
    return (
      <SubjectRow
        layout={layout}
        viewing={viewed?.id === subject.id}
        subject={subject}
        focusSec={subject.focusSec + liveSubjectTime(liveTotals, subject.id).focusSec}
        selected={selected}
        running={selected && !paused}
        reorderMode={reorderMode}
        onTap={layout === "row" ? () => setViewedId(subject.id) : undefined}
        onLongPress={(element) => openMenu(element, subject.id, null)}
        onPlay={() => {
          haptic("medium");
          onSelect(subject.id);
          onRequestClose();
        }}
        onDeselect={() => onSelect(null)}
        onReorderStart={() => {
          setMenu(null);
          reorder.start(subject.id);
        }}
        onReorderOver={(overId) => reorder.over(subject.id, overId)}
        onReorderEnd={reorder.end}
      />
    );
  }

  function subjectMenu(subject: SubjectResponse, current: Menu) {
    return (
      <ContextMenu
        top={current.top}
        onEdit={() => {
          setMenu(null);
          setEditing(
            current.taskId === null
              ? { kind: "rename-subject", subjectId: subject.id }
              : { kind: "rename-task", subjectId: subject.id, taskId: current.taskId },
          );
        }}
        onRemove={() => {
          setMenu(null);
          if (current.taskId === null) {
            if (selection === subject.id) {
              onSelect(null);
            }
            void store.removeSubject(subject.id);
          } else {
            void store.removeTask(subject.id, current.taskId);
          }
        }}
        onDismiss={() => setMenu(null)}
      />
    );
  }

  function subjectTasks(subject: SubjectResponse, scrollable = false) {
    return (
      <SubjectTasks
        scrollable={scrollable}
        subject={subject}
        editing={editing}
        onEditing={setEditing}
        onNotice={onNotice}
        onTaskLongPress={(element, taskId) => openMenu(element, subject.id, taskId)}
        store={store}
      />
    );
  }

  const newSubjectEditor = editing?.kind === "new-subject" && (
    <div className="rounded-[18px] bg-(--session-sheet-surface) p-1.5 shadow-[inset_0_0_0_1px_var(--session-sheet-line)]">
      <InlineNameEditor
        maxLength={50}
        placeholder="과목 이름"
        ariaLabel="새 과목 이름"
        large
        onCommit={(name) => {
          setEditing(null);
          void store.addSubject(name);
        }}
        onCancel={() => setEditing(null)}
      />
    </div>
  );

  let body: ReactNode;
  if (status === "loading" || status === "idle") {
    body = (
      <div className="flex flex-col gap-3.5" aria-label={SUBJECT_SHEET_COPY.loading}>
        <Skeleton className="h-30 rounded-[18px] bg-white/6" />
        <Skeleton className="h-30 rounded-[18px] bg-white/6" />
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="flex flex-col items-center gap-3 px-3 pt-6 text-center">
        <p className="text-[14px] text-(--session-dialog-body)">{SUBJECT_SHEET_COPY.loadFailed}</p>
        <button
          type="button"
          onClick={() => void store.reload()}
          className="h-11 rounded-xl bg-(--session-dialog-cancel-bg) px-5 text-[14px] font-medium text-white active:opacity-80"
        >
          {SUBJECT_SHEET_COPY.retry}
        </button>
      </div>
    );
  } else if (empty) {
    body = (
      <>
        <EmptyState
          pending={pendingPick}
          onPick={(name) => {
            setPendingPick(name);
            void store.addSubject(name, true).then((created) => {
              setPendingPick(null);
              if (created !== null) {
                onSelect(created.id);
              }
            });
          }}
        />
        {newSubjectEditor}
      </>
    );
  } else {
    body = (
      <>
        <ul className="flex flex-col gap-3.5">
          {subjects.map((subject) => (
            <li
              key={subject.id}
              data-subject-id={subject.id}
              data-menu-anchor=""
              className={cn(
                "relative flex flex-col gap-0.5 rounded-[18px] p-1.5 transition-[box-shadow,background-color] duration-150 motion-reduce:transition-none",
                reorder.reorderingId === subject.id
                  ? "bg-white/10"
                  : "bg-(--session-sheet-surface)",
                selection === subject.id
                  ? "shadow-[inset_0_0_0_1px_var(--session-sheet-selected-card-ring)]"
                  : "shadow-[inset_0_0_0_1px_var(--session-sheet-line)]",
              )}
            >
              {subjectHead(subject, "card")}
              {menu?.subjectId === subject.id && subjectMenu(subject, menu)}
              {!reorderMode && subjectTasks(subject)}
            </li>
          ))}
        </ul>
        {newSubjectEditor && <div className="mt-3.5">{newSubjectEditor}</div>}
      </>
    );
  }

  const actions =
    status !== "ready" ? null : reorderMode ? (
      <Button
        variant="secondary"
        className="h-11 rounded-md px-3.5 text-[14px] font-semibold"
        onClick={() => setReorderMode(false)}
      >
        {SUBJECT_SHEET_COPY.done}
      </Button>
    ) : (
      <>
        {!empty && (
          <button type="button" onClick={startReorderMode} className={SOFT_BUTTON_CLASS}>
            <ArrowUpDown aria-hidden="true" className="size-4.5 opacity-70" strokeWidth={1.5} />
            {SUBJECT_SHEET_COPY.reorder}
          </button>
        )}
        <button type="button" onClick={startAddSubject} className={SOFT_BUTTON_CLASS}>
          <span aria-hidden="true" className="text-[18px] leading-4.5">
            +
          </span>
          {SUBJECT_SHEET_COPY.addSubject}
        </button>
      </>
    );

  // 목록을 받는 중이거나 과목이 없으면 오른쪽에 보일 할 일이 없어 가로여도 한 열로 둔다.
  if (landscape && status === "ready" && viewed !== null) {
    return (
      <div className="grid min-h-0 flex-1 grid-cols-[17.5rem_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 regular:grid-cols-[22.5rem_minmax(0,1fr)] regular:gap-x-6 short-side-lg:grid-cols-[26.25rem_minmax(0,1fr)] short-side-lg:gap-x-8">
        <div className="min-h-0 overflow-y-auto overscroll-contain scrollbar-none">
          <ul className="flex flex-col gap-1">
            {subjects.map((subject) => (
              <li
                key={subject.id}
                data-subject-id={subject.id}
                data-menu-anchor=""
                className="relative"
              >
                {subjectHead(subject, "row")}
                {menu?.subjectId === subject.id &&
                  menu.taskId === null &&
                  subjectMenu(subject, menu)}
              </li>
            ))}
          </ul>
          {newSubjectEditor && <div className="mt-1">{newSubjectEditor}</div>}
        </div>
        <section
          aria-label={`${viewed.name} 할 일`}
          data-menu-anchor=""
          inert={reorderMode}
          className={cn(
            "relative flex min-h-0 flex-col gap-0.5 rounded-[18px] bg-(--session-sheet-surface) p-1.5 shadow-[inset_0_0_0_1px_var(--session-sheet-line)] transition-opacity duration-200 motion-reduce:transition-none",
            reorderMode && "opacity-40",
          )}
        >
          <div className="flex h-12 shrink-0 items-center gap-2 px-3">
            <span className="truncate text-[17px] leading-5.5 font-semibold text-white">
              {viewed.name}
            </span>
            <span className="shrink-0 text-[13px] leading-4 font-bold text-white/55 tabular-nums">
              <span aria-hidden="true">{formatElapsed(viewedFocusSec)}</span>
              <span className="sr-only">{`순공 ${toKoreanDuration(viewedFocusSec)}`}</span>
            </span>
          </div>
          {menu?.subjectId === viewed.id && menu.taskId !== null && subjectMenu(viewed, menu)}
          {subjectTasks(viewed, true)}
        </section>
        <div className="flex items-end justify-end gap-2">{actions}</div>
        <SessionPageFooter landscape timer={timer} />
      </div>
    );
  }

  return (
    <>
      <div className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain px-3 pt-2 pb-4 scrollbar-none">
        {body}
      </div>
      {landscape ? (
        <SessionPageFooter
          landscape
          leading={actions !== null && <div className="flex gap-2">{actions}</div>}
          timer={timer}
        />
      ) : (
        <SessionPageFooter
          landscape={false}
          actions={
            actions !== null && (
              <div className="flex justify-end gap-2 px-3 pt-1 pb-2">{actions}</div>
            )
          }
          timer={timer}
        />
      )}
    </>
  );
}
