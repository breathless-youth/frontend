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
