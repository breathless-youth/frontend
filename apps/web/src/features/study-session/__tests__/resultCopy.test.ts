import { describe, expect, it } from "vitest";

import { focusRateLabel } from "../resultCopy";

describe("focusRateLabel", () => {
  it("'집중률 N%' 형식이다", () => {
    expect(focusRateLabel(80)).toBe("집중률 80%");
  });
});
