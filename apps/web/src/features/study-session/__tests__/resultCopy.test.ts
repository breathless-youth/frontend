import { describe, expect, it } from "vitest";

import { focusRateLabel } from "../resultCopy";

describe("focusRateLabel", () => {
  it("'N% 집중' 형식이다", () => {
    expect(focusRateLabel(80)).toBe("80% 집중");
  });
});
