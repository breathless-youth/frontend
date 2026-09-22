import { useCallback, useRef, useEffect, useState } from "react";

import type { SubjectResponse, TaskResponse } from "@focusmakers/types";

import { trackSubjectItemAdded } from "@/lib/amplitude";
import {
  createSubject,
  createTask,
  deleteSubject,
  deleteTask,
  listSubjects,
  renameSubject,
  reorderSubjects,
  updateTask,
} from "@/lib/subjectApi";

import { SUBJECT_SHEET_COPY } from "./sessionCopy";

export type SubjectsStatus = "idle" | "loading" | "ready" | "error";

/**
 * 과목 시트의 서버 상태. react-query를 쓰지 않는 이유: 세션 화면(`RoomPage`)은
 * 스터디룸 테스트 전부가 Provider 없이 렌더하는 라우트고, 이 목록은 시트를 열 때 한 번 받아
 * 세션 동안 들고 있으면 충분하다.
 *
 * 변경은 화면에 먼저 반영하고(이름·완료·삭제·순서) 실패하면 토스트 뒤 서버 값으로 되돌린다(스펙 §6).
 * 추가만은 서버 응답을 기다린다 — 임시 id로 만든 항목을 고르면 스냅샷에 가짜 id가 실린다.
 *
 * 순서는 서버가 저장한다(`PUT /api/subjects/order`, BY-725). 목록은 이미 저장된 순서로 내려오고 새 과목은
 * 끝에 붙는다. 드래그 중 자리 바꿈은 화면에만 반영하고, 놓을 때(`commitReorder`) 잡았을 때와 순서가 다르면
 * 전체 순서를 한 번 보낸다.
 */
