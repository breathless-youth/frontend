import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as MetaAppEvents from "@/lib/metaAppEvents";

import { useStudyRoomSession } from "../useStudyRoomSession";

/**
 * 순공 5분 달성 감지
 *
 * 훅은 한 세션의 순공 시간이 300초에 닿는 순간을 판정만 하고, 기기당 한 번 보장과 이벤트 모양은 `lib/__tests__/metaAppEvents.test.ts`가 맡는다.
 */
const mocks = vi.hoisted(() => ({
  milestone: vi.fn(),
}));

vi.mock("@/lib/metaAppEvents", async (importOriginal) => ({
  ...(await importOriginal<typeof MetaAppEvents>()),
  trackMetaFocusMilestone: mocks.milestone,
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useStudyRoomSession 순공 5분 달성", () => {
  it("순공이 300초에 닿기 전에는 보내지 않는다", async () => {
    renderHook(() => useStudyRoomSession(7, { tickMs: 1_000 }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(299_000);
    });

    expect(mocks.milestone).not.toHaveBeenCalled();
  });

  it("순공이 정확히 300초가 되면 한 번 보내고, 그 뒤 tick에서는 다시 부르지 않는다", async () => {
    renderHook(() => useStudyRoomSession(7, { tickMs: 1_000 }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300_000);
    });
    expect(mocks.milestone).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(mocks.milestone).toHaveBeenCalledTimes(1);
  });

  it("복원 세션은 복원 전 순공까지 합쳐 판정한다 — 이미 300초를 넘겼으면 진입하자마자 보낸다", () => {
    const nowMs = Date.now();
    renderHook(() =>
      useStudyRoomSession(7, {
        tickMs: 1_000,
        restored: {
          startedAtMs: nowMs - 600_000,
          reportedAtMs: nowMs - 5_000,
          baseStudySec: 400,
          baseFocusSec: 320,
          events: [],
        },
      }),
    );

    expect(mocks.milestone).toHaveBeenCalledTimes(1);
  });

  it("복원 세션이 300초 전이면 재개 뒤 남은 순공을 채웠을 때 보낸다", async () => {
    const nowMs = Date.now();
    const hook = renderHook(() =>
      useStudyRoomSession(7, {
        tickMs: 1_000,
        restored: {
          startedAtMs: nowMs - 600_000,
          reportedAtMs: nowMs - 5_000,
          baseStudySec: 400,
          baseFocusSec: 290,
          events: [],
        },
      }),
    );
    expect(mocks.milestone).not.toHaveBeenCalled();

    act(() => {
      hook.result.current.resume();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });

    expect(mocks.milestone).toHaveBeenCalledTimes(1);
  });
});
