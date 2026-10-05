import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SubjectResponse } from "@focusmakers/types";

import { ApiError } from "@/lib/api";
import { trackSubjectItemAdded } from "@/lib/amplitude";
import { createSubject, listSubjects, renameSubject, reorderSubjects } from "@/lib/subjectApi";

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

describe("useSubjects 이름 중복", () => {
  beforeEach(() => {
    vi.mocked(listSubjects).mockReset();
    vi.mocked(createSubject).mockReset();
    vi.mocked(renameSubject).mockReset();
    vi.mocked(listSubjects).mockResolvedValue(SERVER_ORDER);
  });

  it("이미 있는 이름으로는 과목을 만들지 않고 안내한다", async () => {
    const { hook, onError } = await renderReady();

    let created: SubjectResponse | null = subject(9);
    await act(async () => {
      created = await hook.result.current.addSubject(" 과목1 ");
    });

    expect(created).toBeNull();
    expect(createSubject).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(SUBJECT_SHEET_COPY.duplicateName);
  });

  it("다른 과목이 쓰는 이름으로는 바꾸지 않고, 서버가 409로 거절해도 같은 안내를 한다", async () => {
    const { hook, onError } = await renderReady();

    await act(async () => {
      await hook.result.current.renameSubject(2, "과목1");
    });
    expect(renameSubject).not.toHaveBeenCalled();
    expect(onError).toHaveBeenLastCalledWith(SUBJECT_SHEET_COPY.duplicateName);

    // 목록이 낡아 화면 검사를 지나친 경우 — 서버 거절을 같은 문구로 알린다.
    onError.mockClear();
    vi.mocked(renameSubject).mockRejectedValue(
      new ApiError("이미 있는 과목 이름입니다", 409, "CONFLICT"),
    );
    await act(async () => {
      await hook.result.current.renameSubject(2, "새 이름");
    });
    expect(onError).toHaveBeenCalledWith(SUBJECT_SHEET_COPY.duplicateName);
  });

  it("같은 이름이 이미 둘인 과목도 지금 이름 그대로는 서버에 보낸다", async () => {
    vi.mocked(listSubjects).mockResolvedValue([subject(1), { ...subject(2), name: "과목1" }]);
    vi.mocked(renameSubject).mockResolvedValue(subject(1));
    const { hook, onError } = await renderReady();

    await act(async () => {
      await hook.result.current.renameSubject(1, "과목1");
    });

    expect(renameSubject).toHaveBeenCalledWith(1, { name: "과목1" });
    expect(onError).not.toHaveBeenCalled();
  });

  it("과목 추가와 이름 변경은 앞뒤 공백을 뗀 이름으로 요청한다", async () => {
    vi.mocked(createSubject).mockResolvedValue({ ...subject(7), name: "국어" });
    vi.mocked(renameSubject).mockResolvedValue({ ...subject(1), name: "영어" });
    const { hook } = await renderReady();

    await act(async () => {
      await hook.result.current.addSubject("  국어 ");
      await hook.result.current.renameSubject(1, " 영어  ");
    });

    expect(createSubject).toHaveBeenCalledWith({ name: "국어" });
    // 화면을 따로 알리지 않으면 과목 시트에서 만든 것으로 센다.
    expect(vi.mocked(trackSubjectItemAdded)).toHaveBeenCalledWith("subject", false, "sheet");
    expect(renameSubject).toHaveBeenCalledWith(1, { name: "영어" });
    expect(hook.result.current.subjects.find((item) => item.id === 1)?.name).toBe("영어");
  });

  it("서버가 되살려 준 과목은 예전 id 그대로 목록 끝에 한 번만 들어간다", async () => {
    const { hook } = await renderReady();
    vi.mocked(createSubject).mockResolvedValue({ ...subject(7), name: "국어", studySec: 600 });

    await act(async () => {
      await hook.result.current.addSubject("국어");
    });

    expect(ids(hook)).toEqual([2, 1, 3, 7]);
    expect(hook.result.current.subjects.at(-1)?.studySec).toBe(600);
  });
});
