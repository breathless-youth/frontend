import { describe, expect, it } from "vitest";

import { rewardStartedAt } from "../rewardStartedAt";

describe("rewardStartedAt", () => {
  it("조각들이 나눠 가진 제출 시작 시각을 그대로 쓴다", () => {
    expect(
      rewardStartedAt([
        { startedAt: "2026-11-11T15:00:00Z", submissionStartedAt: "2026-11-11T14:10:00Z" },
        { startedAt: "2026-11-11T14:10:00Z", submissionStartedAt: "2026-11-11T14:10:00Z" },
      ]),
    ).toBe("2026-11-11T14:10:00Z");
  });

  it("제출 시작 시각이 없으면 가장 이른 세션의 시작 시각을 쓴다", () => {
    expect(
      rewardStartedAt([
        { startedAt: "2026-11-11T15:00:00Z" },
        { startedAt: "2026-11-11T14:10:00Z" },
      ]),
    ).toBe("2026-11-11T14:10:00Z");
  });
});