export function useSubjects(enabled: boolean, onError: (message: string) => void) {
  const [subjects, setSubjects] = useState<SubjectResponse[]>([]);
  const [status, setStatus] = useState<SubjectsStatus>("idle");
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  /**
   * 드래그 중 최신 순서. pointermove의 setState는 pointerup 전에 렌더되지 않을 수 있어(연속 입력은
   * 우선순위가 낮다) 놓는 순간 state를 믿지 않는다 — `reorderSubject`가 여기에 먼저 쓰고
   * `commitReorder`가 여기서 읽는다. 렌더마다 state로 덮어 다른 변경과도 어긋나지 않는다.
   */
  const subjectsRef = useRef(subjects);
  subjectsRef.current = subjects;
  /** 핸들을 잡는 순간의 id 순서 — 놓을 때 이것과 다를 때만 서버에 보낸다. null이면 드래그 중이 아니다. */
  const dragBaseRef = useRef<number[] | null>(null);

  const reload = useCallback(async () => {
    // 재조회는 이미 보이는 목록을 비우지 않는다 — 실패 복구 중에 화면이 깜빡이지 않게.
    setStatus((prev) => (prev === "ready" ? prev : "loading"));
    try {
      // 서버가 저장된 순서로 내려준다 — 여기서 다시 정렬하지 않는다.
      setSubjects(await listSubjects());
      setStatus("ready");
    } catch {
      setStatus("error");
      onErrorRef.current(SUBJECT_SHEET_COPY.loadFailed);
    }
  }, []);

  useEffect(() => {
    if (enabled && status === "idle") {
      void reload();
    }
  }, [enabled, reload, status]);

  /** 낙관적 반영 → 요청 → 실패 시 토스트 + 서버 값 복원. */
  const mutate = useCallback(
    async (
      optimistic: (prev: SubjectResponse[]) => SubjectResponse[],
      request: () => Promise<unknown>,
    ) => {
      setSubjects(optimistic);
      try {
        await request();
      } catch {
        onErrorRef.current(SUBJECT_SHEET_COPY.saveFailed);
        void reload();
      }
    },
    [reload],
  );

  const patchTask =
    (subjectId: number, taskId: number, patch: Partial<TaskResponse>) =>
    (prev: SubjectResponse[]) =>
      prev.map((subject) =>
        subject.id !== subjectId
          ? subject
          : {
              ...subject,
              tasks: subject.tasks.map((task) =>
                task.id === taskId ? { ...task, ...patch } : task,
              ),
            },
      );

  /** 만든 과목을 돌려준다 — 추천 행은 만든 즉시 측정 선택된다(Figma `Sheet / Suggest Row`). */
  const addSubject = useCallback(
    async (name: string, viaSuggestion = false): Promise<SubjectResponse | null> => {
      try {
        const created = await createSubject({ name });
        setSubjects((prev) => [...prev, created]);
        trackSubjectItemAdded("subject", viaSuggestion);
        return created;
      } catch {
        onErrorRef.current(SUBJECT_SHEET_COPY.saveFailed);
        return null;
      }
    },
    [],
  );

  const addTask = useCallback(async (subjectId: number, name: string) => {
    try {
      const created = await createTask(subjectId, { name });
      setSubjects((prev) =>
        prev.map((subject) =>
          subject.id === subjectId ? { ...subject, tasks: [...subject.tasks, created] } : subject,
        ),
      );
      trackSubjectItemAdded("task");
    } catch {
      onErrorRef.current(SUBJECT_SHEET_COPY.saveFailed);
    }
  }, []);

  /** 핸들 드래그 — `fromId` 과목을 `overId` 과목 자리로 옮긴다. 화면에만 반영하고 서버 요청은 `commitReorder`가 한다. */
  const reorderSubject = useCallback((fromId: number, overId: number) => {
    const prev = subjectsRef.current;
    const from = prev.findIndex((subject) => subject.id === fromId);
    const to = prev.findIndex((subject) => subject.id === overId);
    if (from === -1 || to === -1 || from === to) return;
    const next = [...prev];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    subjectsRef.current = next;
    setSubjects(next);
  }, []);

  /** 핸들을 잡는 순간 — 놓을 때 비교할 순서를 기억한다. */
  const startReorder = useCallback(() => {
    dragBaseRef.current = subjectsRef.current.map((subject) => subject.id);
  }, []);

  /**
   * 드래그가 끝날 때 1회. 잡았을 때와 순서가 다르면 전체 순서를 PUT하고, 실패는 다른 변경과 같이 토스트 +
   * 서버 값 복원. 응답 목록은 쓰지 않는다 — 놓은 직후의 낙관 편집을 덮지 않게(204여도 안전).
   */
  const commitReorder = useCallback((): Promise<void> => {
    const base = dragBaseRef.current;
    dragBaseRef.current = null;
    const ids = subjectsRef.current.map((subject) => subject.id);
    const unchanged =
      base === null || (base.length === ids.length && base.every((id, index) => id === ids[index]));
    if (unchanged) {
      return Promise.resolve();
    }
    return mutate(
      (prev) => prev,
      () => reorderSubjects({ subjectIds: ids }),
    );
  }, [mutate]);

  return {
    subjects,
    status,
    reload,
    addSubject,
    addTask,
    reorderSubject,
    startReorder,
    commitReorder,
    renameSubject: (id: number, name: string) =>
      mutate(
        (prev) => prev.map((subject) => (subject.id === id ? { ...subject, name } : subject)),
        () => renameSubject(id, { name }),
      ),
    removeSubject: (id: number) =>
      mutate(
        (prev) => prev.filter((subject) => subject.id !== id),
        () => deleteSubject(id),
      ),
    renameTask: (subjectId: number, taskId: number, name: string) =>
      mutate(patchTask(subjectId, taskId, { name }), () => updateTask(subjectId, taskId, { name })),
    toggleTask: (subjectId: number, taskId: number, done: boolean) =>
      mutate(
        // 완료 시각은 서버가 정한다 — 화면은 '완료됨'만 먼저 보여주고 응답 값으로 맞춘다.
        patchTask(subjectId, taskId, { doneAt: done ? new Date().toISOString() : null }),
        async () => {
          const updated = await updateTask(subjectId, taskId, { done });
          setSubjects(patchTask(subjectId, taskId, { doneAt: updated.doneAt }));
        },
      ),
    removeTask: (subjectId: number, taskId: number) =>
      mutate(
        (prev) =>
          prev.map((subject) =>
            subject.id === subjectId
              ? { ...subject, tasks: subject.tasks.filter((task) => task.id !== taskId) }
              : subject,
          ),
        () => deleteTask(subjectId, taskId),
      ),
  };
}

export type SubjectsStore = ReturnType<typeof useSubjects>;
