import { StrictMode } from "react";

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";

import { useActiveSessionRestore } from "../useActiveSessionRestore";

const restoreActiveSession = vi.hoisted(() => vi.fn());
const reportHandled = vi.hoisted(() => vi.fn());

vi.mock("../restoreActiveSession", () => ({ restoreActiveSession }));
vi.mock("@/lib/sentry", () => ({ reportHandled }));

const RESTORED = {
  startedAtMs: Date.UTC(2026, 7, 28, 1, 0, 0),
  reportedAtMs: Date.UTC(2026, 7, 28, 1, 32, 0),
  baseStudySec: 1850,
  baseFocusSec: 1620,
  events: [],
};

describe("useActiveSessionRestore", () => {
  beforeEach(() => {
    restoreActiveSession.mockReset();
    reportHandled.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("userId가 없으면 조회 없이 즉시 결착한다", () => {
    const { result } = renderHook(() => useActiveSessionRestore(null));

    expect(result.current).toEqual({ settled: true, restored: null });
    expect(restoreActiveSession).not.toHaveBeenCalled();
  });

  it("조회가 끝나기 전에는 결착하지 않는다", () => {
    restoreActiveSession.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useActiveSessionRestore(7));

    expect(result.current.settled).toBe(false);
  });

  it("200이면 복원값과 함께 결착한다", async () => {
    restoreActiveSession.mockResolvedValue(RESTORED);

    const { result } = renderHook(() => useActiveSessionRestore(7));

    await waitFor(() => {
      expect(result.current.settled).toBe(true);
    });
    expect(result.current.restored).toEqual(RESTORED);
  });

  it("404면 복원값 없이 결착한다", async () => {
    restoreActiveSession.mockResolvedValue(null);

    const { result } = renderHook(() => useActiveSessionRestore(7));

    await waitFor(() => {
      expect(result.current.settled).toBe(true);
    });
    expect(result.current.restored).toBeNull();
  });

  it("네트워크 실패는 2회까지 다시 시도하고 그 뒤 결착한다", async () => {
    vi.useFakeTimers();
    restoreActiveSession.mockRejectedValue(new Error("네트워크"));

    const { result } = renderHook(() => useActiveSessionRestore(7));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(restoreActiveSession).toHaveBeenCalledTimes(3);
    expect(result.current).toEqual({ settled: true, restored: null });
  });

  it("400은 다시 시도하지 않고 결착하며 Sentry에 남긴다", async () => {
    restoreActiveSession.mockRejectedValue(new ApiError("검증 실패", 400));

    const { result } = renderHook(() => useActiveSessionRestore(7));

    await waitFor(() => {
      expect(result.current.settled).toBe(true);
    });
    expect(restoreActiveSession).toHaveBeenCalledTimes(1);
    expect(reportHandled).toHaveBeenCalledTimes(1);
  });

  it("409도 다시 시도하지 않는다", async () => {
    restoreActiveSession.mockRejectedValue(new ApiError("충돌", 409));

    const { result } = renderHook(() => useActiveSessionRestore(7));

    await waitFor(() => {
      expect(result.current.settled).toBe(true);
    });
    expect(restoreActiveSession).toHaveBeenCalledTimes(1);
  });

  it("StrictMode의 이중 마운트에서도 결착한다", async () => {
    restoreActiveSession.mockResolvedValue(RESTORED);

    const { result } = renderHook(() => useActiveSessionRestore(7), { wrapper: StrictMode });

    await waitFor(() => {
      expect(result.current.settled).toBe(true);
    });
    expect(result.current.restored).toEqual(RESTORED);
  });

  it("userId가 바뀌면 다시 조회한다", async () => {
    restoreActiveSession.mockResolvedValue(RESTORED);

    const { result, rerender } = renderHook(({ id }) => useActiveSessionRestore(id), {
      initialProps: { id: 7 },
    });
    await waitFor(() => {
      expect(result.current.settled).toBe(true);
    });

    restoreActiveSession.mockClear();
    rerender({ id: 9 });

    await waitFor(() => {
      expect(restoreActiveSession).toHaveBeenCalledWith(9);
    });
  });

  it("언마운트하면 재시도를 멈춘다", async () => {
    vi.useFakeTimers();
    restoreActiveSession.mockRejectedValue(new Error("네트워크"));

    const { unmount } = renderHook(() => useActiveSessionRestore(7));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(restoreActiveSession).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(restoreActiveSession).toHaveBeenCalledTimes(1);
  });

  it("userId가 바뀐 직후 렌더에서는 앞 사용자의 결과를 내주지 않는다", async () => {
    restoreActiveSession.mockResolvedValue(RESTORED);
    // effect가 돌기 전 렌더도 봐야 한다. 그 한 번에 새 사용자 화면이 만들어지면서 앞 사용자의
    // 세션을 이어받는다. rerender는 effect까지 흘려보내므로 렌더별 반환값을 따로 모은다.
    const seen: { id: number; settled: boolean; restored: unknown }[] = [];

    const { rerender } = renderHook(
      ({ id }) => {
        const state = useActiveSessionRestore(id);
        seen.push({ id, ...state });
        return state;
      },
      { initialProps: { id: 7 } },
    );
    await waitFor(() => {
      expect(seen.some((entry) => entry.settled)).toBe(true);
    });

    rerender({ id: 9 });

    const leaked = seen.filter((entry) => entry.id === 9 && entry.restored !== null);
    expect(leaked).toEqual([]);
  });
});
