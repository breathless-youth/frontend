import type { SubjectResponse } from "@focusmakers/types";
import { Minus, Plus } from "lucide-react";
import { useId, useState } from "react";

import { CharCount } from "@/components/ui/char-count";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { subjectColorVar } from "@/features/records/recordsTimetable";
import { SUBJECT_SHEET_COPY } from "@/features/study-session/sessionCopy";
import { MAX_SUBJECTS, SUBJECT_NAME_MAX } from "@/features/study-session/subjectInteractions";
import type { SubjectsStore } from "@/features/study-session/useSubjects";
import { objectParticle } from "@/lib/objectParticle";

import { HomeModeHeader } from "./HomeModeHeader";

export type EditStore = Pick<SubjectsStore, "subjects" | "renameSubject" | "removeSubject">;

/**
 * 홈 과목 편집 상태
 *
 * 과목마다 이름 입력과 삭제 버튼만 두는 가벼운 편집이다.
 * 과목을 삭제해도 공부한 시간은 기록에 남아서 확인 창이 그 점을 알린다.
 * 새 과목은 홈의 과목 추가 시트로 만든다.
 */
export function HomeSubjectEdit({
  store,
  onDone,
  onAddSubject,
  onNotice,
}: {
  store: EditStore;
  onDone: () => void;
  onAddSubject: () => void;
  onNotice: (message: string) => void;
}) {
  const [removing, setRemoving] = useState<SubjectResponse | null>(null);

  return (
    <>
      <HomeModeHeader title="과목 편집" onDone={onDone} />
      <ul aria-label="과목 편집" className="flex flex-col gap-2.5">
        {store.subjects.map((subject) => (
          <li
            key={subject.id}
            className="flex min-h-17 items-center gap-2 rounded-lg bg-muted py-2.5 pl-3 shadow-sb-card"
          >
            <span aria-hidden className="flex size-12 shrink-0 items-center justify-center">
              <span
                className="size-3 rounded-full"
                style={{ backgroundColor: subjectColorVar(subject.colorIndex) }}
              />
            </span>
            {/* 서버 이름이 바뀌면 입력을 새로 만들어 고치던 값 대신 그 이름을 보인다. */}
            <NameInput
              key={subject.name}
              name={subject.name}
              onRename={(name) => void store.renameSubject(subject.id, name)}
            />
            <button
              type="button"
              aria-label={`${subject.name} 삭제`}
              onClick={() => setRemoving(subject)}
              className="flex size-12 shrink-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none"
            >
              <span className="flex size-6 items-center justify-center rounded-full bg-feedback-danger text-white">
                <Minus aria-hidden size={16} strokeWidth={3} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => {
          if (store.subjects.length >= MAX_SUBJECTS) {
            onNotice(SUBJECT_SHEET_COPY.subjectLimit);
            return;
          }
          onAddSubject();
        }}
        className="flex h-11 items-center gap-1.5 self-start rounded-md px-4 text-sm leading-5 font-semibold text-primary focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none"
      >
        <Plus aria-hidden size={16} strokeWidth={2.5} />
        {SUBJECT_SHEET_COPY.addSubject}
      </button>

      <ConfirmDialog
        open={removing !== null}
        title={
          removing === null ? "" : `"${removing.name}"${objectParticle(removing.name)} 삭제할까요?`
        }
        description="공부한 시간은 기록에 남아요."
        cancelLabel="취소"
        confirmLabel="삭제"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing !== null) {
            void store.removeSubject(removing.id);
          }
          setRemoving(null);
        }}
      />
    </>
  );
}

/**
 * 밑줄 이름 입력
 *
 * 포커스가 빠지거나 Enter를 누르면 저장하고, 비었거나 그대로면 원래 이름으로 돌린다.
 * 한도를 넘긴 이름은 저장하지 않고 고칠 때까지 알린다.
 * 입력을 한도에서 자르면 iOS 한글 자판이 기억하는 글자와 어긋나 자르지 않는다.
 */
function NameInput({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [value, setValue] = useState(name);
  const countId = useId();
  const over = value.length > SUBJECT_NAME_MAX;

  function commit() {
    if (over) {
      return;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed === name) {
      setValue(name);
      return;
    }
    // 저장이 받아들여지면 이름이 바뀌어 입력이 새로 만들어지고, 이름이 겹쳐 거절되면 원래 이름으로 돌아온다.
    setValue(name);
    onRename(trimmed);
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <input
        aria-label={`${name} 이름`}
        aria-describedby={over ? countId : undefined}
        aria-invalid={over}
        value={value}
        enterKeyHint="done"
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            setValue(name);
          }
        }}
        className="h-11 w-full min-w-0 border-b border-border bg-transparent text-base leading-6 font-semibold text-foreground outline-none focus:border-primary aria-invalid:border-feedback-danger"
      />
      <CharCount
        id={countId}
        length={value.length}
        max={SUBJECT_NAME_MAX}
        showFrom={0.8}
        overMessage={`${String(SUBJECT_NAME_MAX)}자까지 쓸 수 있어요`}
      />
    </div>
  );
}
