import { describe, expect, it } from "vitest";

import { canShowMeasurementFeedback } from "../measurementFeedbackGate";

const HOUR_MS = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 31, 3, 0, 0);

describe("canShowMeasurementFeedback", () => {
  it.each([
    { name: "순공 5분 이상이고 처음이면 보여 준다", lastShownAt: null, focusSec: 300, want: true },
    { name: "순공 5분 미만이면 보여 주지 않는다", lastShownAt: null, focusSec: 299, want: false },
    {
      name: "마지막으로 보인 지 72시간이 안 됐으면 보여 주지 않는다",
      lastShownAt: NOW - 72 * HOUR_MS + 1,
      focusSec: 1200,
      want: false,
    },
    {
      name: "마지막으로 보인 지 72시간이 지나면 다시 보여 준다",
      lastShownAt: NOW - 72 * HOUR_MS,
      focusSec: 1200,
      want: true,
    },
  ])("$name", ({ lastShownAt, focusSec, want }) => {
    expect(canShowMeasurementFeedback({ lastShownAt }, focusSec, NOW)).toBe(want);
  });
});
