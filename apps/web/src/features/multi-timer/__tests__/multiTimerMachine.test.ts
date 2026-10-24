import { describe, expect, it } from "vitest";

import {
  backToSetup,
  createModeState,
  pauseMode,
  remainingMs,
  resumeMode,
  startMode,
  syncMode,
  updateModeSettings,
} from "../multiTimerMachine";
import type { ModeState } from "../multiTimerMachine";
import { DEFAULT_MULTI_TIMER_SETTINGS } from "../multiTimerSettings";

const S = DEFAULT_MULTI_TIMER_SETTINGS;

function runningTimer(timerSec: number): ModeState {
  return startMode(createModeState("timer", { ...S, timerSec }));
}

function runningPomodoro(focusMin: number, breakMin: number): ModeState {
  return startMode(createModeState("pomodoro", { ...S, focusMin, breakMin }));
}

describe("multiTimerMachine", () => {
  it("start_then_sync_counts_down_from_first_sync", () => {
    let s = runningTimer(1800);
    s = syncMode(s, 1000, false).state;
    expect(remainingMs(s, 61_000)).toBe(1_740_000);
  });

  it("held_freezes_and_resumes_without_jump", () => {
    let s = syncMode(runningTimer(1800), 0, false).state;
    s = syncMode(s, 10_000, true).state;
    expect(remainingMs(s, 600_000)).toBe(1_790_000);
    s = syncMode(s, 600_000, false).state;
    expect(remainingMs(s, 610_000)).toBe(1_780_000);
  });

  it("pause_mode_freezes_and_resume_continues", () => {
    let s = syncMode(runningTimer(1800), 0, false).state;
    s = pauseMode(s, 5_000);
    expect(s.status).toBe("paused");
    expect(remainingMs(s, 99_000)).toBe(1_795_000);
    s = resumeMode(s);
    expect(s.status).toBe("running");
    s = syncMode(s, 100_000, false).state;
    expect(remainingMs(s, 102_000)).toBe(1_793_000);
  });

  it("timer_reaches_zero_once", () => {
    let s = syncMode(runningTimer(2), 0, false).state;
    const first = syncMode(s, 2_500, false);
    expect(first.state.status).toBe("done");
    expect(first.alarms).toEqual(["timer-done"]);
    s = first.state;
    const second = syncMode(s, 3_000, false);
    expect(second.alarms).toEqual([]);
    expect(second.state).toBe(s);
    expect(remainingMs(s, 9_000)).toBe(0);
  });

  it("pomodoro_focus_to_break_carries_overflow", () => {
    const s = syncMode(runningPomodoro(1, 1), 0, false).state;
    const r = syncMode(s, 61_000, false);
    expect(r.state.phase).toBe("break");
    expect(r.alarms).toEqual(["focus-done"]);
    expect(remainingMs(r.state, 61_000)).toBe(59_000);
  });

  it("pomodoro_break_to_focus", () => {
    const s = syncMode(runningPomodoro(1, 1), 0, false).state;
    const b = syncMode(s, 61_000, false).state;
    const r = syncMode(b, 121_000, false);
    expect(r.state.phase).toBe("focus");
    expect(r.alarms).toEqual(["break-done"]);
  });

  it("late_sync_flips_only_once", () => {
    const s = syncMode(runningPomodoro(1, 1), 0, false).state;
    const r = syncMode(s, 600_000, false);
    expect(r.state.phase).toBe("break");
    expect(r.alarms).toHaveLength(1);
    expect(remainingMs(r.state, 600_000)).toBe(60_000);
  });

  it("update_settings_only_in_setup_and_clamped", () => {
    const setup = createModeState("pomodoro", S);
    const next = updateModeSettings(setup, { focusMin: 999, breakMin: 0 });
    expect(next.settings.focusMin).toBe(180);
    expect(next.settings.breakMin).toBe(1);
    expect(next.clock.remainingMs).toBe(180 * 60_000);
    const running = startMode(setup);
    expect(updateModeSettings(running, { focusMin: 10 })).toBe(running);
  });

  it("start_timer_with_zero_is_noop", () => {
    const s = createModeState("timer", { ...S, timerSec: 0 });
    expect(startMode(s)).toBe(s);
  });

  it("back_to_setup_resets_phase_and_remaining", () => {
    let s = syncMode(runningPomodoro(1, 1), 0, false).state;
    s = syncMode(s, 61_000, false).state;
    const back = backToSetup(s);
    expect(back.status).toBe("setup");
    expect(back.phase).toBe("focus");
    expect(back.clock).toEqual({ remainingMs: 60_000, anchorMs: null });
  });

  it("sync returns the same reference when nothing changed", () => {
    const s = syncMode(runningTimer(10), 0, false).state;
    expect(syncMode(s, 1_000, false).state).toBe(s);
  });
});
