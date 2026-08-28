import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RestoredSession } from "../restoreActiveSession";
import { useStudyRoomSession } from "../useStudyRoomSession";

const STARTED_AT = Date.UTC(2026, 7, 28, 1, 0, 0);
const REPORTED_AT = Date.UTC(2026, 7, 28, 1, 32, 0);
/** 복원 시각. 앱이 2분간 꺼져 있었다. */
const NOW = Date.UTC(2026, 7, 28, 1, 34, 0);

const RESTORED: RestoredSession = {
  startedAtMs: STARTED_AT,
  reportedAtMs: REPORTED_AT,
  baseStudySec: 1850,
  baseFocusSec: 1620,
  events: [],
};

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function stubFetchOk() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve({}) }),
  );
}

function lastRequestBody() {
  const calls = vi.mocked(fetch).mock.calls;
  const [, init] = calls[calls.length - 1]!;
  return JSON.parse((init as RequestInit).body as string) as {
    startedAt: string;
    studySec: number;
    focusSec: number;
    events: { status: string; startedAt: string; endedAt: string }[];
  };
}

describe("useStudyRoomSession 복원", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    stubFetchOk();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("복원값이 없으면 0부터 시작한다", () => {
    const { result } = renderHook(() => useStudyRoomSession(7));

    expect(result.current.studySec).toBe(0);
    expect(result.current.focusSec).toBe(0);
  });

  it("복원하면 서버 누적값부터 보인다", () => {
    const { result } = renderHook(() => useStudyRoomSession(7, { restored: RESTORED }));

    expect(result.current.studySec).toBe(1850);
    expect(result.current.focusSec).toBe(1620);
  });

  it("복원하면 일시정지 상태로 시작한다", () => {
    const { result } = renderHook(() => useStudyRoomSession(7, { restored: RESTORED }));

    expect(result.current.sessionState.kind).toBe("PAUSE");
  });

  it("앱이 꺼져 있던 공백은 공부시간에 안 들어간다", async () => {
    const { result } = renderHook(() => useStudyRoomSession(7, { restored: RESTORED }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    // 공백 2분과 방금 30초 모두 일시정지라 누적값이 그대로다.
    expect(result.current.studySec).toBe(1850);
  });

  it("재개하면 그 시점부터 이어서 잰다", async () => {
    const { result } = renderHook(() => useStudyRoomSession(7, { restored: RESTORED }));

    act(() => {
      result.current.resume();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(result.current.studySec).toBe(1860);
  });

  it("스냅샷 보고가 서버 startedAt과 누적값을 싣는다", async () => {
    renderHook(() => useStudyRoomSession(7, { restored: RESTORED }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    const body = lastRequestBody();
    expect(body.startedAt).toBe(iso(STARTED_AT));
    expect(body.studySec).toBe(1850);
    expect(body.focusSec).toBe(1620);
  });

  it("공백이 일시정지 이벤트 한 건으로 보고된다", async () => {
    renderHook(() => useStudyRoomSession(7, { restored: RESTORED }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    const pauses = lastRequestBody().events.filter((e) => e.status === "PAUSE");
    expect(pauses).toHaveLength(1);
    expect(pauses[0]!.startedAt).toBe(iso(REPORTED_AT));
  });

  it("서버 이벤트를 앞에 이어 붙인다", async () => {
    const withEvent: RestoredSession = {
      ...RESTORED,
      events: [
        {
          status: "AWAY",
          startedAt: iso(Date.UTC(2026, 7, 28, 1, 10, 0)),
          endedAt: iso(Date.UTC(2026, 7, 28, 1, 12, 0)),
        },
      ],
    };
    renderHook(() => useStudyRoomSession(7, { restored: withEvent }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    const events = lastRequestBody().events;
    expect(events[0]).toMatchObject({ status: "AWAY" });
    expect(events).toHaveLength(2);
  });

  it("reportedAt에서 끝난 일시정지는 공백과 하나로 이어진다", async () => {
    const pausedAtCrash: RestoredSession = {
      ...RESTORED,
      baseStudySec: 1700,
      events: [
        {
          status: "PAUSE",
          startedAt: iso(Date.UTC(2026, 7, 28, 1, 30, 0)),
          endedAt: iso(REPORTED_AT),
        },
      ],
    };
    renderHook(() => useStudyRoomSession(7, { restored: pausedAtCrash }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    const pauses = lastRequestBody().events.filter((e) => e.status === "PAUSE");
    expect(pauses).toHaveLength(1);
    expect(pauses[0]!.startedAt).toBe(iso(Date.UTC(2026, 7, 28, 1, 30, 0)));
  });

  it("최종 제출이 서버 startedAt과 누적값과 이어 붙인 이벤트를 싣는다", async () => {
    const withEvent: RestoredSession = {
      ...RESTORED,
      events: [
        {
          status: "AWAY",
          startedAt: iso(Date.UTC(2026, 7, 28, 1, 10, 0)),
          endedAt: iso(Date.UTC(2026, 7, 28, 1, 12, 0)),
        },
      ],
    };
    const { result } = renderHook(() => useStudyRoomSession(7, { restored: withEvent }));

    await act(async () => {
      await result.current.endAndSubmit();
    });

    const body = lastRequestBody();
    expect(body.startedAt).toBe(iso(STARTED_AT));
    expect(body.studySec).toBe(1850);
    expect(body.focusSec).toBe(1620);
    expect(body.events[0]).toMatchObject({ status: "AWAY" });
    expect(body.events.filter((e) => e.status === "PAUSE")).toHaveLength(1);
  });

  it("복원 뒤 단말 시계가 뒤로 가도 누적값이 깎이지 않는다", async () => {
    const { result } = renderHook(() => useStudyRoomSession(7, { restored: RESTORED }));

    // 세션 도중 시계가 34분 뒤로 조정된 상황. 종료 시각이 시작 시각에 붙어 버린다.
    vi.setSystemTime(Date.UTC(2026, 7, 28, 1, 5, 0));
    await act(async () => {
      await result.current.endAndSubmit();
    });

    const body = lastRequestBody();
    expect(body.studySec).toBe(1850);
    expect(body.focusSec).toBe(1620);
  });

  it("복원 뒤 시계가 뒤로 가도 이벤트가 세션 구간 밖으로 나가지 않는다", async () => {
    const withEvent: RestoredSession = {
      ...RESTORED,
      events: [
        {
          status: "AWAY",
          startedAt: iso(Date.UTC(2026, 7, 28, 1, 10, 0)),
          endedAt: iso(Date.UTC(2026, 7, 28, 1, 12, 0)),
        },
      ],
    };
    const { result } = renderHook(() => useStudyRoomSession(7, { restored: withEvent }));

    vi.setSystemTime(Date.UTC(2026, 7, 28, 1, 5, 0));
    await act(async () => {
      await result.current.endAndSubmit();
    });

    const body = lastRequestBody() as unknown as { endedAt: string } & ReturnType<
      typeof lastRequestBody
    >;
    const endedAtMs = Date.parse(body.endedAt);
    body.events.forEach((event) => {
      expect(Date.parse(event.endedAt)).toBeLessThanOrEqual(endedAtMs);
    });
  });

  it("일시정지 자동 종료 시계가 마지막 보고 시각부터 돈다", async () => {
    const { result } = renderHook(() =>
      useStudyRoomSession(7, { restored: RESTORED, tuning: { autoEndPauseMinutes: 3 } }),
    );

    // 공백이 이미 2분이므로 30초 더 지나도 3분에 못 미친다.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(result.current.phase.name).toBe("studying");

    // 총 3분 1초가 되면 자동 종료가 발화한다.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    expect(result.current.phase.name).not.toBe("studying");
  });
});
