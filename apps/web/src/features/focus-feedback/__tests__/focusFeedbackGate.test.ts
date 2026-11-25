import { describe, expect, it } from "vitest";

import { canShowFocusFeedback } from "../focusFeedbackGate";

const HOUR_MS = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 31, 3, 0, 0);

describe("canShowFocusFeedback", () => {
  it.each([
    {
      name: "총 공부 30분이고 처음이면 보여 준다",
      lastShownAt: null,
      studySec: 1800,
      want: true,
    },
    {
      name: "총 공부 30분에 1초 모자라면 보여 주지 않는다",
      lastShownAt: null,
      studySec: 1799,
      want: false,
    },
    {
      name: "마지막으로 보인 지 72시간이 안 됐으면 보여 주지 않는다",
      lastShownAt: NOW - 72 * HOUR_MS + 1,
      studySec: 1800,
      want: false,
    },
    {
      name: "마지막으로 보인 지 72시간이 지나면 다시 보여 준다",
      lastShownAt: NOW - 72 * HOUR_MS,
      studySec: 1800,
      want: true,
    },
  ])("$name", ({ lastShownAt, studySec, want }) => {
    expect(canShowFocusFeedback({ lastShownAt }, studySec, NOW)).toBe(want);
  });
});
