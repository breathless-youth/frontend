import { todayKstDateKey } from "../dateKst";

describe("todayKstDateKey", () => {
  it("UTC 자정 직전이라도 KST 기준 날짜를 돌려준다", () => {
    // 2026-07-27T16:00:00Z = KST 2026-07-28 01:00
    expect(todayKstDateKey(new Date("2026-07-27T16:00:00Z"))).toBe("2026-07-28");
  });

  it("KST 자정 직전은 같은 날로 남는다", () => {
    // 2026-07-27T14:59:59Z = KST 2026-07-27 23:59:59
    expect(todayKstDateKey(new Date("2026-07-27T14:59:59Z"))).toBe("2026-07-27");
  });

  it("월·일이 한 자리면 0을 채운다", () => {
    expect(todayKstDateKey(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01-05");
  });
});
