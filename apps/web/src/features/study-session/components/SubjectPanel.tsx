import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import type { SubjectResponse, SubjectTimePayload, TaskResponse } from "@focusmakers/types";

import checkIcon from "@/assets/icons/sheet-check.svg";
import gripRowIcon from "@/assets/icons/sheet-grip-row.svg";
import pauseIcon from "@/assets/icons/sheet-pause.svg";
import playIcon from "@/assets/icons/sheet-play.svg";
import { Skeleton } from "@/components/ui/Skeleton";
import { vibrate } from "@/lib/haptics";
import { cn } from "@/lib/utils";

import { formatElapsed, toKoreanDuration } from "../formatDuration";
import { SUBJECT_SHEET_COPY, SUBJECT_SUGGESTIONS } from "../sessionCopy";
import type { SubjectSelection } from "../subjectTimes";
import { liveSubjectTime } from "../subjectTimes";
import type { SubjectsStore } from "../useSubjects";

/**
 * 과목 시트 내용(S3-9 최종안) — 헤더 + **카드형 과목 목록**. 원본은 Claude Design
 * `Session Subject Sheet.dc.html`(listLayout=cards · rowLayout=play · chipsLayout=list)이다.
 * 측정 단위는 **과목**이고 할 일은 체크리스트다(시안 "과목 단위 측정").
 *
 * - 과목 카드: 순서 핸들 + 과목명/누적 순공(HH:MM:SS) + 재생 버튼 → 할 일 완료율 바 → 할 일 행
 *   (구분선) → `+ 할 일 추가`. 측정 중(Selected)은 blue/400 링·배경.
 * - 과목 행: 탭=측정 선택/해제 토글, 재생=선택하고 **시트를 내림**, 정지=해제, 길게 누르기=메뉴.
 * - 할 일 행: 탭=완료 토글, 길게 누르기=메뉴(수정·제거), 왼쪽 스와이프 96px=제거(빨간 배경).
 * - 이름 편집은 행 자리 인라인 입력 + `완료` 버튼. 별도 다이얼로그 없음.
 * - 빈 상태: 안내 문구 + 추천 과목 행(탭 한 번으로 생성 후 바로 측정 선택). 헤더 `+ 과목 추가`는 항상.
 * - 상한(과목 20·할 일 30)에 닿으면 버튼은 그대로 두고 토스트로 알린다(원본 동작).
 * - 시간 = 서버 누적(저장된 세션) + 이 세션 몫. 저장되면 서버 값이 흡수해 다음 세션에서 이어진다.
 *
 * 순서 핸들(원본 `gripDown`)은 **장식만** 그린다 — 서버 계약에 순서 필드가 없어 끌어서 바꿔도
 * 저장할 곳이 없다(원본 github.md도 "정렬용 sortOrder 필요"로 남겨 뒀다). 계약이 생기면 `Grip`에
 * 드래그를 붙인다.
 */

const MAX_SUBJECTS = 20;
const MAX_TASKS = 30;
const LONG_PRESS_MS = 480;
const SWIPE_SLOP_PX = 10;
/** 이만큼 왼쪽으로 밀고 놓으면 제거된다(원본 96). 최대 이동은 160. */
const SWIPE_REMOVE_PX = 96;
const SWIPE_MAX_PX = 160;

type Editing =
  | { kind: "new-subject" }
  | { kind: "new-task"; subjectId: number }
  | { kind: "rename-subject"; subjectId: number }
  | { kind: "rename-task"; subjectId: number; taskId: number };

/** 길게 누르기 메뉴 — 대상 행과, 카드 상단 기준 세로 위치(px). */
interface Menu {
  subjectId: number;
  taskId: number | null;
  top: number;
}

export interface SubjectPanelProps {
  /** 시트가 열려 있는가 — 접히면 편집·메뉴를 닫는다(원본 `closeSheet`). */
  open: boolean;
  store: SubjectsStore;
  selection: SubjectSelection | null;
  onSelect: (next: SubjectSelection | null) => void;
  /** 재생 버튼으로 골랐을 때 시트를 내린다. */
  onRequestClose: () => void;
  /** 상한 안내 등 짧은 알림 — 호출부의 토스트. */
  onNotice: (message: string) => void;
  /** 이 세션에서 항목별로 쌓인 시간(`useStudyRoomSession().subjectTimes`). */
  liveTimes: readonly SubjectTimePayload[];
}

