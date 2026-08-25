import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listCheckpoints } from "../sessionCheckpoint";
import { submitStudySession } from "../submitStudySession";
import { useStudyRoomSession } from "../useStudyRoomSession";

vi.mock("../submitStudySession", () => ({ submitStudySession: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useStudyRoomSession — 체크포인트", () => {
  it("측정 10초 경과마다 체크포인트가 저장된다", () => {
    renderHook(() => useStudyRoomSession(7));

    act(() => {
      vi.advanceTimersByTime(10_200);
    });

    const [record] = listCheckpoints();
    expect(record?.userId).toBe(7);
    expect(record?.lastSeenMs).toBeGreaterThan(record?.startedAtMs ?? 0);
  });

  it("상태 전이(일시정지) 시에도 즉시 저장된다", () => {
    const hook = renderHook(() => useStudyRoomSession(7));

    act(() => {
      vi.advanceTimersByTime(1_000);
      hook.result.current.pause("MANUAL");
    });

    expect(listCheckpoints()).toHaveLength(1);
  });

  it("userId가 없으면 저장하지 않는다", () => {
    renderHook(() => useStudyRoomSession(null));

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(listCheckpoints()).toEqual([]);
  });

  it("제출 성공 시 체크포인트가 삭제된다", async () => {
    vi.mocked(submitStudySession).mockResolvedValue([]);
    const hook = renderHook(() => useStudyRoomSession(7));
    act(() => {
      vi.advanceTimersByTime(10_200);
    });
    expect(listCheckpoints()).toHaveLength(1);

    await act(async () => {
      await hook.result.current.endAndSubmit();
    });

    expect(listCheckpoints()).toEqual([]);
  });

  it("제출 실패 시 체크포인트가 종료 시점 값으로 남는다", async () => {
    vi.mocked(submitStudySession).mockRejectedValue(new Error("네트워크"));
    const hook = renderHook(() => useStudyRoomSession(7));
    act(() => {
      vi.advanceTimersByTime(10_200);
    });

    await act(async () => {
      await hook.result.current.endAndSubmit();
    });

    const [record] = listCheckpoints();
    expect(record).toBeDefined();
    expect(record?.lastSeenMs).toBeGreaterThanOrEqual((record?.startedAtMs ?? 0) + 10_200);
  });

  it("10초 주기가 오기 전에 종료해도 제출 직전 스냅샷이 저장된다", async () => {
    vi.mocked(submitStudySession).mockRejectedValue(new Error("네트워크"));
    const hook = renderHook(() => useStudyRoomSession(7));
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(listCheckpoints()).toEqual([]);

    await act(async () => {
      await hook.result.current.endAndSubmit();
    });

    const [record] = listCheckpoints();
    expect(record?.lastSeenMs).toBe((record?.startedAtMs ?? 0) + 3_000);
  });
});
