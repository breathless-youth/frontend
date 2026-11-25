import { describe, expect, it } from "vitest";
import { homeMission } from "@/test/homeMissionFixtures";
import { clampGoalSeconds } from "@/features/planner/goalDuration";
import { selectHomeBand } from "../homeV3Model";

describe("home v3 server band", () => {
  it("uses server eligibility for existing subjects and still waits for explicit acknowledgement", () => {
    expect(selectHomeBand(homeMission(0, 900, true), 500, 3600)).toEqual({
      kind: "mission",
      step: 1,
      totalSteps: 2,
      ready: true,
      progress: 0,
    });
    expect(selectHomeBand(homeMission(0, 900, false), 500, 3600)).toEqual({
      kind: "mission",
      step: 1,
      totalSteps: 2,
      ready: false,
      progress: 0,
    });
  });
  it("uses server eligibility for a qualifying single day, not today's or different days' total", () => {
    expect(selectHomeBand(homeMission(1, 299, false), 5000, 3600)).toEqual({
      kind: "mission",
      step: 2,
      totalSteps: 2,
      ready: false,
      progress: 0.5,
    });
    expect(selectHomeBand(homeMission(1, 300, true), 0, null)).toEqual({
      kind: "mission",
      step: 2,
      totalSteps: 2,
      ready: true,
      progress: 0.5,
    });
    expect(selectHomeBand(homeMission(1, 900, false), 5000, 3600)).toEqual({
      kind: "mission",
      step: 2,
      totalSteps: 2,
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

describe("미션 포인트 띠", () => {
  const finished = { ...homeMission(2, 300), claimablePoints: 150 };

  it("미션이 끝났고 안 받은 포인트가 있으면 목표보다 받기 띠가 먼저다", () => {
    expect(selectHomeBand(finished, 0, 3600, true)).toEqual({
      kind: "mission-reward",
      points: 150,
    });
  });

  it("포인트를 쓰지 않거나 받을 것이 없으면 목표 띠다", () => {
    expect(selectHomeBand(finished, 0, 3600).kind).toBe("goal");
    expect(selectHomeBand({ ...finished, claimablePoints: 0 }, 0, 3600, true).kind).toBe("goal");
  });

  it("미션이 남아 있으면 안 받은 포인트가 있어도 미션 띠다", () => {
    expect(
      selectHomeBand({ ...homeMission(1, 300), claimablePoints: 50 }, 0, null, true).kind,
    ).toBe("mission");
  });
  it("포인트를 쓰는 곳에서는 미션 띠에 이번 단계의 포인트를 싣는다", () => {
    const mission = { ...homeMission(1, 300, true), stepPoints: [50, 100] };
    expect(selectHomeBand(mission, 0, null, true)).toEqual({
      kind: "mission",
      step: 2,
      totalSteps: 2,
      ready: true,
      progress: 0.5,
      rewardPoints: 100,
    });
  });
  it("포인트를 안 쓰는 곳이거나 서버가 단계 포인트를 안 주면 싣지 않는다", () => {
    const mission = { ...homeMission(0, 0, false), stepPoints: [50, 100] };
    expect(selectHomeBand(mission, 0, null)).not.toHaveProperty("rewardPoints");
    expect(selectHomeBand(homeMission(0, 0, false), 0, null, true)).not.toHaveProperty(
      "rewardPoints",
    );
    expect(
      selectHomeBand({ ...homeMission(0, 0, false), stepPoints: [0, 100] }, 0, null, true),
    ).not.toHaveProperty("rewardPoints");
  });
});