/**
 * 탭 · 길게 누르기 · (선택) 왼쪽 스와이프를 한 요소에서 가른다(원본 `rowDown`/`taskMove`).
 *
 * 길게 누르기가 발화하거나 스와이프로 판정되면 뒤따르는 `click`은 삼킨다. 스와이프는 가로
 * 이동이 세로보다 크고 10px을 넘을 때만 시작한다 — 목록 세로 스크롤과 겹치지 않도록
 * 사용처가 `touch-action: pan-y`를 준다.
 */
function usePressGestures(handlers: {
  onTap: () => void;
  onLongPress: (element: HTMLElement) => void;
  onSwipeLeft?: () => void;
}) {
  const [swipeX, setSwipeX] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef<{ startX: number; startY: number; swiping: boolean } | null>(null);
  const consumedRef = useRef(false);

  function clearTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    const element = event.currentTarget;
    consumedRef.current = false;
    stateRef.current = { startX: event.clientX, startY: event.clientY, swiping: false };
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      consumedRef.current = true;
      stateRef.current = null;
      handlers.onLongPress(element);
    }, LONG_PRESS_MS);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const state = stateRef.current;
    if (state === null) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.swiping) {
      if (Math.abs(dx) < SWIPE_SLOP_PX && Math.abs(dy) < SWIPE_SLOP_PX) return;
      // 어느 쪽이든 움직였으면 길게 누르기는 아니다.
      clearTimer();
      if (handlers.onSwipeLeft === undefined || Math.abs(dx) <= Math.abs(dy)) {
        stateRef.current = null;
        return;
      }
      state.swiping = true;
      consumedRef.current = true;
    }
    setSwipeX(Math.max(-SWIPE_MAX_PX, Math.min(0, dx)));
  }

  function onPointerEnd() {
    clearTimer();
    const state = stateRef.current;
    stateRef.current = null;
    if (state?.swiping === true) {
      if (swipeX <= -SWIPE_REMOVE_PX) {
        vibrate(8);
        handlers.onSwipeLeft?.();
      }
      setSwipeX(0);
    }
  }

  function onClick() {
    if (consumedRef.current) {
      consumedRef.current = false;
      return;
    }
    handlers.onTap();
  }

  useEffect(() => clearTimer, []);

  return {
    swipeX,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onPointerLeave: onPointerEnd,
      onClick,
      // Android 길게 누르기 컨텍스트 메뉴 차단(iOS는 `.session-no-drag`의 touch-callout이 막는다).
      onContextMenu: (event: ReactMouseEvent<HTMLElement>) => event.preventDefault(),
    },
  };
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
  const [value, setValue] = useState(initial);
  const doneRef = useRef(false);
  function commit() {
    if (doneRef.current) return;
    doneRef.current = true;
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed === initial) {
      onCancel();
    } else {
      onCommit(trimmed);
    }
  }
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      commit();
    } else if (event.key === "Escape") {
      doneRef.current = true;
      onCancel();
    }
  }
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
          "h-10 min-w-0 flex-1 rounded-xl bg-white/8 px-3 text-white shadow-[inset_0_0_0_1px_var(--session-resume-bg)] outline-none placeholder:text-white/40",
          large ? "text-[17px] font-semibold" : "text-[15px] font-medium",
        )}
      />
      <button
        type="button"
        // blur보다 먼저 잡아 두 번 확정되지 않게 한다.
        onPointerDown={(event) => event.preventDefault()}
        onClick={commit}
        className="h-10 shrink-0 rounded-xl bg-[var(--session-resume-bg)] px-3.5 text-[14px] font-semibold text-white active:opacity-80"
      >
        {SUBJECT_SHEET_COPY.done}
      </button>
    </div>
  );
}

