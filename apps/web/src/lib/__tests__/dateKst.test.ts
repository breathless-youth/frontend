import { describe, expect, it } from "vitest";

import { todayKstDateKey } from "../dateKst";

describe("todayKstDateKey", () => {
  it("KST 기준 날짜 키를 만든다", () => {
    // UTC 2026-07-25 16:00 = KST 2026-07-26 01:00
    expect(todayKstDateKey(new Date("2026-07-25T16:00:00Z"))).toBe("2026-07-26");
  });

  it("KST 자정 직전은 같은 날로 남는다", () => {
    // UTC 2026-07-25 14:59 = KST 2026-07-25 23:59
    expect(todayKstDateKey(new Date("2026-07-25T14:59:00Z"))).toBe("2026-07-25");
  });

  it("월·일을 2자리로 패딩한다", () => {
    expect(todayKstDateKey(new Date("2026-01-05T03:00:00Z"))).toBe("2026-01-05");
  });
});
