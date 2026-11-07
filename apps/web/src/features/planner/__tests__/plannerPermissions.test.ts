import { describe, expect, it } from "vitest";

import { plannerMode } from "../plannerPermissions";

describe("플래너 날짜 모드", () => {
  it.each([
    ["2026-11-04", "past"],
    ["2026-11-05", "today"],
    ["2026-11-06", "future"],
  ] as const)("오늘이 11월 5일이면 %s는 %s다", (dateKey, expected) => {
    expect(plannerMode(dateKey, "2026-11-05")).toBe(expected);
  });
});
