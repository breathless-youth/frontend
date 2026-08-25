import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
