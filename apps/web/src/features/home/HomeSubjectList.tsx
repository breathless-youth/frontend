import { Check, Pencil, Play, RotateCcw } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import type { PlannerSubjectItem } from "@/features/planner/subjectItems";
import { formatDuration } from "@/features/records/recordsFormat";
import { subjectColorVar } from "@/features/records/recordsTimetable";
import { cn } from "@/lib/utils";

import { HomeSubjectTasks, type HomeTaskStore } from "./HomeSubjectTasks";
import type { SubjectCompletion } from "./subjectCompletion";
import { type SwipeSide, useCardSwipe } from "./useCardSwipe";

export type { HomeTaskStore } from "./HomeSubjectTasks";

/** 동작 버튼 하나의 폭과 버튼 사이 간격, 카드와 버튼 무리 사이 여백. */
const ACTION_WIDTH = 56;
const ACTION_GAP = 4;
const ACTIONS_INSET = 12;

const DELETED_SUBJECT_NOTICE = "이미 삭제된 과목이에요";

function actionsWidth(count: number) {
  return count === 0 ? 0 : count * ACTION_WIDTH + (count - 1) * ACTION_GAP + ACTIONS_INSET;
}

/** 화면 가장자리에서 `index`번째(0이 가장자리) 버튼의 폭이 드러난 비율(0~1). */
function actionProgress(revealed: number, index: number) {
  const start = index * (ACTION_WIDTH + ACTION_GAP);
  return Math.min(1, Math.max(0, (revealed - start) / ACTION_WIDTH));
}

function itemKey(item: PlannerSubjectItem) {
  return `${item.live ? "live" : "record"}-${String(item.subjectId)}`;
}

/**
 * 홈 과목 목록
 *
 * 과목마다 이름과 고른 날의 순공을 한 줄로 보이고, 누르면 카드 안에 할 일이 펼쳐진다.
 * 오늘은 과목 색 재생 버튼으로 공부를 시작하고, 지난 날은 같은 자리에 과목 색 막대만 둔다.
 * 삭제한 과목은 오늘이어도 시작할 수 없으므로 막대로 그린다.
 * 시간 직접 입력은 지금 과목만 고를 수 있어 삭제한 과목의 `직접 입력`은 페이지를 열지 않고 알리기만 한다.
 * 카드를 밀면 뒤의 `직접 입력`과 과목 완료 버튼이 드러나고, 열린 카드는 하나뿐이다.
 * 과목 완료는 `completion`이 있을 때만 보인다.
 * 펼침과 열린 카드는 날짜마다 따로라서 호출부가 날짜를 `key`로 주어 날짜가 바뀌면 새로 그린다.
 */
