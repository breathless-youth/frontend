import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStudyRoomSession } from "../useStudyRoomSession";

function requestBodies(method: "PUT" | "POST") {
  return vi
    .mocked(fetch)
    .mock.calls.filter(([, init]) => (init as RequestInit).method === method)
    .map(([, init]) => JSON.parse((init as RequestInit).body as string) as Record<string, unknown>);
}

describe("useStudyRoomSession 측정 방식", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve([]) }),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("타이머 세션은 스냅샷과 제출에 TIMER를 싣고 감지 신호가 없어 순공이 총 공부와 같다", async () => {
    const hook = renderHook(() => useStudyRoomSession(1, { source: "TIMER" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });
    await act(async () => {
      await hook.result.current.endAndSubmit();
    });

    expect(requestBodies("PUT")[0]).toMatchObject({ source: "TIMER" });
    const [submitted] = requestBodies("POST");
    expect(submitted).toMatchObject({ source: "TIMER", studySec: 90 });
    expect(submitted!.focusSec).toBe(submitted!.studySec);
  });

  it("옵션이 없으면 카메라 세션이라 요청에 측정 방식을 싣지 않는다", async () => {
    const hook = renderHook(() => useStudyRoomSession(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    await act(async () => {
      await hook.result.current.endAndSubmit();
    });

    expect(requestBodies("PUT")[0]).not.toHaveProperty("source");
    expect(requestBodies("POST")[0]).not.toHaveProperty("source");
  });
});
