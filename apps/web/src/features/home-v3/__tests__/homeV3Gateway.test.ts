import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHomeV3Gateway } from "../createHomeV3Gateway";
import { homeMission } from "@/test/homeMissionFixtures";
import { plannerDay } from "@/test/plannerFixtures";

const mock = vi.hoisted(() => ({
  owner: 7,
  mission: vi.fn(),
  complete: vi.fn(),
  day: vi.fn(),
  dateGoal: vi.fn(),
  defaultGoal: vi.fn(),
}));
vi.mock("@/lib/userId", () => ({
  assertCurrentUserId: (id: number) => {
    if (id !== mock.owner) throw new DOMException("account changed", "AbortError");
  },
}));
vi.mock("@/lib/homeMissionApi", () => ({
  getHomeMission: mock.mission,
  completeHomeMissionStep: mock.complete,
}));
vi.mock("@/lib/plannerApi", () => ({
  getPlannerDay: mock.day,
  setPlannerGoal: mock.dateGoal,
  setPlannerDefaultGoal: mock.defaultGoal,
}));
const day = { dateKey: "2026-11-07", timeZone: "America/New_York" };
beforeEach(() => {
  vi.clearAllMocks();
  mock.owner = 7;
});

describe("real home gateway", () => {
  it("forwards server state, planner date, timezone, signal and explicit zero", async () => {
    mock.mission.mockResolvedValue(homeMission(1));
    mock.day.mockResolvedValue(plannerDay());
    const gateway = createHomeV3Gateway(7, vi.fn());
    const signal = new AbortController().signal;
    expect(await gateway.readMission(signal)).toEqual(homeMission(1));
    await gateway.readPlannerDay(day, signal);
    expect(mock.day).toHaveBeenCalledWith(day.dateKey, { timeZone: day.timeZone, signal });
    await gateway.saveDateGoal(day, 0);
    expect(mock.dateGoal).toHaveBeenCalledWith(
      day.dateKey,
      { goalSec: 0 },
      { timeZone: day.timeZone, calendar: "HOME" },
    );
    await gateway.saveDefaultGoal(day, 0);
    expect(mock.defaultGoal).toHaveBeenCalledWith({ goalSec: 0 }, { timeZone: day.timeZone });
  });
  it("does not send a later default write or start under a different account", async () => {
    const start = vi.fn();
    const gateway = createHomeV3Gateway(7, start);
    mock.owner = 8;
    await expect(gateway.saveDefaultGoal(day, 28800)).rejects.toMatchObject({ name: "AbortError" });
    await expect(gateway.startStudy(2)).rejects.toMatchObject({ name: "AbortError" });
    expect(mock.defaultGoal).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });
  it("rejects a response that arrives after the account changed", async () => {
    let finish!: (value: ReturnType<typeof homeMission>) => void;
    mock.mission.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const request = createHomeV3Gateway(7, vi.fn()).readMission(new AbortController().signal);
    mock.owner = 8;
    finish(homeMission(1));
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
});
