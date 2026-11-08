import { describe, expect, it } from "vitest";
import { homeMission } from "@/test/homeMissionFixtures";
import { clampGoalSeconds } from "@/features/planner/goalDuration";
import { selectHomeBand } from "../homeV3Model";

describe("home v3 server band", () => {
  it("uses server eligibility for existing subjects and still waits for explicit acknowledgement", () => {
    expect(selectHomeBand(homeMission(0, 900, true), 500, 3600)).toEqual({
      kind: "mission",
      step: 1,
      ready: true,
      progress: 0,
    });
    expect(selectHomeBand(homeMission(0, 900, false), 500, 3600)).toEqual({
      kind: "mission",
      step: 1,
      ready: false,
      progress: 0,
    });
  });
  it("uses server eligibility for a qualifying single day, not today's or different days' total", () => {
    expect(selectHomeBand(homeMission(1, 299, false), 5000, 3600)).toEqual({
      kind: "mission",
      step: 2,
      ready: false,
      progress: 0.5,
    });
    expect(selectHomeBand(homeMission(1, 300, true), 0, null)).toEqual({
      kind: "mission",
      step: 2,
      ready: true,
      progress: 0.5,
    });
    expect(selectHomeBand(homeMission(1, 900, false), 5000, 3600)).toEqual({
      kind: "mission",
      step: 2,
      ready: false,
      progress: 0.5,
    });
  });
  it("shows saved goal progress immediately after the second confirmation", () => {
    expect(selectHomeBand(homeMission(2), 13337, 28800)).toEqual({
      kind: "goal",
      targetSeconds: 28800,
      remainingSeconds: 15463,
      percent: 46,
    });
  });
  it.each([null, 0])("prompts for a goal when effective goal is %s", (goal) => {
    expect(selectHomeBand(homeMission(2), 1000, goal)).toEqual({ kind: "goal-empty" });
  });
  it("caps goal completion at 100 percent and zero remaining", () => {
    expect(selectHomeBand(homeMission(2), 8000, 3600)).toEqual({
      kind: "goal",
      targetSeconds: 3600,
      remainingSeconds: 0,
      percent: 100,
    });
  });
});
describe("goal range", () => {
  it("preserves valid seconds and clamps only outside the 0–24h range", () => {
    expect([-1, 1801, 100000, NaN].map(clampGoalSeconds)).toEqual([0, 1801, 86400, 0]);
  });
});
