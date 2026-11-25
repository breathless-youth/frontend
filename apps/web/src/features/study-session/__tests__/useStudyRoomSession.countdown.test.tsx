import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { trackStudySessionStarted } from "@/lib/amplitude";
import type * as Amplitude from "@/lib/amplitude";

import { createMockFocusDetector } from "../adapters/focusDetector";
import { createMockSystemPauseSource } from "../adapters/systemPauseSource";
import { FOCUS_STATE, distractionState } from "../sessionState";
import { useStudyRoomSession } from "../useStudyRoomSession";

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackStudySessionStarted: vi.fn(),
}));

const NOW = Date.UTC(2026, 10, 24, 1, 0, 0);

function setup(options: { countdown?: boolean; userId?: number | null } = {}) {
  const detector = createMockFocusDetector();
  const detectorStart = vi.spyOn(detector, "start");
  const systemPause = createMockSystemPauseSource();
  const hook = renderHook(() =>
    useStudyRoomSession(options.userId ?? null, {
      detector,
      systemPause,
      roomType: "single",
      countdown: options.countdown ?? true,
    }),
  );
  return { ...hook, detector, detectorStart, systemPause };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("useStudyRoomSession 공부 시작 카운트다운", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("카운트다운 동안에는 시계가 흐르지 않는다", async () => {
    const { result } = setup();
    await advance(5_000);

    expect(result.current.phase.name).toBe("counting");
    expect(result.current.studySec).toBe(0);
    expect(result.current.focusSec).toBe(0);
  });

  it("시작하면 그 순간부터 공부 시간을 센다", async () => {
    const { result } = setup();
    await advance(5_000);
    act(() => {
      result.current.startStudying();
    });
    await advance(10_000);

    expect(result.current.phase.name).toBe("studying");
    expect(result.current.studySec).toBe(10);
    expect(result.current.focusSec).toBe(10);
  });

  it("서버 보고의 시작 시각은 카운트다운이 끝난 순간이다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve({}) }),
    );
    const { result } = setup({ userId: 1 });
    await advance(3_000);
    const startedAtMs = Date.now();
    act(() => {
      result.current.startStudying();
    });
    await advance(30_000);

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)) as {
      startedAt: string;
    };
    expect(body.startedAt).toBe(new Date(startedAtMs).toISOString());
  });

  it("카운트다운 동안에는 감지기를 켜지 않고, 시작하면 켠다", async () => {
    const { result, detectorStart } = setup();
    await advance(3_000);
    expect(detectorStart).not.toHaveBeenCalled();

    act(() => {
      result.current.startStudying();
    });
    await advance(0);
    expect(detectorStart).toHaveBeenCalledTimes(1);
  });

  it("시작한 뒤 켜진 비집중 신호는 유예부터 센다", async () => {
    const { result, detector } = setup();
    await advance(3_000);
    act(() => {
      result.current.startStudying();
    });
    act(() => {
      detector.emit({ source: "AWAY", active: true });
    });
    await advance(1_000);
    expect(result.current.sessionState).toEqual(FOCUS_STATE);

    await advance(10_000);
    expect(result.current.sessionState).toEqual(distractionState("AWAY"));
  });

  it("카운트다운 동안 일시정지·휴식·과목 변경·종료를 불러도 아무 일도 일어나지 않는다", async () => {
    const { result } = setup();
    await act(async () => {
      result.current.pause("MANUAL");
      result.current.startBreak();
      result.current.selectSubject(7);
      await result.current.endAndSubmit();
    });

    expect(result.current.phase.name).toBe("counting");
    expect(result.current.sessionState).toEqual(FOCUS_STATE);
    expect(result.current.subjectSelection).toBeNull();
  });

  it("카운트다운 중 앱을 나갔다 와도 일시정지 기록이 남지 않는다", async () => {
    const { result, systemPause } = setup();
    act(() => {
      systemPause.leave();
    });
    await advance(2_000);
    act(() => {
      systemPause.return();
    });
    act(() => {
      result.current.startStudying();
    });
    await advance(5_000);

    expect(result.current.sessionState).toEqual(FOCUS_STATE);
    expect(result.current.sessionEvents).toEqual([]);
  });

  it("공부 시작 분석 이벤트는 시작할 때 한 번 보낸다", async () => {
    const { result } = setup();
    await advance(3_000);
    expect(trackStudySessionStarted).not.toHaveBeenCalled();

    act(() => {
      result.current.startStudying();
    });
    await advance(1_000);
    expect(trackStudySessionStarted).toHaveBeenCalledTimes(1);
  });

  it("카운트다운을 쓰지 않으면 바로 공부 중으로 시작한다", async () => {
    const { result } = setup({ countdown: false });
    await advance(3_000);

    expect(result.current.phase.name).toBe("studying");
    expect(result.current.studySec).toBe(3);
  });
});
