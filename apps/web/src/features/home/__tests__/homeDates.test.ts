import { describe, expect, it } from "vitest";

import {
  HOME_DATE_RANGE_DAYS,
  homeDateAccessibilityLabel,
  homeDateChipLabel,
  homeDateKeys,
} from "../homeDates";

describe("homeDateKeys", () => {
  it("오늘을 포함한 최근 30일을 오래된 날부터 늘어놓고 마지막이 오늘이다", () => {
    const keys = homeDateKeys("2026-10-26");

    expect(keys).toHaveLength(HOME_DATE_RANGE_DAYS);
    expect(keys.at(-1)).toBe("2026-10-26");
    expect(keys[0]).toBe("2026-09-27");
  });

  it("달이 바뀌어도 하루씩 이어진다", () => {
    const keys = homeDateKeys("2026-03-01");

    expect(keys.slice(-3)).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
  });
});

describe("homeDateChipLabel", () => {
  it("일과 요일 한 글자를 `N일 (요일)`로 적는다", () => {
    expect(homeDateChipLabel("2026-10-26")).toBe("26일 (월)");
    expect(homeDateChipLabel("2026-10-04")).toBe("4일 (일)");
  });
});

describe("homeDateAccessibilityLabel", () => {
  it("오늘에만 오늘을 덧붙인다", () => {
    expect(homeDateAccessibilityLabel("2026-10-26", "2026-10-26")).toBe("10월 26일 월요일, 오늘");
    expect(homeDateAccessibilityLabel("2026-10-25", "2026-10-26")).toBe("10월 25일 일요일");
  });
});
