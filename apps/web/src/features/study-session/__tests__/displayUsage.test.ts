import { describe, expect, it } from "vitest";

import { createDisplayUsage } from "../displayUsage";

describe("createDisplayUsage", () => {
  it("화면마다 머문 초를 쌓고 작은 창에서 키운 횟수를 센다", () => {
    let now = 0;
    const usage = createDisplayUsage(() => now, "simple");
    now = 10_000;
    expect(usage.switchTo("pip")).toEqual({ from: "simple", sec: 10 });
    now = 15_000;
    usage.switchTo("expanded");
    now = 18_400;
    expect(usage.switchTo("pip")).toEqual({ from: "expanded", sec: 3 });
    now = 20_000;

    expect(usage.snapshot()).toEqual({
      pipSec: 7,
      expandedSec: 3,
      simpleSec: 10,
      pipExpandCount: 1,
    });
  });

  it("같은 화면을 다시 알리면 아무것도 바꾸지 않는다", () => {
    const usage = createDisplayUsage(() => 0, "pip");

    expect(usage.switchTo("pip")).toBeNull();
  });
});
