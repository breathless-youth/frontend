import { describe, expect, it } from "vitest";

import { FIXTURE_HOME_OVERTAKEN } from "@/lib/rankingFixtures";

import { closestGap, formatOvertakeGap } from "../overtakeView";

describe("formatOvertakeGap", () => {
  it("1시간 미만은 분을 올려 쓰고, 넘으면 시간과 분으로 쓴다", () => {
    expect(formatOvertakeGap(1860)).toBe("+31분");
    expect(formatOvertakeGap(20)).toBe("+1분");
    expect(formatOvertakeGap(3600)).toBe("+1시간");
    expect(formatOvertakeGap(3900)).toBe("+1시간 5분");
  });
});

describe("closestGap", () => {
  it("차이가 가장 작은 값이고 사람이 없으면 null이다", () => {
    expect(closestGap(FIXTURE_HOME_OVERTAKEN.overtaken!.nearest)).toBe(1320);
    expect(closestGap([])).toBeNull();
  });
});
