import { useCallback, useEffect, useRef, useState } from "react";

import type { SubjectResponse, TaskResponse } from "@focusmakers/types";

import { trackSubjectItemAdded } from "@/lib/amplitude";
import {
  createSubject,
  createTask,
  deleteSubject,
  deleteTask,
  listSubjects,
  renameSubject,
  updateTask,
} from "@/lib/subjectApi";

import { SUBJECT_SHEET_COPY } from "./sessionCopy";

export type SubjectsStatus = "idle" | "loading" | "ready" | "error";

/**
 * 과목 시트의 서버 상태. react-query를 쓰지 않는 이유: 세션 화면(`RoomPage`)은
 * 스터디룸 테스트 전부가 Provider 없이 렌더하는 라우트고, 이 목록은 시트를 열 때 한 번 받아
 * 세션 동안 들고 있으면 충분하다.
 *
 * 변경은 화면에 먼저 반영하고(이름·완료·삭제) 실패하면 토스트 뒤 서버 값으로 되돌린다(스펙 §6).
 * 추가만은 서버 응답을 기다린다 — 임시 id로 만든 항목을 고르면 스냅샷에 가짜 id가 실린다.
 */
export function useSubjects(enabled: boolean, onError: (message: string) => void) {
  const [subjects, setSubjects] = useState<SubjectResponse[]>([]);
  const [status, setStatus] = useState<SubjectsStatus>("idle");
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const reload = useCallback(async () => {
    // 재조회는 이미 보이는 목록을 비우지 않는다 — 실패 복구 중에 화면이 깜빡이지 않게.
    setStatus((prev) => (prev === "ready" ? prev : "loading"));
    try {
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

  return {
    subjects,
    status,
    reload,
    addSubject,
    addTask,
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
