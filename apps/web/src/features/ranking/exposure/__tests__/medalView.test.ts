import type { RankingRecord } from "@focusmakers/types";
import { describe, expect, it } from "vitest";

import {
  FIXTURE_UNSEEN_FIVE,
  FIXTURE_UNSEEN_MIXED,
  FIXTURE_UNSEEN_ONE,
  FIXTURE_UNSEEN_THREE,
  FIXTURE_UNSEEN_WEEKLY_THIRD,
} from "@/lib/rankingFixtures";

import { closesAtLabel, medalModalView, medalPeriodLabel } from "../medalView";

function daily(id: number, periodStart: string, rank: 1 | 2 | 3, closesAt: string): RankingRecord {
  return {
    id,
    type: "FOCUS_TIME",
    period: "DAILY",
    slot: null,
    periodStart,
    rank,
    value: 3600,
    closesAt,
  };
}

describe("표기", () => {
  it("메달 위 기간은 일간이면 요일을 붙이고 주간·월간은 기록 목록과 같다", () => {
    expect(medalPeriodLabel({ period: "DAILY", periodStart: "2026-10-09" })).toBe("10월 9일 (금)");
    expect(medalPeriodLabel({ period: "WEEKLY", periodStart: "2026-09-28" })).toBe("10월 1주");
    expect(medalPeriodLabel({ period: "MONTHLY", periodStart: "2026-09-01" })).toBe("9월");
  });

  it("마감 시각은 KST 날짜·요일·시로 쓴다", () => {
    expect(closesAtLabel("2026-10-11T15:00:00Z")).toBe("10월 12일 (월) 00시");
    expect(closesAtLabel("2026-10-11T19:00:00Z")).toBe("10월 12일 (월) 04시");
  });
});

describe("medalModalView", () => {
  it("안 본 메달이 없으면 모달이 없다", () => {
    expect(medalModalView({ total: 3, records: [] })).toBeNull();
  });

  it("1위 하나는 큰 메달과 왕관, 기간·판 한 줄, 기록 한 줄이다", () => {
    expect(medalModalView(FIXTURE_UNSEEN_ONE)).toEqual({
      stack: { left: null, center: 1, right: null },
      crown: true,
      eyebrow: "10월 9일 (금) · 일간 · 오전 구간",
      title: "1위로 마감했어요",
      value: "3:04:20",
      rows: [],
      counts: null,
      more: 0,
      total: 19,
      count: 1,
      bestRank: 1,
      mixed: false,
    });
  });

  it("주간 3위 하나는 왕관이 없고 주 이름을 쓴다", () => {
    expect(medalModalView(FIXTURE_UNSEEN_WEEKLY_THIRD)).toMatchObject({
      crown: false,
      eyebrow: "10월 1주 · 주간 · 순공",
      title: "3위로 마감했어요",
      value: "41:20:00",
    });
  });

  it("같은 날 셋은 가운데 1위·오른쪽 2위·왼쪽 3위로 겹치고 줄마다 순위로 마감을 쓴다", () => {
    expect(medalModalView(FIXTURE_UNSEEN_THREE)).toMatchObject({
      stack: { left: 3, center: 1, right: 2 },
      crown: true,
      eyebrow: "10월 9일 (금) · 일간",
      title: "메달 3개를 땄어요",
      value: null,
      rows: [
        { id: 41, rank: 1, name: "오전 구간", detail: "1위로 마감", value: "3:04:20" },
        { id: 43, rank: 2, name: "순공", detail: "2위로 마감", value: "9:40:10" },
        { id: 44, rank: 3, name: "저녁 구간", detail: "3위로 마감", value: "2:48:00" },
      ],
      counts: null,
      more: 0,
      mixed: false,
    });
  });

  it("4개 이상은 금·은·동 개수와 앞 3개, 나머지 개수를 쓴다", () => {
    const view = medalModalView(FIXTURE_UNSEEN_FIVE)!;

    expect(view.title).toBe("메달 5개를 땄어요");
    expect(view.counts).toEqual([
      { rank: 1, count: 2 },
      { rank: 2, count: 1 },
      { rank: 3, count: 2 },
    ]);
    expect(view.rows.map((row) => row.name)).toEqual(["오전 구간", "새벽 구간", "순공"]);
    expect(view.more).toBe(2);
  });

  it("개수 줄에서 0개인 순위는 뺀다", () => {
    const records = [
      daily(1, "2026-10-09", 1, "2026-10-09T15:00:00Z"),
      daily(2, "2026-10-09", 1, "2026-10-09T15:00:00Z"),
      daily(3, "2026-10-09", 2, "2026-10-09T15:00:00Z"),
      daily(4, "2026-10-09", 2, "2026-10-09T15:00:00Z"),
    ];

    expect(medalModalView({ total: 4, records })!.counts).toEqual([
      { rank: 1, count: 2 },
      { rank: 2, count: 2 },
    ]);
  });

  it.each([
    ["둘(은·동)", [2, 3]],
    ["둘(금·금)", [1, 1]],
    ["넷(모두 은)", [2, 2, 2, 2]],
    ["넷(금·동)", [1, 1, 1, 3]],
    ["다섯(금·은·동)", [1, 1, 2, 3, 3]],
  ] as const)("%s이어도 그림은 늘 가운데 1위·오른쪽 2위·왼쪽 3위와 왕관이다", (_, ranks) => {
    const records = ranks.map((rank, index) =>
      daily(index + 1, "2026-10-09", rank, "2026-10-09T15:00:00Z"),
    );

    expect(medalModalView({ total: ranks.length, records })).toMatchObject({
      stack: { left: 3, center: 1, right: 2 },
      crown: true,
    });
  });

  it("여럿일 때 가장 높은 순위는 그림이 아니라 실제 메달에서 고른다", () => {
    const records = [
      daily(1, "2026-10-09", 2, "2026-10-09T15:00:00Z"),
      daily(2, "2026-10-09", 3, "2026-10-09T15:00:00Z"),
    ];

    expect(medalModalView({ total: 2, records })!.bestRank).toBe(2);
  });

  it("기간이 섞이고 마감 시각이 같으면 위 줄은 마감 시각, 줄마다 기간을 쓴다", () => {
    expect(medalModalView(FIXTURE_UNSEEN_MIXED)).toMatchObject({
      eyebrow: "10월 12일 (월) 00시 마감",
      mixed: true,
      rows: [
        { detail: "일간 · 1위로 마감" },
        { detail: "주간 · 2위로 마감", value: "38:12:40" },
        { detail: "일간 · 3위로 마감" },
      ],
    });
  });

  it("마감 시각이 여럿이면 가장 늦은 마감을 위에 쓰고 줄마다 기간 표기를 쓴다", () => {
    const records = [
      daily(1, "2026-10-09", 1, "2026-10-09T15:00:00Z"),
      daily(2, "2026-10-10", 2, "2026-10-10T15:00:00Z"),
    ];

    expect(medalModalView({ total: 2, records })).toMatchObject({
      eyebrow: "10월 11일 (일) 00시 마감",
      mixed: true,
      rows: [{ detail: "10월 9일 · 1위로 마감" }, { detail: "10월 10일 · 2위로 마감" }],
    });
  });
});
