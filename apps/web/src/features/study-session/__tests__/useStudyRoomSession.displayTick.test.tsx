import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockFocusDetector } from "../adapters/focusDetector";
import { DEFAULT_DETECTION_PARAMS } from "../detection";
import type { RestoredSession } from "../restoreActiveSession";
import { deriveSubjectTotals, liveSubjectTime } from "../subjectSegments";
import { useStudyRoomSession } from "../useStudyRoomSession";

type Session = ReturnType<typeof useStudyRoomSession>;

// 신호가 바로 상태가 되도록 유지시간을 0으로 둔다.
// 상태는 신호 다음 틱에 바뀌므로 전환 시각은 200ms 단위로 떨어진다.
const INSTANT_PHONE = { ...DEFAULT_DETECTION_PARAMS, PHONE: { enterMs: 0, exitMs: 0 } };

function subjectTime(session: Session, subjectId: number) {
  return liveSubjectTime(
    deriveSubjectTotals(session.subjectSegments, session.sessionEvents),
    subjectId,
  );
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("useStudyRoomSession 화면 시간의 초 단위 갱신", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T00:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("소수점 길이의 비집중이 지나간 뒤에도 순공과 총 공부가 같은 순간에 바뀐다", async () => {
    const detector = createMockFocusDetector();
    const hook = renderHook(() =>
      useStudyRoomSession(7, { detector, detectionParams: INSTANT_PHONE }),
    );

    await advance(300);
    act(() => {
      detector.emit({ source: "PHONE", active: true });
    });
    await advance(1_400);
    act(() => {
      detector.emit({ source: "PHONE", active: false });
    });
    await advance(600);

    const before = hook.result.current;
    const gaps = new Set<number>();
    for (let i = 0; i < 20; i += 1) {
      await advance(200);
      gaps.add(hook.result.current.studySec - hook.result.current.focusSec);
    }

    expect(gaps.size).toBe(1);
    expect(hook.result.current.studySec).toBeGreaterThan(before.studySec);
    expect(hook.result.current.focusSec).toBeGreaterThan(before.focusSec);
  });

  it("소수점 시각에 고른 과목의 시간이 순공과 같은 순간에 바뀐다", async () => {
    const hook = renderHook(() => useStudyRoomSession(7));

    await advance(300);
    act(() => {
      hook.result.current.selectSubject(1);
    });

    for (let i = 0; i < 20; i += 1) {
      await advance(200);
      expect(subjectTime(hook.result.current, 1).focusSec).toBe(hook.result.current.focusSec);
    }
  });

  it("소수점 아래가 0.5초 이상인 시각에 비집중이 시작돼도 과목 순공이 순공과 같다", async () => {
    const detector = createMockFocusDetector();
    const hook = renderHook(() =>
      useStudyRoomSession(7, { detector, detectionParams: INSTANT_PHONE }),
    );
    act(() => {
      hook.result.current.selectSubject(1);
    });

    // 1.6초 틱에서 비집중으로 바뀐다.
    await advance(1_500);
    act(() => {
      detector.emit({ source: "PHONE", active: true });
    });

    for (let i = 0; i < 20; i += 1) {
      await advance(200);
      expect(subjectTime(hook.result.current, 1).focusSec).toBe(hook.result.current.focusSec);
    }
  });

  it("일시정지 중 소수점 시각에 과목을 바꿔도 이전 과목 시간이 줄지 않는다", async () => {
    const hook = renderHook(() => useStudyRoomSession(7));
    act(() => {
      hook.result.current.selectSubject(1);
    });
    await advance(2_000);
    act(() => {
      hook.result.current.pause();
    });
    await advance(1_700);

    // 3.7초에 과목을 바꾼다.
    const samples = [subjectTime(hook.result.current, 1)];
    act(() => {
      hook.result.current.selectSubject(2);
    });
    samples.push(subjectTime(hook.result.current, 1));
    for (let i = 0; i < 10; i += 1) {
      await advance(200);
      samples.push(subjectTime(hook.result.current, 1));
    }

    samples.forEach((sample, i) => {
      expect(sample.studySec).toBeGreaterThanOrEqual(samples[i - 1]?.studySec ?? 0);
      expect(sample.focusSec).toBeGreaterThanOrEqual(samples[i - 1]?.focusSec ?? 0);
    });
  });

  it("틱이 눈금과 어긋나도 일시정지 중 과목을 바꾼 직후 이전 과목 시간이 올랐다 내려가지 않는다", async () => {
    // 세션 시작을 마운트보다 10.1초 앞에 둬서 눈금이 마운트 기준 x.9초에 놓이고 눈금 뒤 첫 틱은 0.1초 늦게 온다.
    const mountMs = Date.now();
    const restored: RestoredSession = {
      startedAtMs: mountMs - 10_100,
      reportedAtMs: mountMs - 5_100,
      baseStudySec: 5,
      baseFocusSec: 5,
      events: [],
    };
    const hook = renderHook(() => useStudyRoomSession(7, { restored }));
    act(() => {
      hook.result.current.selectSubject(1);
      hook.result.current.resume();
    });
    await advance(2_000);
    act(() => {
      hook.result.current.pause();
    });

    // 2.9초 눈금 뒤, 3초 틱 전에 과목을 바꾼다.
    await advance(950);
    const samples = [subjectTime(hook.result.current, 1)];
    act(() => {
      hook.result.current.selectSubject(2);
    });
    samples.push(subjectTime(hook.result.current, 1));
    for (let i = 0; i < 5; i += 1) {
      await advance(200);
      samples.push(subjectTime(hook.result.current, 1));
    }

    samples.forEach((sample, i) => {
      expect(sample.studySec).toBeGreaterThanOrEqual(samples[i - 1]?.studySec ?? 0);
      expect(sample.focusSec).toBeGreaterThanOrEqual(samples[i - 1]?.focusSec ?? 0);
    });
  });

  it("세션을 끝낸 뒤 과목을 바꿔도 종료 집계가 바뀌지 않는다", async () => {
    const detector = createMockFocusDetector();
    const hook = renderHook(() =>
      useStudyRoomSession(null, { detector, detectionParams: INSTANT_PHONE }),
    );

    // 1.2초부터 1.8초까지 비집중이라 종료 집계의 순공은 2.4초를 내린 2초다.
    await advance(1_100);
    act(() => {
      detector.emit({ source: "PHONE", active: true });
    });
    await advance(600);
    act(() => {
      detector.emit({ source: "PHONE", active: false });
    });
    await advance(1_300);
    await act(async () => {
      await hook.result.current.endAndSubmit();
    });
    expect(hook.result.current.focusSec).toBe(2);

    act(() => {
      hook.result.current.selectSubject(1);
    });

    expect(hook.result.current.focusSec).toBe(2);
  });
});
