import { describe, expect, it } from "vitest";

import type { SessionState } from "../sessionState";
import {
  BREAK_STATE,
  FOCUS_STATE,
  distractionState,
  isBreak,
  isSessionHeld,
  pauseState,
} from "../sessionState";

describe("휴식과 일시정지 판정", () => {
  it.each<[string, boolean, boolean, SessionState]>([
    ["수동 일시정지", false, true, pauseState("MANUAL")],
    ["백그라운드 일시정지", false, true, pauseState("BACKGROUND")],
    ["휴식", true, false, BREAK_STATE],
    ["집중", false, false, FOCUS_STATE],
    ["비집중", false, false, distractionState("PHONE")],
  ])("%s이면 isBreak는 %s, isSessionHeld는 %s다", (_name, expectedBreak, expectedHeld, state) => {
    expect(isBreak(state)).toBe(expectedBreak);
    expect(isSessionHeld(state)).toBe(expectedHeld);
  });
});
