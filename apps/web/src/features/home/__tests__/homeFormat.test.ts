import { describe, expect, it } from "vitest";

import { todayLabel } from "../homeFormat";

describe("todayLabel", () => {
  it("'N월 N일 요일요일' 형식으로 표시한다", () => {
    expect(todayLabel(new Date(2026, 6, 26))).toBe("7월 26일 일요일");
  });
});
