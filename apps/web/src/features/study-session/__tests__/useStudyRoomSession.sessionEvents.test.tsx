import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStudyRoomSession } from "../useStudyRoomSession";

describe("useStudyRoomSession 화면용 이벤트 목록", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("일시정지하면 PAUSE 이벤트가 생기고 재개하면 닫힌다", async () => {
    const hook = renderHook(() => useStudyRoomSession(7));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(hook.result.current.sessionEvents.some((e) => e.status === "PAUSE")).toBe(false);

    await act(async () => {
      hook.result.current.pause();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    const paused = hook.result.current.sessionEvents.filter((e) => e.status === "PAUSE");
    expect(paused).toHaveLength(1);

    await act(async () => {
      hook.result.current.resume();
    });
    const atResume = hook.result.current.sessionEvents.filter((e) => e.status === "PAUSE");
    expect(atResume).toHaveLength(1);
    const endedAtAtResume = atResume[0]!.endedAt;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    const later = hook.result.current.sessionEvents.filter((e) => e.status === "PAUSE");
    expect(later).toHaveLength(1);
    expect(later[0]!.endedAt).toBe(endedAtAtResume);
  });

  it("종료하면 PAUSE 이벤트가 종료 시각에서 닫히고 그 뒤 렌더에도 늘어나지 않는다", async () => {
    const hook = renderHook(() => useStudyRoomSession(null));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await act(async () => {
      hook.result.current.pause();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await act(async () => {
      await hook.result.current.endAndSubmit();
    });
    const atEnd = hook.result.current.sessionEvents.filter((e) => e.status === "PAUSE");
    expect(atEnd).toHaveLength(1);
    const endedAtAtEnd = atEnd[0]!.endedAt;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    await act(async () => {
      hook.result.current.selectSubject(1);
    });
    const later = hook.result.current.sessionEvents.filter((e) => e.status === "PAUSE");
    expect(later).toHaveLength(1);
    expect(later[0]!.endedAt).toBe(endedAtAtEnd);
  });
});
