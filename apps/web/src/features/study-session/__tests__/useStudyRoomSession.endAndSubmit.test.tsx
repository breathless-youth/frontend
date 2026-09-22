import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryClient } from "@/lib/queryClient";
import { statsKeys } from "@/lib/statsQueries";

import { submitStudySession } from "../submitStudySession";
import { useStudyRoomSession } from "../useStudyRoomSession";

vi.mock("../submitStudySession", () => ({ submitStudySession: vi.fn() }));

beforeEach(() => {
  vi.mocked(submitStudySession).mockReset();
});

describe("endAndSubmit 중복 호출", () => {
  it("제출 진행 중 재호출은 제출을 다시 보내지 않는다", async () => {
    let release = () => {};
    vi.mocked(submitStudySession).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve([]);
        }),
    );
    const hook = renderHook(() => useStudyRoomSession(7));
    await act(async () => {
      void hook.result.current.endAndSubmit();
      void hook.result.current.endAndSubmit();
    });
    expect(vi.mocked(submitStudySession)).toHaveBeenCalledTimes(1);
    await act(async () => {
      release();
    });
    expect(hook.result.current.phase.name).toBe("done");
  });

  it("실패 후 재호출(다시 제출)은 정상 동작한다", async () => {
    vi.mocked(submitStudySession).mockRejectedValueOnce(new Error("네트워크"));
    vi.mocked(submitStudySession).mockResolvedValueOnce([]);
    const hook = renderHook(() => useStudyRoomSession(7));
    await act(async () => {
      await hook.result.current.endAndSubmit();
    });
    expect(hook.result.current.phase.name).toBe("error");
    await act(async () => {
      await hook.result.current.endAndSubmit();
    });
    expect(hook.result.current.phase.name).toBe("done");
    expect(vi.mocked(submitStudySession)).toHaveBeenCalledTimes(2);
  });
});

describe("완료 할 일 전달 (BY-725)", () => {
  it("제출 직전에 훅의 세션 시작 시각으로 콜백을 부르고 결과를 completedTaskIds로 싣는다", async () => {
    vi.mocked(submitStudySession).mockResolvedValueOnce([]);
    const getCompletedTaskIds = vi.fn(() => [5, 9]);
    const hook = renderHook(() => useStudyRoomSession(7, { getCompletedTaskIds }));
    await act(async () => {
      await hook.result.current.endAndSubmit();
    });
    const input = vi.mocked(submitStudySession).mock.calls[0]![0];
    expect(getCompletedTaskIds).toHaveBeenCalledWith(input.startedAtMs);
    expect(input.completedTaskIds).toEqual([5, 9]);
  });

  it("렌더마다 바뀐 콜백을 제출 시점에 쓴다 — stale closure가 없다", async () => {
    vi.mocked(submitStudySession).mockResolvedValueOnce([]);
    const first = vi.fn(() => [1]);
    const second = vi.fn(() => [2]);
    const hook = renderHook(
      ({ cb }: { cb: (startedAtMs: number) => number[] }) =>
        useStudyRoomSession(7, { getCompletedTaskIds: cb }),
      { initialProps: { cb: first } },
    );
    hook.rerender({ cb: second });
    await act(async () => {
      await hook.result.current.endAndSubmit();
    });
    expect(first).not.toHaveBeenCalled();
    expect(vi.mocked(submitStudySession).mock.calls[0]![0].completedTaskIds).toEqual([2]);
  });

  it("옵션이 없으면 completedTaskIds를 넘기지 않는다(소셜룸 등)", async () => {
    vi.mocked(submitStudySession).mockResolvedValueOnce([]);
    const hook = renderHook(() => useStudyRoomSession(7));
    await act(async () => {
      await hook.result.current.endAndSubmit();
    });
    expect(vi.mocked(submitStudySession).mock.calls[0]![0].completedTaskIds).toBeUndefined();
  });
});

describe("제출 성공 후 통계 무효화", () => {
  it("성공하면 statsKeys.all을 한 번 무효화한다", async () => {
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    vi.mocked(submitStudySession).mockResolvedValueOnce([]);
    const hook = renderHook(() => useStudyRoomSession(7));
    await act(async () => {
      await hook.result.current.endAndSubmit();
    });
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: statsKeys.all });
    invalidate.mockRestore();
  });

  it("실패하면 무효화하지 않는다", async () => {
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    vi.mocked(submitStudySession).mockRejectedValueOnce(new Error("네트워크"));
    const hook = renderHook(() => useStudyRoomSession(7));
    await act(async () => {
      await hook.result.current.endAndSubmit();
    });
    expect(invalidate).not.toHaveBeenCalled();
    invalidate.mockRestore();
  });
});
