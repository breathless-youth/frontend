import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SubjectResponse } from "@focusmakers/types";

import { listSubjects, reorderSubjects } from "@/lib/subjectApi";

import { SUBJECT_SHEET_COPY } from "../sessionCopy";
import { useSubjects } from "../useSubjects";

vi.mock("@/lib/subjectApi", () => ({
  listSubjects: vi.fn(),
  createSubject: vi.fn(),
  renameSubject: vi.fn(),
  deleteSubject: vi.fn(),
  reorderSubjects: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}));
vi.mock("@/lib/amplitude", () => ({ trackSubjectItemAdded: vi.fn() }));

function subject(id: number): SubjectResponse {
  return { id, name: `과목${id}`, colorIndex: id, studySec: 0, focusSec: 0, tasks: [] };
}

/** 서버가 저장된 순서로 내려주는 목록 — 여기서는 id 순이 아니다. */
const SERVER_ORDER = [subject(2), subject(1), subject(3)];

async function renderReady() {
  const onError = vi.fn();
  const hook = renderHook(() => useSubjects(true, onError));
  await waitFor(() => {
    expect(hook.result.current.status).toBe("ready");
  });
  return { hook, onError };
}

function ids(hook: ReturnType<typeof renderHook<ReturnType<typeof useSubjects>, unknown>>) {
  return hook.result.current.subjects.map((s) => s.id);
}

describe("useSubjects 순서 (BY-725)", () => {
  beforeEach(() => {
    vi.mocked(listSubjects).mockReset();
    vi.mocked(reorderSubjects).mockReset();
    vi.mocked(listSubjects).mockResolvedValue(SERVER_ORDER);
    vi.mocked(reorderSubjects).mockResolvedValue([]);
    localStorage.clear();
  });

  it("서버 순서를 그대로 쓰고 기기(localStorage)에는 순서를 남기지 않는다", async () => {
    const { hook } = await renderReady();

    expect(ids(hook)).toEqual([2, 1, 3]);
    expect(Object.keys(localStorage).filter((key) => key.includes("subjectOrder"))).toEqual([]);
  });

  it("드래그 중 자리 바꿈은 화면에만 반영하고, 놓을 때 순서가 바뀌었으면 전체 순서를 한 번 보낸다", async () => {
    const { hook } = await renderReady();

    act(() => {
      hook.result.current.startReorder();
      hook.result.current.reorderSubject(2, 1); // [1, 2, 3]
      hook.result.current.reorderSubject(2, 3); // [1, 3, 2]
    });
    expect(reorderSubjects).not.toHaveBeenCalled();
    expect(ids(hook)).toEqual([1, 3, 2]);

    await act(async () => {
      await hook.result.current.commitReorder();
    });

    expect(reorderSubjects).toHaveBeenCalledTimes(1);
    expect(reorderSubjects).toHaveBeenCalledWith({ subjectIds: [1, 3, 2] });
    // 응답 목록은 쓰지 않는다 — 화면 순서가 그대로다.
    expect(ids(hook)).toEqual([1, 3, 2]);
  });

  it("렌더 전에 연달아 온 자리 바꿈도 놓는 순간의 순서로 보낸다", async () => {
    const { hook } = await renderReady();

    // 같은 act 안이라 setState는 아직 렌더되지 않았다 — ref가 최신 순서를 든다.
    await act(async () => {
      hook.result.current.startReorder();
      hook.result.current.reorderSubject(3, 2); // [3, 2, 1]
      await hook.result.current.commitReorder();
    });

    expect(reorderSubjects).toHaveBeenCalledWith({ subjectIds: [3, 2, 1] });
  });

  it("제자리로 돌아와 놓으면 보내지 않는다", async () => {
    const { hook } = await renderReady();

    await act(async () => {
      hook.result.current.startReorder();
      hook.result.current.reorderSubject(2, 1); // [1, 2, 3]
      hook.result.current.reorderSubject(2, 1); // [2, 1, 3]
      await hook.result.current.commitReorder();
    });

    expect(reorderSubjects).not.toHaveBeenCalled();
  });

  it("잡지 않고 놓으면(pointercancel 등) 보내지 않는다", async () => {
    const { hook } = await renderReady();

    await act(async () => {
      await hook.result.current.commitReorder();
    });

    expect(reorderSubjects).not.toHaveBeenCalled();
  });

  it("저장에 실패하면 토스트 뒤 서버 순서로 되돌린다", async () => {
    vi.mocked(reorderSubjects).mockRejectedValue(new Error("네트워크"));
    const { hook, onError } = await renderReady();

    await act(async () => {
      hook.result.current.startReorder();
      hook.result.current.reorderSubject(2, 3); // [1, 3, 2]
      await hook.result.current.commitReorder();
    });

    expect(onError).toHaveBeenCalledWith(SUBJECT_SHEET_COPY.saveFailed);
    await waitFor(() => {
      expect(listSubjects).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(ids(hook)).toEqual([2, 1, 3]);
    });
  });
});