/** 순서 이동 핸들(장식) — 11×4 점 두 개짜리 자산을 세 줄 쌓는다. */
function Grip() {
  return (
    <div
      aria-hidden="true"
      className="flex h-11 w-7 shrink-0 flex-col items-center justify-center gap-[3px]"
    >
      {[0, 1, 2].map((row) => (
        <img key={row} src={gripRowIcon} alt="" className="h-1 w-[11px]" />
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
      className="absolute right-5 z-10 flex w-[168px] flex-col rounded-[14px] bg-[var(--session-dialog-cancel-bg)] p-1.5 shadow-[0_12px_32px_0_rgba(0,0,0,0.45),inset_0_0_0_1px_rgba(255,255,255,0.08)]"
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
        className="h-11 w-full rounded-[10px] px-3 text-left text-[15px] font-medium text-[var(--session-exit-bg)] active:bg-white/6"
      >
        {SUBJECT_SHEET_COPY.remove}
      </button>
    </div>
  );
}

function AddTaskButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--session-sheet-surface)] text-[14px] font-semibold text-white/70 active:bg-white/10"
    >
      <span aria-hidden="true" className="text-[18px] leading-[18px]">
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
  const { swipeX, handlers } = usePressGestures({
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
        className="absolute inset-0 flex items-center justify-end rounded-xl bg-[var(--session-exit-bg)] pr-[18px] text-[14px] font-semibold text-white"
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
          swiping
            ? "bg-[rgb(16,20,25)]"
            : "bg-transparent transition-transform duration-[220ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
        )}
      >
        <span className="flex size-11 shrink-0 items-center justify-center">
          <span
            className={cn(
              "flex size-[22px] items-center justify-center rounded-full",
              done
                ? "bg-[var(--session-resume-bg)]"
                : "shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.35)]",
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

function SubjectCard({
  subject,
  selected,
  liveFocusSec,
  editing,
  menu,
  onSelect,
  onDeselect,
  onPlay,
  onOpenMenu,
  onCloseMenu,
  onEditing,
  onNotice,
  store,
}: {
  subject: SubjectResponse;
  selected: boolean;
  liveFocusSec: number;
  editing: Editing | null;
  menu: Menu | null;
  onSelect: () => void;
  onDeselect: () => void;
  onPlay: () => void;
  onOpenMenu: (menu: Menu) => void;
  onCloseMenu: () => void;
  onEditing: (next: Editing | null) => void;
  onNotice: (message: string) => void;
  store: SubjectsStore;
}) {
  const cardRef = useRef<HTMLLIElement>(null);

  /** 메뉴는 누른 행 바로 아래(+4)에 뜬다 — 카드 상단 기준 좌표로 바꿔 둔다. */
  function openMenuBelow(element: HTMLElement, taskId: number | null) {
    const card = cardRef.current;
    const top =
      card === null
        ? 64
        : element.getBoundingClientRect().bottom - card.getBoundingClientRect().top + 4;
    onOpenMenu({ subjectId: subject.id, taskId, top });
  }

  const { handlers } = usePressGestures({
    // 원본 `select`: 이미 고른 과목을 다시 탭하면 해제.
    onTap: () => (selected ? onDeselect() : onSelect()),
    onLongPress: (element) => openMenuBelow(element, null),
  });
  const focusSec = subject.focusSec + liveFocusSec;
  const doneCount = subject.tasks.filter((task) => task.doneAt !== null).length;
  const renaming = editing?.kind === "rename-subject" && editing.subjectId === subject.id;
  const addingTask = editing?.kind === "new-task" && editing.subjectId === subject.id;
  const menuHere = menu !== null && menu.subjectId === subject.id;

  function startAddTask() {
    if (subject.tasks.length >= MAX_TASKS) {
      onNotice(SUBJECT_SHEET_COPY.taskLimit);
      return;
    }
    onEditing({ kind: "new-task", subjectId: subject.id });
  }

  return (
    <li
      ref={cardRef}
      className={cn(
        "relative flex flex-col gap-0.5 rounded-[18px] bg-[var(--session-sheet-surface)] p-1.5 transition-shadow duration-150 motion-reduce:transition-none",
        selected
          ? "shadow-[inset_0_0_0_1px_var(--session-sheet-selected-card-ring)]"
          : "shadow-[inset_0_0_0_1px_var(--session-sheet-line)]",
      )}
    >
      {renaming ? (
        <InlineNameEditor
          initial={subject.name}
          maxLength={50}
          placeholder={SUBJECT_SHEET_COPY.addSubject}
          ariaLabel="과목 이름"
          large
          onCommit={(name) => {
            onEditing(null);
            void store.renameSubject(subject.id, name);
          }}
          onCancel={() => onEditing(null)}
        />
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-pressed={selected}
          {...handlers}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (selected) {
                onDeselect();
              } else {
                onSelect();
              }
            }
          }}
          className={cn(
            "flex min-h-14 w-full touch-pan-y items-center gap-3 rounded-[14px] pr-3 pl-1 text-left select-none",
            selected
              ? "bg-[var(--session-sheet-selected-bg)] text-[var(--state-focus)] shadow-[inset_0_0_0_1px_var(--session-sheet-selected-ring)]"
              : "text-white",
          )}
        >
          <Grip />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[17px] leading-[22px] font-semibold">
              {subject.name}
            </span>
            <span
              className={cn(
                "text-[15px] leading-[18px] font-bold tabular-nums",
                !selected && "text-white/55",
              )}
            >
              <span aria-hidden="true">{formatElapsed(focusSec)}</span>
              <span className="sr-only">{`순공 ${toKoreanDuration(focusSec)}`}</span>
            </span>
          </span>
          {/* 재생/정지(원본 Play Button): 히트 44 · 원 36. 재생은 고르고 시트를 내리고, 정지는 해제. */}
          <button
            type="button"
            aria-label={selected ? `${subject.name} 측정 멈추기` : `${subject.name} 측정 시작`}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              if (selected) {
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
                selected ? "bg-[var(--session-resume-bg)]" : "bg-white/12",
              )}
            >
              <img
                key={selected ? "pause" : "play"}
                src={selected ? pauseIcon : playIcon}
                alt=""
                aria-hidden="true"
                className={cn(
                  "animate-[control-icon-pop_220ms_ease-out] motion-reduce:animate-none",
                  selected ? "h-[15px] w-[13.3px]" : "size-[15px]",
                )}
              />
            </span>
          </button>
        </div>
      )}

      {menuHere && (
        <ContextMenu
          top={menu.top}
          onEdit={() => {
            onCloseMenu();
            onEditing(
              menu.taskId === null
                ? { kind: "rename-subject", subjectId: subject.id }
                : { kind: "rename-task", subjectId: subject.id, taskId: menu.taskId },
            );
          }}
          onRemove={() => {
            onCloseMenu();
            if (menu.taskId === null) {
              if (selected) {
                onDeselect();
              }
              void store.removeSubject(subject.id);
            } else {
              void store.removeTask(subject.id, menu.taskId);
            }
          }}
          onDismiss={onCloseMenu}
        />
      )}

      {subject.tasks.length > 0 && (
        <div className="px-3 pb-1.5">
          <div
            role="progressbar"
            aria-label="할 일 완료율"
            aria-valuemin={0}
            aria-valuemax={subject.tasks.length}
            aria-valuenow={doneCount}
            className="h-[3px] w-full overflow-hidden rounded-full bg-white/8"
          >
            <div
              className="h-full rounded-full bg-[var(--session-resume-bg)] transition-[width] duration-250 motion-reduce:transition-none"
              style={{ width: `${(doneCount / subject.tasks.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {subject.tasks.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {subject.tasks.map((task) => (
            <li key={task.id} className="flex flex-col gap-0.5">
              <div aria-hidden="true" className="py-0.5 pr-3 pl-[52px]">
                <div className="h-px w-full bg-white/8" />
              </div>
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
                  onToggle={(done) => void store.toggleTask(subject.id, task.id, done)}
                  onLongPress={(element) => openMenuBelow(element, task.id)}
                  onRemove={() => void store.removeTask(subject.id, task.id)}
                />
              )}
            </li>
          ))}
        </ul>
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
    </li>
  );
}

function EmptyState({ onPick }: { onPick: (name: string) => void }) {
  return (
    <div className="flex flex-col">
      <div className="flex flex-col items-center gap-1.5 px-2 pt-9 pb-5 text-center">
        <p className="text-[17px] leading-[22px] font-semibold text-white">
          {SUBJECT_SHEET_COPY.empty}
        </p>
        <p className="text-[13px] leading-4 text-white/50">{SUBJECT_SHEET_COPY.emptySub}</p>
      </div>
      <ul className="flex flex-col gap-1.5 px-2 py-1" aria-label="추천 과목">
        {SUBJECT_SUGGESTIONS.map((name) => (
          <li key={name}>
            <button
              type="button"
              onClick={() => onPick(name)}
              className="flex h-[52px] w-full items-center rounded-[14px] bg-[var(--session-sheet-surface)] pr-2 pl-4 text-left shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)] active:bg-white/12"
            >
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-white">
                {name}
              </span>
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center text-[20px] leading-5 text-[var(--state-focus)]"
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
  open,
  store,
  selection,
  onSelect,
  onRequestClose,
  onNotice,
  liveTimes,
}: SubjectPanelProps) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const { subjects, status } = store;
  const empty = status === "ready" && subjects.length === 0;

  // 접히면 편집·메뉴도 닫힌다(원본 `closeSheet`·`barUp`).
  useEffect(() => {
    if (!open) {
      setEditing(null);
      setMenu(null);
    }
  }, [open]);

  function startAddSubject() {
    if (subjects.length >= MAX_SUBJECTS) {
      onNotice(SUBJECT_SHEET_COPY.subjectLimit);
      return;
    }
    setMenu(null);
    setEditing({ kind: "new-subject" });
  }

  const newSubjectEditor = editing?.kind === "new-subject" && (
    <div className="rounded-[18px] bg-[var(--session-sheet-surface)] p-1.5 shadow-[inset_0_0_0_1px_var(--session-sheet-line)]">
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
      <div className="flex flex-col gap-[14px]" aria-label={SUBJECT_SHEET_COPY.loading}>
        <Skeleton className="h-[120px] rounded-[18px] bg-white/6" />
        <Skeleton className="h-[120px] rounded-[18px] bg-white/6" />
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="flex flex-col items-center gap-3 px-3 pt-6 text-center">
        <p className="text-[14px] text-[var(--session-dialog-body)]">
          {SUBJECT_SHEET_COPY.loadFailed}
        </p>
        <button
          type="button"
          onClick={() => void store.reload()}
          className="h-10 rounded-xl bg-[var(--session-dialog-cancel-bg)] px-5 text-[14px] font-medium text-white active:opacity-80"
        >
          {SUBJECT_SHEET_COPY.retry}
        </button>
      </div>
    );
  } else if (empty) {
    body = (
      <>
        <EmptyState
          onPick={(name) => {
            void store.addSubject(name, true).then((created) => {
              if (created !== null) {
                onSelect({ subjectId: created.id, taskId: null });
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
        <ul className="flex flex-col gap-[14px]">
          {subjects.map((subject) => (
            <SubjectCard
              key={subject.id}
              subject={subject}
              selected={selection?.subjectId === subject.id}
              liveFocusSec={liveSubjectTime(liveTimes, subject.id, null).focusSec}
              editing={editing}
              menu={menu}
              onSelect={() => onSelect({ subjectId: subject.id, taskId: null })}
              onDeselect={() => onSelect(null)}
              onPlay={() => {
                vibrate(12);
                onSelect({ subjectId: subject.id, taskId: null });
                onRequestClose();
              }}
              onOpenMenu={setMenu}
              onCloseMenu={() => setMenu(null)}
              onEditing={setEditing}
              onNotice={onNotice}
              store={store}
            />
          ))}
        </ul>
        {newSubjectEditor && <div className="mt-[14px]">{newSubjectEditor}</div>}
      </>
    );
  }

  return (
    <>
      {/* 헤더(원본): "과목" + 우측 "+ 과목 추가"(44 히트). 빈 상태에서도 동일. */}
      <div className="-mt-1.5 flex w-full shrink-0 items-center justify-between pb-0.5 pr-3 pl-5">
        <h2 className="text-[19px] leading-[23px] font-bold text-white">
          {SUBJECT_SHEET_COPY.title}
        </h2>
        {status === "ready" && (
          <button
            type="button"
            onClick={startAddSubject}
            className="flex h-11 items-center gap-1 rounded-xl px-3 text-[var(--state-focus)] active:bg-white/6"
          >
            <span aria-hidden="true" className="text-[18px] leading-[18px] font-medium">
              +
            </span>
            <span className="text-[14px] font-semibold">{SUBJECT_SHEET_COPY.addSubject}</span>
          </button>
        )}
      </div>

      <div className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain px-3 pt-0.5 pb-[calc(env(safe-area-inset-bottom)+48px)] [scrollbar-width:none]">
        {body}
      </div>
    </>
  );
}
