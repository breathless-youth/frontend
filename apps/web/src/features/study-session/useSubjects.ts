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
 * 과목 순서 — 서버 계약에 정렬 필드가 없어 **이 기기에만** 남긴다(localStorage). 재설치·기기
 * 변경 뒤에는 서버 순서(id 오름차순)로 돌아온다. 백엔드에 sortOrder가 생기면 이 두 함수만
 * 서버 호출로 바꾼다. 저장소는 프라이빗 모드 등에서 던질 수 있어 전부 try/catch다.
 */
function readSavedOrder(key: string | null): number[] {
  if (key === null) return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is number => typeof id === "number") : [];
  } catch {
    return [];
  }
}

function saveOrder(key: string | null, subjects: readonly SubjectResponse[]) {
  if (key === null) return;
  try {
    localStorage.setItem(key, JSON.stringify(subjects.map((subject) => subject.id)));
  } catch {
    // 저장 못 해도 화면 순서는 이번 세션 동안 유지된다.
  }
}

/** 저장된 순서대로 정렬하고, 모르는(새) 과목은 서버 순서 그대로 뒤에 둔다. */
function applySavedOrder(subjects: SubjectResponse[], order: number[]): SubjectResponse[] {
  if (order.length === 0) return subjects;
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...subjects].sort(
    (a, b) =>
      (rank.get(a.id) ?? Number.POSITIVE_INFINITY) - (rank.get(b.id) ?? Number.POSITIVE_INFINITY),
  );
}

/**
 * 과목 시트의 서버 상태. react-query를 쓰지 않는 이유: 세션 화면(`RoomPage`)은
 * 스터디룸 테스트 전부가 Provider 없이 렌더하는 라우트고, 이 목록은 시트를 열 때 한 번 받아
 * 세션 동안 들고 있으면 충분하다.
 *
 * 변경은 화면에 먼저 반영하고(이름·완료·삭제) 실패하면 토스트 뒤 서버 값으로 되돌린다(스펙 §6).
 * 추가만은 서버 응답을 기다린다 — 임시 id로 만든 항목을 고르면 스냅샷에 가짜 id가 실린다.
 */
export function useSubjects(
  enabled: boolean,
  onError: (message: string) => void,
  /** 순서를 저장할 localStorage 키 — 사용자별로 갈라 남긴다. null이면 저장하지 않는다. */
  orderKey: string | null = null,
) {
  const [subjects, setSubjects] = useState<SubjectResponse[]>([]);
  const [status, setStatus] = useState<SubjectsStatus>("idle");
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const reload = useCallback(async () => {
    // 재조회는 이미 보이는 목록을 비우지 않는다 — 실패 복구 중에 화면이 깜빡이지 않게.
    setStatus((prev) => (prev === "ready" ? prev : "loading"));
    try {
      setSubjects(applySavedOrder(await listSubjects(), readSavedOrder(orderKey)));
      setStatus("ready");
    } catch {
      setStatus("error");
      onErrorRef.current(SUBJECT_SHEET_COPY.loadFailed);
    }
  }, [orderKey]);

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

  /** 핸들 드래그 — `fromId` 과목을 `overId` 과목 자리로 옮긴다. 서버 요청 없음(위 주석). */
  const reorderSubject = useCallback(
    (fromId: number, overId: number) => {
      setSubjects((prev) => {
        const from = prev.findIndex((subject) => subject.id === fromId);
        const to = prev.findIndex((subject) => subject.id === overId);
        if (from === -1 || to === -1 || from === to) return prev;
        const next = [...prev];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved!);
        saveOrder(orderKey, next);
        return next;
      });
    },
    [orderKey],
  );

  return {
    subjects,
    status,
    reload,
    addSubject,
    addTask,
    reorderSubject,
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
