import type { RankingRecord } from "@focusmakers/types";
import { describe, expect, it } from "vitest";

import { groupRecordsByMonth } from "../records";

function record(id: number, periodStart: string): RankingRecord {
  return {
    id,
    type: "FOCUS_TIME",
    period: "DAILY",
    slot: null,
    periodStart,
    rank: 1,
    value: 3600,
    closesAt: `${periodStart}T15:00:00Z`,
  };
}

describe("groupRecordsByMonth", () => {
  it("기간 시작일의 달로 순서를 지키며 묶는다", () => {
    const groups = groupRecordsByMonth(
      [record(3, "2026-10-09"), record(2, "2026-10-02"), record(1, "2026-09-28")],
      2026,
    );

    expect(groups.map((group) => [group.label, group.items.map((item) => item.id)])).toEqual([
      ["10월", [3, 2]],
      ["9월", [1]],
    ]);
  });

  it("주간 기록은 주 이름의 달로 묶는다", () => {
    const weekly = { ...record(4, "2026-09-28"), period: "WEEKLY" as const };

    expect(
      groupRecordsByMonth([weekly, record(1, "2026-09-27")], 2026).map((g) => g.label),
    ).toEqual(["10월", "9월"]);
  });

  it("달이 걸친 주간 기록이 사이에 끼어도 같은 달은 한 묶음이다", () => {
    const weekly = {
      ...record(3, "2026-12-28"),
      period: "WEEKLY" as const,
      closesAt: "2027-01-03T15:00:00Z",
    };

    const groups = groupRecordsByMonth(
      [record(4, "2027-01-02"), weekly, record(2, "2027-01-01"), record(1, "2026-12-31")],
      2027,
    );

    expect(groups.map((group) => [group.label, group.items.map((item) => item.id)])).toEqual([
      ["1월", [4, 2]],
      ["2026년 12월", [3, 1]],
    ]);
  });

  it("다음 달에 마감한 주간 기록이 먼저 와도 다음 달 묶음을 위에 둔다", () => {
    const weekly = {
      ...record(3, "2026-12-28"),
      period: "WEEKLY" as const,
      closesAt: "2027-01-03T15:00:00Z",
    };

    const groups = groupRecordsByMonth([weekly, record(4, "2027-01-02")], 2027);

    expect(groups.map((group) => [group.label, group.items.map((item) => item.id)])).toEqual([
      ["1월", [4]],
      ["2026년 12월", [3]],
    ]);
  });

  it("올해가 아니면 연도를 붙인다", () => {
    expect(groupRecordsByMonth([record(1, "2025-12-30")], 2026)[0]!.label).toBe("2025년 12월");
  });

  it("비어 있으면 빈 배열", () => {
    expect(groupRecordsByMonth([], 2026)).toEqual([]);
  });
});
