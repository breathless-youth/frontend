import type { SubjectResponse } from "@focusmakers/types";
import { Menu } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { subjectColorVar } from "@/features/records/recordsTimetable";
import type { SubjectsStore } from "@/features/study-session/useSubjects";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

import { HomeModeHeader } from "./HomeModeHeader";

export type ReorderStore = Pick<
  SubjectsStore,
  "subjects" | "startReorder" | "reorderSubject" | "commitReorder"
>;

/** 든 과목이 손가락을 따라 떠다니도록 누른 자리, 처음 줄 위치, 지금 손가락 위치를 기억한다. */
interface Floating {
  row: HTMLElement;
  startX: number;
  startY: number;
  startTop: number;
  x: number;
  y: number;
}

/** 줄이 순서상 자리에서 얼마나 벗어나야 손가락 밑에 오는지 계산해 옮긴다. 자리가 바뀌어도 화면 위치는 그대로다. */
function placeFloating(float: Floating | null) {
  if (float !== null) {
    float.row.style.translate = `${String(float.x - float.startX)}px ${String(float.y - float.startY - (float.row.offsetTop - float.startTop))}px`;
  }
}

/** 한 점에 겹친 요소 중 든 과목을 건너뛰고 그 아래 과목 id를 찾는다. */
function subjectUnderLifted(x: number, y: number, selfId: number): number | null {
  for (const element of document.elementsFromPoint(x, y)) {
    const row = element.closest<HTMLElement>("[data-subject-id]");
    const id = row === null ? Number.NaN : Number(row.dataset.subjectId);
    if (Number.isFinite(id) && id !== selfId) {
      return id;
    }
  }
  return null;
}

/**
 * 홈 과목 순서 변경 상태
 *
 * 오른쪽 손잡이를 끌거나 화살표 키로 이동하고, 바뀐 순서는 화면에만 반영한다.
 * 화살표 키로 이동하면 새 자리를 화면 낭독기에 알린다.
 * 들어올 때의 순서를 기억해 두고 이 화면이 내려갈 때 순서가 달라졌으면 한 번만 저장한다.
 * `완료`와 뒤로 가기가 모두 화면을 내리므로 저장도 한 곳에서 한다.
 */
