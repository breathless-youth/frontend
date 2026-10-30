import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { InlineEditor, RowMenu } from "@/features/planner/subjectRowControls";
import type { PlannerSubjectItem, PlannerTaskItem } from "@/features/planner/subjectItems";
import { SUBJECT_SHEET_COPY } from "@/features/study-session/sessionCopy";
import {
  MAX_TASKS,
  TASK_NAME_MAX,
  usePressGestures,
} from "@/features/study-session/subjectInteractions";
import type { SubjectsStore } from "@/features/study-session/useSubjects";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

export type HomeTaskStore = Pick<
  SubjectsStore,
  "addTask" | "toggleTask" | "renameTask" | "removeTask"
>;

type Editing = { kind: "new" } | { kind: "rename"; taskId: number };

const CHECK_CLASS =
  "size-4.5 rounded-full border-[1.5px] border-text-tertiary shadow-none data-[state=checked]:border-primary [&_svg]:size-2.75";

function taskNameClass(done: boolean) {
  return cn(
    "min-w-0 flex-1 truncate text-sm leading-4.5 font-medium",
    done ? "text-text-tertiary line-through" : "text-foreground",
  );
}

/**
 * 펼친 과목 카드 안의 할 일 목록
 *
 * 오늘의 살아 있는 과목에서만 체크·추가·길게 눌러 이름 변경과 삭제를 하고, 그 밖에는 보기 전용이다.
 * 할 일은 날짜 없이 완료 시각만 저장해서 지난 날에 체크하면 오늘 완료로 잡히기 때문이다.
 */
export function HomeSubjectTasks({
  id,
  item,
  editable,
  store,
  onNotice,
}: {
  id: string;
  item: PlannerSubjectItem;
  editable: boolean;
  store: HomeTaskStore;
  onNotice: (message: string) => void;
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [menuTaskId, setMenuTaskId] = useState<number | null>(null);
  const subjectId = item.subjectId;

  return (
    <div id={id} className="flex flex-col pb-1 pl-17">
      {item.tasks.length > 0 && (
        <ul aria-label={`${item.name} 할 일`} className="flex flex-col">
          {item.tasks.map((task) => {
            if (!editable || !task.live) {
              return <StaticTask key={task.id} task={task} />;
            }
            if (editing?.kind === "rename" && editing.taskId === task.id) {
              return (
                <li key={task.id} className="py-1.5 pr-4">
                  <InlineEditor
                    initial={task.name}
                    maxLength={TASK_NAME_MAX}
                    placeholder="할 일 이름"
                    ariaLabel="할 일 이름"
                    onCommit={(name) => {
                      setEditing(null);
                      void store.renameTask(subjectId, task.id, name);
                    }}
                    onCancel={() => setEditing(null)}
                  />
                </li>
              );
            }
            return (
              <EditableTask
                key={task.id}
                task={task}
                menuOpen={menuTaskId === task.id}
                onToggle={(done) => {
                  if (done) {
                    haptic("light");
                  }
                  void store.toggleTask(subjectId, task.id, done);
                }}
                onOpenMenu={() => setMenuTaskId(task.id)}
                onCloseMenu={() => setMenuTaskId(null)}
                onRename={() => {
                  setMenuTaskId(null);
                  setEditing({ kind: "rename", taskId: task.id });
                }}
                onRemove={() => {
                  setMenuTaskId(null);
                  void store.removeTask(subjectId, task.id);
                }}
              />
            );
          })}
        </ul>
      )}

      {editable &&
        (editing?.kind === "new" ? (
          <div className="py-1.5 pr-4">
            <InlineEditor
              maxLength={TASK_NAME_MAX}
              placeholder="할 일 이름"
              ariaLabel="새 할 일 이름"
              onCommit={(name) => {
                setEditing(null);
                void store.addTask(subjectId, name);
              }}
              onCancel={() => setEditing(null)}
            />
          </div>
        ) : (
          <Button
            variant="unstyled"
            onClick={() => {
              if (item.tasks.filter((task) => task.live).length >= MAX_TASKS) {
                onNotice(SUBJECT_SHEET_COPY.taskLimit);
                return;
              }
              setMenuTaskId(null);
              setEditing({ kind: "new" });
            }}
            className="h-11 gap-1 self-end px-4 text-[13px] leading-4 font-medium text-muted-foreground focus-visible:ring-2 focus-visible:ring-state-focus focus-visible:outline-none"
          >
            <span aria-hidden className="text-base leading-4">
              +
            </span>
            {SUBJECT_SHEET_COPY.addTask}
          </Button>
        ))}
    </div>
  );
}

function StaticTask({ task }: { task: PlannerTaskItem }) {
  return (
    <li className="flex h-11 items-center gap-2.5 pr-4">
      <Checkbox
        checked={task.done}
        disabled
        aria-label={task.name}
        // 보기 전용이라 흐리게 하지 않는다. 누름은 받지 않고 카드로 흘려보내 그 위에서 시작한 밀기도 잡힌다.
        className={cn(CHECK_CLASS, "pointer-events-none disabled:opacity-100")}
      />
      <span aria-hidden className={taskNameClass(task.done)}>
        {task.name}
      </span>
    </li>
  );
}

function EditableTask({
  task,
  menuOpen,
  onToggle,
  onOpenMenu,
  onCloseMenu,
  onRename,
  onRemove,
}: {
  task: PlannerTaskItem;
  menuOpen: boolean;
  onToggle: (done: boolean) => void;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  onRename: () => void;
  onRemove: () => void;
}) {
  // 가로 밀기는 과목 카드의 동작에 쓰므로 할 일 삭제는 길게 눌러 여는 메뉴에서만 한다.
  const { pressed, handlers } = usePressGestures({
    onTap: () => onToggle(!task.done),
    onLongPress: onOpenMenu,
  });
  return (
    <li className={cn("relative", menuOpen && "z-20")}>
      <div
        {...handlers}
        className={cn(
          "session-no-drag flex h-11 items-center gap-2.5 pr-4 select-none",
          pressed && "opacity-60",
        )}
      >
        <Checkbox
          checked={task.done}
          aria-label={task.name}
          // 값은 줄의 누름 처리가 바꾼다. 체크 상자의 클릭은 줄로 올려 보낸다(키보드 스페이스도 클릭으로 올라간다).
          onClick={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onToggle(!task.done);
            }
          }}
          className={CHECK_CLASS}
        />
        <span aria-hidden className={taskNameClass(task.done)}>
          {task.name}
        </span>
      </div>
      {menuOpen && <RowMenu onRename={onRename} onRemove={onRemove} onDismiss={onCloseMenu} />}
    </li>
  );
}
