import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockSystemPauseSource } from "../adapters/systemPauseSource";
import { DEFAULT_SESSION_TUNING, GROUP_ROOM_SESSION_TUNING } from "../sessionTuning";
import type { SessionTuningConfig } from "../sessionTuning";
import { useStudyRoomSession } from "../useStudyRoomSession";

const NOW = Date.UTC(2026, 10, 4, 1, 0, 0);

/** 비로그인 세션이라 제출하지 않고 끝난 값만 남는다. */
function renderSession({ tuning }: { tuning: SessionTuningConfig }) {
  const systemPause = createMockSystemPauseSource();
  const hook = renderHook(() => useStudyRoomSession(null, { systemPause, tuning }));
  const advanceMinutes = async (minutes: number) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(minutes * 60_000);
    });
  };
  return { ...hook, advanceMinutes };
}

describe("useStudyRoomSession 그룹 공부방 시간 규칙", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("그룹 공부방은 1시간 일시정지에 끝나고 싱글룸 기본값은 20분 그대로다", () => {
    expect(GROUP_ROOM_SESSION_TUNING).toEqual({ autoEndPauseMinutes: 60 });
    expect(DEFAULT_SESSION_TUNING).toEqual({ autoEndPauseMinutes: 20 });
  });

  it("그룹 공부방은 일시정지 60분에 끝나고 휴식은 세지 않는다", async () => {
    const { result, advanceMinutes } = renderSession({ tuning: GROUP_ROOM_SESSION_TUNING });
    act(() => result.current.pause("MANUAL"));

    await advanceMinutes(59);
    expect(result.current.phase.name).toBe("studying");

    await advanceMinutes(1);
    expect(result.current.endReason).toEqual({ kind: "AUTO", trigger: "MANUAL" });
  });

  it("휴식은 70분이어도 끝나지 않는다", async () => {
    const { result, advanceMinutes } = renderSession({ tuning: GROUP_ROOM_SESSION_TUNING });
    act(() => result.current.startBreak());

    await advanceMinutes(70);

    expect(result.current.phase.name).toBe("studying");
    expect(result.current.endReason).toBeNull();
  });
});
