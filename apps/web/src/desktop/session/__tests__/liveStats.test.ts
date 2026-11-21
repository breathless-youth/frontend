import { describe, expect, it } from "vitest";

import { addSessionToToday } from "../liveStats";

describe("addSessionToToday", () => {
  it("오늘 기록에 이번 세션을 더하고 집중률을 다시 계산한다", () => {
    const today = {
      status: "success" as const,
      value: { studySeconds: 3000, focusSeconds: 2000, focusRate: 67 },
    };

    expect(addSessionToToday(today, { studySec: 1000, focusSec: 1000 })).toEqual({
      status: "success",
      value: { studySeconds: 4000, focusSeconds: 3000, focusRate: 75 },
    });
  });

  it("오늘 기록이 없으면 그대로 둔다", () => {
    const retry = () => {};

    expect(addSessionToToday({ status: "pending" }, { studySec: 5, focusSec: 5 })).toEqual({
      status: "pending",
    });
    expect(addSessionToToday({ status: "error", retry }, { studySec: 5, focusSec: 5 })).toEqual({
      status: "error",
      retry,
    });
  });

  it("공부시간이 0이면 집중률은 0이다", () => {
    const empty = {
      status: "success" as const,
      value: { studySeconds: 0, focusSeconds: 0, focusRate: 0 },
    };

    expect(addSessionToToday(empty, { studySec: 0, focusSec: 0 })).toEqual(empty);
  });
});
