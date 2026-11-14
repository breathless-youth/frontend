import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { useStudyRoomSession } from "@/features/study-session/useStudyRoomSession";

import { initAmplitude, trackOnboardingCompleted } from "../amplitude";

const calls = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@amplitude/analytics-browser", () => ({
  add: vi.fn(),
  flush: vi.fn(),
  init: vi.fn(),
  setUserId: vi.fn(),
  track: calls.track,
  identify: vi.fn(),
  Identify: class {
    set() {
      return this;
    }
    setOnce() {
      return this;
    }
  },
}));
vi.mock("@amplitude/engagement-browser", () => ({ plugin: () => ({ name: "engagement" }) }));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  localStorage.clear();
});

it("제출 실패 세션을 다음 날 복원해 자동 종료해도 재순공으로 세지 않는다", async () => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.stubGlobal("requestIdleCallback", () => 1);
  vi.stubEnv("VITE_AMPLITUDE_API_KEY", "test-key");
  window.history.replaceState({}, "", "/room/42?userId=7");
  vi.setSystemTime(new Date("2026-11-06T09:00:00+09:00"));
  initAmplitude();
  trackOnboardingCompleted();
  const restored = {
    startedAtMs: Date.parse("2026-11-06T10:00:00+09:00"),
    reportedAtMs: Date.parse("2026-11-06T10:32:00+09:00"),
    baseStudySec: 1850,
    baseFocusSec: 1620,
    events: [],
  };
  vi.setSystemTime(new Date("2026-11-06T10:34:00+09:00"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  const first = renderHook(() => useStudyRoomSession(7, { restored }));
  await act(async () => {
    await first.result.current.endAndSubmit();
  });
  expect(first.result.current.phase.name).toBe("error");
  first.unmount();
  expect(
    calls.track.mock.calls.filter(([name]) => name === "onboarding_week_study_repeated"),
  ).toHaveLength(0);

  vi.setSystemTime(new Date("2026-11-07T10:34:00+09:00"));
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => ({}) }),
  );
  const second = renderHook(() => useStudyRoomSession(7, { restored }));
  await act(async () => {});
  expect(second.result.current.focusSec).toBe(1620);
  second.unmount();
  expect(
    calls.track.mock.calls.filter(([name]) => name === "onboarding_week_study_repeated"),
  ).toHaveLength(0);
});
