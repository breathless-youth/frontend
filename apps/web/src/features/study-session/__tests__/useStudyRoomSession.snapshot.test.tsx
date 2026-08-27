import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStudyRoomSession } from "../useStudyRoomSession";

function stubFetch(response: { ok: boolean; status?: number; message?: string }) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: response.ok,
      status: response.status ?? (response.ok ? 204 : 400),
      json: () => Promise.resolve({ message: response.message ?? "" }),
    }),
  );
}

/** studying 동안만 도는 스냅샷 보고를 fake timer로 검증한다. */
describe("useStudyRoomSession 스냅샷 보고", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("첫 보고는 t=30에 나가고 이후 30초마다 반복한다", async () => {
    stubFetch({ ok: true });
    renderHook(() => useStudyRoomSession(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_000);
    });
    expect(fetch).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
    expect(String(vi.mocked(fetch).mock.calls[0]![0])).toMatch(/\/api\/study-sessions\/active$/);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(vi.mocked(fetch).mock.calls).toHaveLength(2);
  });

  it("userId가 null이면 보고하지 않는다", async () => {
    stubFetch({ ok: true });
    renderHook(() => useStudyRoomSession(null));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("400을 받으면 그 세션 보고를 멈춘다", async () => {
    stubFetch({ ok: false, status: 400, message: "검증 실패" });
    renderHook(() => useStudyRoomSession(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
  });

  it("409를 받으면 그 세션 보고를 멈춘다 — 세션이 이미 확정된 상태다", async () => {
    stubFetch({ ok: false, status: 409, message: "conflict" });
    renderHook(() => useStudyRoomSession(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
  });

  it("404를 받으면 그 세션 보고를 멈춘다", async () => {
    stubFetch({ ok: false, status: 404, message: "없는 유저" });
    renderHook(() => useStudyRoomSession(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
  });

  it("5xx를 받으면 다음 주기에 다시 보고한다 — 일시 장애로 본다", async () => {
    stubFetch({ ok: false, status: 500, message: "server" });
    renderHook(() => useStudyRoomSession(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(vi.mocked(fetch).mock.calls).toHaveLength(2);
  });

  it("네트워크 실패 이후에는 다음 주기에 다시 보고한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
    renderHook(() => useStudyRoomSession(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(vi.mocked(fetch).mock.calls).toHaveLength(2);
  });

  it("보고 요청이 매달리면 상한 뒤 다음 주기에 다시 보낸다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      ),
    );
    renderHook(() => useStudyRoomSession(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1);

    // 20초 상한에서 중단돼 in-flight가 풀리고, 다음 30초 tick에서 다시 보낸다.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(vi.mocked(fetch).mock.calls).toHaveLength(2);
  });

  it("종료(언마운트)되면 보고 interval을 멈춘다", async () => {
    stubFetch({ ok: true });
    const { unmount } = renderHook(() => useStudyRoomSession(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
  });

  it("세션 기록을 localStorage에 쓰지 않는다", async () => {
    stubFetch({ ok: true });
    renderHook(() => useStudyRoomSession(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });

    const wroteSession = Object.keys(localStorage).some((key) =>
      key.startsWith("focusmakers.pendingSession"),
    );
    expect(wroteSession).toBe(false);
  });
});
