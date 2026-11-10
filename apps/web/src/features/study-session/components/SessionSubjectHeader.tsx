import { ChevronRight } from "lucide-react";
import { useRef, useState, type MouseEvent, type Ref } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";

import { subjectColorVar } from "@/features/records/recordsTimetable";
import { TASK_NAME_MAX, useInlineNameEdit } from "@/features/study-session/subjectInteractions";
import { cn } from "@/lib/utils";

/** 글자가 카메라 화면 위에서도 읽히게 까는 그림자 */
const READABLE = "[text-shadow:0_1px_8px_rgba(0,0,0,0.5)]";

/** 과목 이름 아래 한 줄. 할 일·안내 문구·입력칸이 같은 자리와 글씨를 쓴다. */
const SUB_LINE = "max-w-full truncate pl-4.5 text-[13px] leading-5";

export interface SessionSubjectHeaderProps {
  /** 고른 과목. 없으면 `과목 선택`과 안내 문구를 보인다. */
  subject: { name: string; colorIndex: number; task: string | null } | null;
  expanded: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  /**
   * 고른 과목에 할 일을 더하는 함수
   *
   * 넘기면 `할 일 추가..` 줄이 따로 눌리고, 누르면 그 자리가 입력칸이 된다.
   */
  onAddTask?: (name: string) => void;
}

/**
 * 세션 화면 왼쪽 위의 과목·할 일
 *
 * 과목 색 점과 이름 아래에 끝내지 않은 첫 할 일을 한 줄로 보이고, 누르면 과목 페이지를 연다.
 * 할 일이 없으면 추가를 권하는 흐린 문구, 과목이 없으면 과목을 고르라는 문구를 둔다.
 * 고른 과목에 할 일이 없으면 그 문구만 따로 눌려서 페이지를 열지 않고 그 자리에서 할 일을 적는다.
 * 화면 탭이 심플 모드 전환이라 스스로 누름을 받아 그 전환과 겹치지 않는다.
 */
export function SessionSubjectHeader({
  subject,
  expanded,
  onClick,
  onAddTask,
}: SessionSubjectHeaderProps) {
  const { t } = useTranslation("study-session");
  const sub = subject === null ? t("header.noSubject") : (subject.task ?? t("header.addTask"));
  const nameRow = (
    <span className="flex max-w-full items-center gap-2">
      <span
        aria-hidden="true"
        className={cn(
          "size-2.5 shrink-0 rounded-full",
          subject === null && "border-[1.5px] border-white/60",
        )}
        style={
          subject === null ? undefined : { backgroundColor: subjectColorVar(subject.colorIndex) }
        }
      />
      <span className={cn("truncate text-lg leading-6.5 font-bold", READABLE)}>
        {subject?.name ?? t("header.choose")}
      </span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-white/60" strokeWidth={2} />
    </span>
  );

  // 이름 버튼은 상태가 바뀌어도 같은 요소로 남겨서, 페이지를 닫을 때 연 버튼으로 포커스가 돌아간다.
  const quickAdd = subject !== null && subject.task === null && onAddTask !== undefined;
  return (
    <div className="flex min-h-11 max-w-60 min-w-0 flex-col items-start py-1 text-white">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={expanded}
        data-testid="session-subject"
        onClick={onClick}
        className="pointer-events-auto flex max-w-full flex-col items-start gap-1 text-left"
      >
        {nameRow}
        {!quickAdd && (
          <span
            className={cn(SUB_LINE, READABLE, subject?.task ? "text-white/70" : "text-white/50")}
          >
            {sub}
          </span>
        )}
      </button>
      {quickAdd && <TaskQuickAdd onAddTask={onAddTask} />}
    </div>
  );
}

/**
 * `할 일 추가..` 줄과 그 자리의 입력칸
 *
 * 누르는 순간 같은 누름 안에서 입력칸에 포커스를 줘야 iOS가 키보드를 올린다.
 * 그래서 입력칸을 바로 그린 뒤(flushSync) preventScroll로 포커스를 준다. 문서가 끌려 올라가지 않는다.
 * Enter·포커스 이탈은 확정, Escape는 취소이고 비우면 그냥 닫힌다(과목 페이지 입력과 같은 규칙).
 */
function TaskQuickAdd({ onAddTask }: { onAddTask: (name: string) => void }) {
  const { t } = useTranslation("study-session");
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!adding) {
    return (
      <button
        type="button"
        onClick={() => {
          flushSync(() => setAdding(true));
          inputRef.current?.focus({ preventScroll: true });
        }}
        className={cn("pointer-events-auto min-h-6 text-left text-white/50", SUB_LINE, READABLE)}
      >
        {t("header.addTask")}
      </button>
    );
  }
  return (
    <TaskQuickAddInput ref={inputRef} onAddTask={onAddTask} onClose={() => setAdding(false)} />
  );
}

function TaskQuickAddInput({
  ref,
  onAddTask,
  onClose,
}: {
  ref: Ref<HTMLInputElement>;
  onAddTask: (name: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("study-session");
  const { value, setValue, commit, handleKeyDown, over } = useInlineNameEdit({
    maxLength: TASK_NAME_MAX,
    onCommit: (name) => {
      onClose();
      onAddTask(name);
    },
    onCancel: onClose,
  });
  return (
    <span className="ml-4.5 flex min-h-6 w-52 max-w-[calc(100%-1.125rem)] items-center">
      <input
        ref={ref}
        aria-label={t("subjectSheet.newTaskName")}
        aria-invalid={over || undefined}
        value={value}
        placeholder={t("header.addTask")}
        enterKeyHint="done"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        className={cn(
          "pointer-events-auto h-6 w-full border-b bg-transparent text-[13px] leading-5 text-white caret-white outline-none placeholder:text-white/50",
          READABLE,
          over ? "border-(--state-distract)" : "border-white/40",
        )}
      />
    </span>
  );
}