export function HomeSubjectList({
  items,
  isToday,
  onPlay,
  store,
  completion,
  onManualRecord,
  onNotice,
}: {
  items: PlannerSubjectItem[];
  isToday: boolean;
  onPlay: (subjectId: number) => void;
  store: HomeTaskStore;
  completion: SubjectCompletion | null;
  onManualRecord: (subjectId: number) => void;
  onNotice: (message: string) => void;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [openSwipe, setOpenSwipe] = useState<{ key: string; side: SwipeSide } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // 열린 카드 밖을 누르면 닫는다. 그 카드 안의 누름은 카드가 처리한다.
  const openKey = openSwipe?.key ?? null;
  useEffect(() => {
    if (openKey === null) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      const openRow = listRef.current?.querySelector(`[data-swipe-key="${openKey}"]`);
      if (!(event.target instanceof Node) || !openRow?.contains(event.target)) {
        setOpenSwipe(null);
      }
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [openKey]);

  return (
    <ul ref={listRef} aria-label="과목" className="flex flex-col gap-2.5">
      {items.map((item) => {
        const key = itemKey(item);
        return (
          <SubjectCard
            key={key}
            swipeKey={key}
            item={item}
            isToday={isToday}
            expanded={expandedKey === key}
            onToggleExpanded={() => setExpandedKey(expandedKey === key ? null : key)}
            swipeOpen={openSwipe?.key === key ? openSwipe.side : null}
            onSwipeOpenChange={(side) => setOpenSwipe(side === null ? null : { key, side })}
            onPlay={onPlay}
            store={store}
            completion={completion}
            onManualRecord={(subjectId) => {
              setOpenSwipe(null);
              if (item.live) {
                onManualRecord(subjectId);
              } else {
                onNotice(DELETED_SUBJECT_NOTICE);
              }
            }}
            onNotice={onNotice}
          />
        );
      })}
    </ul>
  );
}

function SubjectCard({
  swipeKey,
  item,
  isToday,
  expanded,
  onToggleExpanded,
  swipeOpen,
  onSwipeOpenChange,
  onPlay,
  store,
  completion,
  onManualRecord,
  onNotice,
}: {
  swipeKey: string;
  item: PlannerSubjectItem;
  isToday: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  swipeOpen: SwipeSide | null;
  onSwipeOpenChange: (side: SwipeSide | null) => void;
  onPlay: (subjectId: number) => void;
  store: HomeTaskStore;
  completion: SubjectCompletion | null;
  onManualRecord: (subjectId: number) => void;
  onNotice: (message: string) => void;
}) {
  const color = subjectColorVar(item.colorIndex);
  const done = completion?.isDone(item.subjectId) ?? false;
  const leftActions = completion !== null && !done ? 2 : 1;
  const rightActions = completion !== null && done ? 1 : 0;
  const { offset, dragging, handlers } = useCardSwipe({
    open: swipeOpen,
    leftWidth: actionsWidth(leftActions),
    rightWidth: actionsWidth(rightActions),
    onOpenChange: onSwipeOpenChange,
  });
  const editableTasks = isToday && item.live;
  // 지난 날 할 일이 없는 카드는 펼쳐도 보일 것이 없다.
  const expandable = editableTasks || item.tasks.length > 0;
  const doneCount = item.tasks.filter((task) => task.done).length;
  const tasksId = useId();
  const countId = useId();
  const timeId = useId();
  const liRef = useRef<HTMLLIElement>(null);

  // 닫힌 카드의 동작 버튼은 Tab 순서에서 빠지므로 키보드는 카드에서 미는 방향의 화살표로 연다.
  // 동작 버튼에 포커스가 가면 `SwipeActions`가 카드를 연다.
  function openByKey(event: KeyboardEvent) {
    const side = event.key === "ArrowLeft" ? "left" : event.key === "ArrowRight" ? "right" : null;
    const action =
      side === null
        ? null
        : liRef.current?.querySelector<HTMLElement>(`[data-swipe-actions="${side}"] button`);
    if (action) {
      event.preventDefault();
      action.focus();
    }
  }

  function closeByEscape(event: KeyboardEvent) {
    if (event.key !== "Escape" || swipeOpen === null) {
      return;
    }
    event.preventDefault();
    onSwipeOpenChange(null);
    liRef.current?.querySelector<HTMLElement>("[data-card-head] button")?.focus();
  }

  const closeThen = (action: () => void) => () => {
    onSwipeOpenChange(null);
    action();
  };

  const head = (
    <>
      <span className="flex min-w-0 flex-1 flex-col items-start">
        <span
          className={cn(
            "max-w-full truncate text-base leading-6 font-semibold",
            done ? "text-text-tertiary line-through" : "text-foreground",
          )}
        >
          {item.name}
        </span>
        {item.tasks.length > 0 && (
          <span className="text-xs leading-4 text-text-tertiary tabular-nums">
            <span aria-hidden>{`${String(doneCount)}/${String(item.tasks.length)}`}</span>
            <span id={countId} className="sr-only">
              {`할 일 ${String(item.tasks.length)}개 중 ${String(doneCount)}개 완료`}
            </span>
          </span>
        )}
      </span>
      <span id={timeId} className="flex shrink-0 flex-col items-end">
        <span className="text-[11px] leading-3.5 text-text-tertiary">순공</span>
        <span
          className={cn(
            "text-[15px] leading-5 font-bold tabular-nums",
            done ? "text-text-tertiary" : "text-foreground",
          )}
        >
          {formatDuration(item.focusSec)}
        </span>
      </span>
    </>
  );

  return (
    <li
      ref={liRef}
      data-swipe-key={swipeKey}
      data-swipe-open={swipeOpen ?? undefined}
      onKeyDown={closeByEscape}
      className="relative"
    >
      {rightActions > 0 && (
        <SwipeActions side="right" onReveal={() => onSwipeOpenChange("right")}>
          <SwipeAction
            focusable={swipeOpen === "right"}
            progress={actionProgress(Math.max(offset, 0), 0)}
            dragging={dragging}
            label="완료 취소"
            icon={<RotateCcw aria-hidden size={20} />}
            onClick={closeThen(() => completion?.setDone(item.subjectId, false))}
          />
        </SwipeActions>
      )}
      <SwipeActions side="left" onReveal={() => onSwipeOpenChange("left")}>
        <SwipeAction
          focusable={swipeOpen === "left"}
          progress={actionProgress(Math.max(-offset, 0), leftActions - 1)}
          dragging={dragging}
          label="직접 입력"
          icon={<Pencil aria-hidden size={20} />}
          onClick={() => onManualRecord(item.subjectId)}
        />
        {leftActions === 2 && (
          <SwipeAction
            focusable={swipeOpen === "left"}
            progress={actionProgress(Math.max(-offset, 0), 0)}
            dragging={dragging}
            label="완료 표시"
            primary
            icon={<Check aria-hidden size={20} />}
            onClick={closeThen(() => completion?.setDone(item.subjectId, true))}
          />
        )}
      </SwipeActions>

      <div
        data-swipe-surface=""
        {...handlers}
        style={{ transform: offset === 0 ? undefined : `translateX(${String(offset)}px)` }}
        className={cn(
          "relative z-10 flex touch-pan-y flex-col rounded-lg bg-muted shadow-sb-card",
          !dragging &&
            "transition-transform duration-200 ease-overlay motion-reduce:transition-none",
        )}
      >
        <div
          data-card-head=""
          onKeyDown={openByKey}
          className="flex min-h-17 items-center gap-2 py-2.5 pl-3"
        >
          {done ? (
            <span
              aria-hidden
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-text-tertiary/15 text-text-tertiary"
            >
              <Check size={20} strokeWidth={2.5} />
            </span>
          ) : isToday && item.live ? (
            <button
              type="button"
              aria-label={`${item.name} 공부 시작`}
              onClick={() => onPlay(item.subjectId)}
              style={{ color }}
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-current/15 transition-[scale,background-color] duration-150 ease-overlay active:scale-92 active:bg-current/25 motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-state-focus focus-visible:outline-none"
            >
              <Play aria-hidden size={18} fill="currentColor" />
            </button>
          ) : (
            <span aria-hidden className="flex size-12 shrink-0 items-center justify-center">
              <span className="h-5 w-1 rounded-full" style={{ backgroundColor: color }} />
            </span>
          )}
          {/* 펼칠 것이 없는 카드도 버튼으로 두어 키보드가 화살표로 동작을 열 자리를 남긴다. */}
          <button
            type="button"
            // 이름은 짧게 두고 할 일 수와 순공은 설명으로 읽게 한다.
            aria-label={expandable ? `${item.name} 할 일` : item.name}
            aria-describedby={item.tasks.length > 0 ? `${countId} ${timeId}` : timeId}
            aria-expanded={expandable ? expanded : undefined}
            aria-controls={expandable ? tasksId : undefined}
            onClick={expandable ? onToggleExpanded : undefined}
            className="flex min-h-12 min-w-0 flex-1 items-center gap-2 self-stretch rounded-md pr-4 text-left focus-visible:ring-2 focus-visible:ring-state-focus focus-visible:outline-none"
          >
            {head}
          </button>
        </div>
        {expanded && expandable && (
          <HomeSubjectTasks
            id={tasksId}
            item={item}
            editable={editableTasks}
            store={store}
            onNotice={onNotice}
          />
        )}
      </div>
    </li>
  );
}

/**
 * 카드 뒤에 깔린 동작 버튼 무리
 *
 * 닫혀 있어도 문서에 남겨 화면 낭독기가 찾을 수 있게 하고, 포커스가 들어오면 카드를 열어 버튼을 드러낸다.
 * 닫힌 동안은 버튼이 Tab 순서에서 빠져 키보드가 보이지 않는 버튼을 거치지 않는다.
 */
function SwipeActions({
  side,
  onReveal,
  children,
}: {
  side: SwipeSide;
  onReveal: () => void;
  children: ReactNode;
}) {
  return (
    <div
      data-swipe-actions={side}
      onFocus={onReveal}
      className={cn(
        "absolute top-0 flex h-17 items-center gap-1",
        side === "left" ? "right-0 justify-end" : "left-0",
      )}
    >
      {children}
    </div>
  );
}

/**
 * 카드 뒤 동작 버튼 하나
 *
 * 미는 동안 드러난 비율만큼 크기와 진하기가 차오르고, 다 드러나는 순간 한 번 튕긴다.
 * 손을 떼고 열릴 때는 살짝 넘쳤다 돌아오고, 닫힐 때는 그 반대로 살짝 부풀었다 줄어든다.
 */
function SwipeAction({
  focusable,
  progress,
  dragging,
  label,
  icon,
  primary = false,
  onClick,
}: {
  focusable: boolean;
  progress: number;
  dragging: boolean;
  label: string;
  icon: ReactNode;
  primary?: boolean;
  onClick: () => void;
}) {
  const settle = dragging
    ? "transition-none"
    : progress === 1
      ? "transition-[scale,opacity] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
      : "transition-[scale,opacity] duration-300 ease-[cubic-bezier(0.36,0,0.66,-0.56)]";
  return (
    <button
      type="button"
      tabIndex={focusable ? 0 : -1}
      onClick={onClick}
      style={{ "--reveal": progress } as CSSProperties}
      className={cn(
        // 원과 글자가 한 덩어리로 커지고 튕기도록 크기는 버튼 전체에 건다.
        "group flex w-14 flex-col items-center gap-1 rounded-md scale-(--reveal) opacity-(--reveal) focus-visible:outline-none motion-reduce:scale-100 motion-reduce:transition-none",
        settle,
        dragging &&
          progress === 1 &&
          "animate-[swipe-action-pop_300ms_ease-out] motion-reduce:animate-none",
      )}
    >
      <span
        className={cn(
          "flex size-11 items-center justify-center rounded-full shadow-sb-card transition-[scale] duration-150 ease-overlay group-active:scale-92 group-focus-visible:ring-2 group-focus-visible:ring-state-focus motion-reduce:transition-none motion-reduce:group-active:scale-100",
          primary ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
        )}
      >
        {icon}
      </span>
      <span className="text-[11px] leading-3.5 font-medium text-muted-foreground">{label}</span>
    </button>
  );
}
