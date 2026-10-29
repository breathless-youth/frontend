import { describe, expect, it } from "vitest";

import { recentDayLabel, timelapseRangeLabel, timelapseStartLabel } from "../recentDayLabel";

describe("recentDayLabel", () => {
  const now = new Date(2026, 9, 7, 9, 0).getTime();

  it("오늘·어제·그 밖의 날짜를 나눈다", () => {
    expect(recentDayLabel(new Date(2026, 9, 7, 0, 10).getTime(), now)).toBe("오늘");
    expect(recentDayLabel(new Date(2026, 9, 6, 23, 50).getTime(), now)).toBe("어제");
    expect(recentDayLabel(new Date(2026, 9, 3, 12, 0).getTime(), now)).toBe("10월 3일");
  });

  it("전체 목록 줄은 요일 붙은 날짜와 시작·끝 시각을 엔대시로 잇는다", () => {
    expect(
      timelapseRangeLabel(
        new Date(2026, 9, 5, 18, 23).getTime(),
        new Date(2026, 9, 5, 21, 3).getTime(),
      ),
    ).toBe("10월 5일 (월) 18:23 – 21:03");
  });

  it("삭제 버튼 라벨용 시작 시각은 날짜와 시각이다", () => {
    expect(timelapseStartLabel(new Date(2026, 9, 5, 9, 5).getTime())).toBe("10월 5일 09:05");
  });
});
