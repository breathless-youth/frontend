import { describe, expect, it } from "vitest";

import { buildPointsFixture } from "../../fixtures";
import type { EarnToday } from "../../types";
import { hasClaimableReward } from "../claimableReward";

/** 출석·하루 목표를 받았고 받을 메달이 없는 오늘 */
const nothingLeft: EarnToday = {
  ...buildPointsFixture("allDone").earn,
  medals: [],
};

describe("hasClaimableReward", () => {
  it("출석·하루 목표를 받았고 메달이 없으면 받을 것이 없다", () => {
    expect(hasClaimableReward(nothingLeft)).toBe(false);
  });

  it("출석을 받지 않았으면 받을 것이 있다", () => {
    expect(
      hasClaimableReward({
        ...nothingLeft,
        attendance: { ...nothingLeft.attendance, claimed: false },
      }),
    ).toBe(true);
  });

  it("하루 목표를 채우고 받지 않았을 때만 받을 것이 있다", () => {
    const goal = nothingLeft.dailyGoal;
    expect(
      hasClaimableReward({
        ...nothingLeft,
        dailyGoal: { ...goal, achieved: true, claimed: false },
      }),
    ).toBe(true);
    expect(
      hasClaimableReward({
        ...nothingLeft,
        dailyGoal: { ...goal, achieved: false, claimed: false },
      }),
    ).toBe(false);
  });

  it("받지 않은 메달이 있으면 받을 것이 있다", () => {
    expect(
      hasClaimableReward({ ...nothingLeft, medals: [{ rank: 1, period: "DAILY", reward: 30 }] }),
    ).toBe(true);
  });
});
