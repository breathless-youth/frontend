import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RestoredSession } from "@/features/study-session/restoreActiveSession";
import type * as userIdModule from "@/lib/userId";

import { useSessionGate } from "../useSessionGate";

const identity = vi.hoisted(() => ({ pending: false, userId: 7 as number | null }));
vi.mock("@/lib/userId", async (original) => ({
  ...(await original<typeof userIdModule>()),
  useIdentityPending: () => identity.pending,
  useUserId: () => identity.userId,
}));
const restore = vi.hoisted(() => ({
  state: { settled: true, restored: null as RestoredSession | null, failed: false },
}));
vi.mock("@/features/study-session/useActiveSessionRestore", () => ({
  useActiveSessionRestore: () => restore.state,
}));
const listSubjects = vi.hoisted(() => vi.fn());
vi.mock("@/lib/subjectApi", () => ({ listSubjects }));

const RESTORED: RestoredSession = {
  startedAtMs: Date.UTC(2026, 10, 20, 1, 0, 0),
  reportedAtMs: Date.UTC(2026, 10, 20, 1, 30, 0),
  baseStudySec: 1800,
  baseFocusSec: 1500,
  events: [],
};

beforeEach(() => {
  identity.pending = false;
  identity.userId = 7;
  restore.state = { settled: true, restored: null, failed: false };
  listSubjects.mockReset();
  listSubjects.mockResolvedValue([
    { id: 3, name: "수학", colorIndex: 0, studySec: 0, focusSec: 0, tasks: [] },
  ]);
});

describe("useSessionGate", () => {
  it("신원을 기다리는 동안은 준비되지 않고 과목도 확인하지 않는다", () => {
    identity.pending = true;

    const { result } = renderHook(() => useSessionGate(3));

    expect(result.current.ready).toBe(false);
    expect(listSubjects).not.toHaveBeenCalled();
  });

  it("서버 진행 기록 조회가 끝나지 않으면 준비되지 않는다", () => {
    restore.state = { settled: false, restored: null, failed: false };

    const { result } = renderHook(() => useSessionGate(undefined));

    expect(result.current.ready).toBe(false);
  });

  it("처음 과목은 목록에서 확인한 뒤에 넘긴다", async () => {
    const { result } = renderHook(() => useSessionGate(3));

    expect(result.current.ready).toBe(false);
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.initialSubjectId).toBe(3);
    expect(result.current.userId).toBe(7);
  });

  it("이미 확인한 과목은 목록을 다시 받지 않고 바로 넘긴다", () => {
    const { result } = renderHook(() => useSessionGate(3, true));

    expect(result.current.ready).toBe(true);
    expect(result.current.initialSubjectId).toBe(3);
    expect(listSubjects).not.toHaveBeenCalled();
  });

  it("이어 갈 세션이 있으면 처음 과목을 쓰지 않는다", () => {
    restore.state = { settled: true, restored: RESTORED, failed: false };

    const { result } = renderHook(() => useSessionGate(3, true));

    expect(result.current.ready).toBe(true);
    expect(result.current.restored).toBe(RESTORED);
    expect(result.current.initialSubjectId).toBeUndefined();
  });

  it("과목 확인이 실패하면 준비되지 않고 다시 시도할 수 있다", async () => {
    listSubjects.mockRejectedValueOnce(new Error("offline"));

    const { result } = renderHook(() => useSessionGate(3));

    await waitFor(() => expect(result.current.subjectError).toBe(true));
    expect(result.current.ready).toBe(false);
    result.current.retrySubject();
    await waitFor(() => expect(result.current.ready).toBe(true));
  });

  it("진행 기록 조회가 실패했으면 기록이 없다고 단정하지 않게 알린다", () => {
    restore.state = { settled: true, restored: null, failed: true };

    const { result } = renderHook(() => useSessionGate(undefined));

    expect(result.current.ready).toBe(true);
    expect(result.current.restored).toBeNull();
    expect(result.current.restoreFailed).toBe(true);
  });
});
