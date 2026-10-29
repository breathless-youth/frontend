import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { submitStudySession } from "../submitStudySession";
import { useStudyRoomSession } from "../useStudyRoomSession";

vi.mock("../submitStudySession", () => ({
  submitStudySession: vi.fn(() => Promise.resolve([])),
}));

const NOW = Date.UTC(2026, 9, 29, 1, 0, 0);

const iso = (ms: number) => new Date(ms).toISOString();

async function endAndReadSubmitted(hook: { current: ReturnType<typeof useStudyRoomSession> }) {
  await act(async () => {
    await hook.current.endAndSubmit();
  });
  const [input] = vi.mocked(submitStudySession).mock.calls[0]!;
  return input;
}

/** 홈에서 고른 과목으로 시작한 세션은 첫 순간부터 그 과목에 시간이 쌓인다. */
describe("useStudyRoomSession 시작 과목", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("시작 과목이 있으면 첫 화면부터 선택돼 있고, 제출 구간이 세션 시작 시각에서 시작한다", async () => {
    const { result } = renderHook(() => useStudyRoomSession(7, { initialSubjectId: 3 }));

    expect(result.current.subjectSelection).toBe(3);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    const input = await endAndReadSubmitted(result);

    expect(input.startedAtMs).toBe(NOW);
    expect(input.subjectSegments).toEqual([
      { subjectId: 3, startedAt: iso(NOW), endedAt: iso(input.endedAtMs) },
    ]);
  });

  it("복원하면 시작 과목을 쓰지 않고 서버 구간을 따른다", () => {
    const { result } = renderHook(() =>
      useStudyRoomSession(7, {
        initialSubjectId: 3,
        restored: {
          startedAtMs: NOW - 120_000,
          reportedAtMs: NOW - 60_000,
          baseStudySec: 60,
          baseFocusSec: 60,
          events: [],
          subjectSegments: [],
        },
      }),
    );

    expect(result.current.subjectSelection).toBeNull();
  });

  it("시작 과목을 버리면 과목 없이 시작한 세션과 같다", async () => {
    const { result } = renderHook(() => useStudyRoomSession(7, { initialSubjectId: 3 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    act(() => {
      result.current.discardSubject(3);
    });
    expect(result.current.subjectSelection).toBeNull();
    const input = await endAndReadSubmitted(result);

    expect(input.subjectSegments).toEqual([]);
  });
});