export function HomeSubjectReorder({ store, onDone }: { store: ReorderStore; onDone: () => void }) {
  const [liftedId, setLiftedId] = useState<number | null>(null);
  /** 마지막으로 자리를 바꾼 과목. 리렌더 전에 같은 과목 위에서 이동이 연달아 오면 순서가 왔다 갔다 해서 한 번만 바꾼다. */
  const lastOverRef = useRef<number | null>(null);
  const floatRef = useRef<Floating | null>(null);
  /** 놓은 줄. 위치 전환이 붙은 뒤에 떠 있던 위치를 지워야 제자리로 미끄러진다. */
  const droppedRef = useRef<HTMLElement | null>(null);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const listRef = useRef<HTMLUListElement>(null);

  const begin = useEffectEvent(() => store.startReorder());
  const finish = useEffectEvent(() => void store.commitReorder());
  useEffect(() => {
    begin();
    return () => finish();
  }, []);

  // 자리를 바꾸면 줄의 순서상 위치가 달라지므로 그리기 전에 떠 있는 위치를 다시 맞춘다.
  useLayoutEffect(() => {
    placeFloating(floatRef.current);
  }, [store.subjects]);

  useLayoutEffect(() => {
    if (liftedId === null && droppedRef.current !== null) {
      droppedRef.current.style.translate = "";
      droppedRef.current = null;
    }
  }, [liftedId]);

  function drop() {
    droppedRef.current = floatRef.current?.row ?? null;
    floatRef.current = null;
    setLiftedId(null);
  }

  // 키보드로 이동한 손잡이는 DOM 자리가 바뀌며 포커스를 잃을 수 있어 다시 준다.
  useEffect(() => {
    if (focusId !== null) {
      listRef.current
        ?.querySelector<HTMLElement>(`[data-subject-id="${String(focusId)}"] [data-handle]`)
        ?.focus();
    }
  }, [focusId, store.subjects]);

  function moveByKey(event: KeyboardEvent, index: number, subject: SubjectResponse) {
    const step = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    const neighbor = step === 0 ? undefined : store.subjects[index + step];
    if (neighbor === undefined) {
      return;
    }
    event.preventDefault();
    store.reorderSubject(subject.id, neighbor.id);
    setFocusId(subject.id);
    setAnnouncement(
      `${subject.name}, ${String(store.subjects.length)}개 중 ${String(index + step + 1)}번째`,
    );
  }

  return (
    <>
      <HomeModeHeader title="과목 순서 변경" onDone={onDone} />
      <ul ref={listRef} aria-label="과목 순서" className="flex flex-col gap-2.5">
        {store.subjects.map((subject, index) => (
          <li
            key={subject.id}
            data-subject-id={subject.id}
            className={cn(
              "relative flex h-17 items-center gap-2 rounded-lg bg-muted pl-3 shadow-sb-card duration-150 ease-overlay motion-reduce:transition-none",
              // 든 줄은 손가락을 바로 따라가야 해서 위치 전환을 빼고, 놓으면 제자리로 미끄러져 돌아간다.
              liftedId === subject.id
                ? "z-10 scale-[1.03] shadow-[0_12px_28px_6px_rgba(31,41,61,0.2)] transition-[scale,box-shadow] motion-reduce:scale-100"
                : "transition-[scale,box-shadow,translate]",
            )}
          >
            <span aria-hidden className="flex size-12 shrink-0 items-center justify-center">
              <span
                className="size-3 rounded-full"
                style={{ backgroundColor: subjectColorVar(subject.colorIndex) }}
              />
            </span>
            <span className="min-w-0 flex-1 truncate text-base leading-6 font-semibold text-foreground">
              {subject.name}
            </span>
            <button
              type="button"
              data-handle=""
              aria-label={`${subject.name} 순서 이동`}
              onPointerDown={(event) => {
                if (!event.isPrimary) {
                  return;
                }
                try {
                  event.currentTarget.setPointerCapture(event.pointerId);
                } catch {
                  // 캡처를 못 잡아도 손잡이 위에서는 계속 끌린다.
                }
                lastOverRef.current = null;
                const row = event.currentTarget.closest<HTMLElement>("[data-subject-id]");
                if (row !== null) {
                  floatRef.current = {
                    row,
                    startX: event.clientX,
                    startY: event.clientY,
                    startTop: row.offsetTop,
                    x: event.clientX,
                    y: event.clientY,
                  };
                }
                setLiftedId(subject.id);
              }}
              onPointerMove={(event) => {
                const float = floatRef.current;
                if (liftedId !== subject.id || float === null) {
                  return;
                }
                float.x = event.clientX;
                float.y = event.clientY;
                placeFloating(float);
                // 든 줄이 손가락 밑을 덮으므로 목록 가운데 세로선에서 그 아래 과목을 찾는다.
                const list = listRef.current?.getBoundingClientRect();
                const overId = subjectUnderLifted(
                  list === undefined ? event.clientX : list.left + list.width / 2,
                  event.clientY,
                  subject.id,
                );
                if (overId === null) {
                  lastOverRef.current = null;
                  return;
                }
                if (lastOverRef.current === overId) {
                  return;
                }
                lastOverRef.current = overId;
                store.reorderSubject(subject.id, overId);
                haptic("light");
              }}
              onPointerUp={drop}
              onPointerCancel={drop}
              onKeyDown={(event) => moveByKey(event, index, subject)}
              onContextMenu={(event) => event.preventDefault()}
              className="flex size-12 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground focus-visible:ring-2 focus-visible:ring-state-focus focus-visible:outline-none active:cursor-grabbing"
            >
              <Menu aria-hidden size={20} />
            </button>
          </li>
        ))}
      </ul>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
