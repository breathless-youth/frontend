import { describe, expect, it } from "vitest";

import { buildPointsFixture } from "../../fixtures";
import { previewCharge, previewWatchAd, withAdPreview } from "../earnPreview";

const earnToday = buildPointsFixture("default").earn;

describe("withAdPreview", () => {
  it("서버가 광고 상태를 주지 않으면 예시 값으로 타일을 채운다", () => {
    const earn = withAdPreview({ ...earnToday, ad: undefined });
    expect(earn.ad).toEqual({ reward: 30, watched: 0, limit: 3 });
  });

  it("서버가 준 광고 상태는 바꾸지 않는다", () => {
    const ad = { reward: 50, watched: 2, limit: 5 };
    expect(withAdPreview({ ...earnToday, ad }).ad).toBe(ad);
  });
});

describe("previewWatchAd", () => {
  it("포인트를 주지 않고 볼 수 있는 광고가 없다고 알린다", async () => {
    await expect(previewWatchAd()).resolves.toEqual({ status: "unavailable" });
  });
});

describe("previewCharge", () => {
  it("포인트를 주지 않고 결제하지 못했다고 알린다", async () => {
    await expect(previewCharge()).resolves.toEqual({ status: "failed" });
  });
});
