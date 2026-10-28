import { describe, expect, it } from "vitest";

import {
  DEFAULT_HALL_BOARD,
  DEFAULT_RANKING_BOARD,
  LIVE_SLOTS,
  SLOT_SUBJECT,
  boardKeyOf,
  boardParams,
  currentSlot,
  isLiveBoard,
  isOffSlot,
  modeOf,
  periodsOf,
  sameSelection,
  selectPeriod,
  selectSlot,
  selectType,
  selectionOfRecord,
} from "../board";

/** KST 시각을 UTC ms로 바꾼다. */
function kst(iso: string): number {
  return Date.parse(`${iso}+09:00`);
}

describe("허용 기간", () => {
  it("순공은 일·주·월, 집중률은 주·월, 시간대는 일·주, 명예의 전당은 없다", () => {
    expect(periodsOf("FOCUS_TIME")).toEqual(["DAILY", "WEEKLY", "MONTHLY"]);
    expect(periodsOf("FOCUS_RATE")).toEqual(["WEEKLY", "MONTHLY"]);
    expect(periodsOf("TIME_SLOT")).toEqual(["DAILY", "WEEKLY"]);
    expect(periodsOf("MAX_STREAK")).toEqual([]);
  });
});

describe("종목 바꾸기", () => {
  it("지금 기간이 그 종목에 없으면 주간으로 바꾼다", () => {
    expect(selectType({ type: "FOCUS_TIME", period: "DAILY" }, "FOCUS_RATE")).toEqual({
      type: "FOCUS_RATE",
      period: "WEEKLY",
    });
    expect(selectType({ type: "FOCUS_TIME", period: "MONTHLY" }, "TIME_SLOT")).toEqual({
      type: "TIME_SLOT",
      period: "WEEKLY",
      slot: null,
    });
  });

  it("지금 기간이 그 종목에 있으면 그대로 둔다", () => {
    expect(selectType({ type: "FOCUS_TIME", period: "MONTHLY" }, "FOCUS_RATE")).toEqual({
      type: "FOCUS_RATE",
      period: "MONTHLY",
    });
    expect(selectType({ type: "FOCUS_TIME", period: "DAILY" }, "TIME_SLOT")).toEqual({
      type: "TIME_SLOT",
      period: "DAILY",
      slot: null,
    });
  });

  it("명예의 전당 종목은 기간이 없다", () => {
    expect(selectType(DEFAULT_RANKING_BOARD, "MAX_STREAK")).toEqual({ type: "MAX_STREAK" });
  });

  it("기간 없는 판에서 순공으로 가면 일간이다", () => {
    expect(selectType(DEFAULT_HALL_BOARD, "FOCUS_TIME")).toEqual({
      type: "FOCUS_TIME",
      period: "DAILY",
    });
  });
});

describe("기간과 구간 바꾸기", () => {
  it("허용되지 않은 기간은 무시한다", () => {
    const rate = { type: "FOCUS_RATE", period: "WEEKLY" } as const;
    expect(selectPeriod(rate, "DAILY")).toBe(rate);
    expect(selectPeriod(rate, "MONTHLY")).toEqual({ type: "FOCUS_RATE", period: "MONTHLY" });
  });

  it("시간대 판에서 기간을 바꿔도 고른 구간은 남는다", () => {
    expect(selectPeriod({ type: "TIME_SLOT", period: "DAILY", slot: "EVENING" }, "WEEKLY")).toEqual(
      { type: "TIME_SLOT", period: "WEEKLY", slot: "EVENING" },
    );
  });

  it("구간은 시간대 판에서만 바뀐다", () => {
    expect(selectSlot(DEFAULT_RANKING_BOARD, "NIGHT")).toBe(DEFAULT_RANKING_BOARD);
    expect(selectSlot({ type: "TIME_SLOT", period: "DAILY", slot: null }, "NIGHT")).toEqual({
      type: "TIME_SLOT",
      period: "DAILY",
      slot: "NIGHT",
    });
  });
});

describe("판 성질", () => {
  it("명예의 전당 종목이면 hall이다", () => {
    expect(modeOf(DEFAULT_HALL_BOARD)).toBe("hall");
    expect(modeOf(DEFAULT_RANKING_BOARD)).toBe("ranking");
  });

  it("실시간 판은 순공과 시간대다", () => {
    expect(isLiveBoard(DEFAULT_RANKING_BOARD)).toBe(true);
    expect(isLiveBoard({ type: "TIME_SLOT", period: "DAILY", slot: null })).toBe(true);
    expect(isLiveBoard({ type: "FOCUS_RATE", period: "WEEKLY" })).toBe(false);
    expect(isLiveBoard(DEFAULT_HALL_BOARD)).toBe(false);
  });

  it("같은 판인지 비교하고, 비교 키에는 서버가 고른 구간이 들어간다", () => {
    expect(sameSelection({ type: "FOCUS_TIME", period: "DAILY" }, DEFAULT_RANKING_BOARD)).toBe(
      true,
    );
    expect(
      sameSelection(
        { type: "TIME_SLOT", period: "DAILY", slot: null },
        { type: "TIME_SLOT", period: "DAILY", slot: "NIGHT" },
      ),
    ).toBe(false);
    expect(boardKeyOf({ type: "TIME_SLOT", period: "DAILY", slot: null }, "MORNING")).toBe(
      "TIME_SLOT:DAILY:MORNING",
    );
    expect(boardKeyOf(DEFAULT_HALL_BOARD, null)).toBe("TOTAL_TIME:-:-");
  });
});

describe("지금 구간 (KST)", () => {
  it("판이 있는 구간은 심야·아침·점심·저녁 4개다", () => {
    expect(LIVE_SLOTS).toEqual(["NIGHT", "MORNING", "AFTERNOON", "EVENING"]);
  });

  it.each([
    ["2026-10-09T23:59:59", "EVENING"],
    ["2026-10-10T00:00:00", "NIGHT"],
    ["2026-10-10T05:59:59", "NIGHT"],
    ["2026-10-10T06:00:00", "MORNING"],
    ["2026-10-10T11:59:59", "MORNING"],
    ["2026-10-10T12:00:00", "AFTERNOON"],
    ["2026-10-10T17:59:59", "AFTERNOON"],
    ["2026-10-10T18:00:00", "EVENING"],
  ])("%s는 %s", (iso, slot) => {
    expect(currentSlot(kst(iso))).toBe(slot);
  });

  it("시각을 읽지 못하면 심야로 본다", () => {
    expect(currentSlot(Number.NaN)).toBe("NIGHT");
  });
});

describe("지금 구간이 아닌 시간대 판", () => {
  const NIGHT_NOW = kst("2026-10-11T01:30:00");

  it("1시 30분에 심야 판은 지금 구간이고 아침 판은 아니다", () => {
    expect(isOffSlot({ type: "TIME_SLOT", period: "DAILY", slot: "NIGHT" }, NIGHT_NOW)).toBe(false);
    expect(isOffSlot({ type: "TIME_SLOT", period: "DAILY", slot: "MORNING" }, NIGHT_NOW)).toBe(
      true,
    );
  });

  it("주간 시간대 판도 같은 규칙을 따른다", () => {
    expect(isOffSlot({ type: "TIME_SLOT", period: "WEEKLY", slot: "NIGHT" }, NIGHT_NOW)).toBe(
      false,
    );
    expect(isOffSlot({ type: "TIME_SLOT", period: "WEEKLY", slot: "MORNING" }, NIGHT_NOW)).toBe(
      true,
    );
  });

  it("시간대 판이 아니면 아니다", () => {
    expect(isOffSlot({ type: "FOCUS_TIME", period: "DAILY", slot: null }, NIGHT_NOW)).toBe(false);
  });
});

describe("기록에서 판 만들기", () => {
  it("기록의 종목·기간·구간으로 지금 판을 고른다", () => {
    expect(selectionOfRecord({ type: "TIME_SLOT", period: "DAILY", slot: "MORNING" })).toEqual({
      type: "TIME_SLOT",
      period: "DAILY",
      slot: "MORNING",
    });
    expect(selectionOfRecord({ type: "FOCUS_RATE", period: "MONTHLY", slot: null })).toEqual({
      type: "FOCUS_RATE",
      period: "MONTHLY",
    });
    expect(selectionOfRecord({ type: "FOCUS_TIME", period: "DAILY", slot: null })).toEqual({
      type: "FOCUS_TIME",
      period: "DAILY",
    });
  });

  it("판이 없어진 새벽 기록은 기록의 기간으로 시간대 판의 지금 구간을 연다", () => {
    expect(selectionOfRecord({ type: "TIME_SLOT", period: "DAILY", slot: "DAWN" })).toEqual({
      type: "TIME_SLOT",
      period: "DAILY",
      slot: null,
    });
  });

  it("허용되지 않은 조합이 오면 주간으로 맞춘다", () => {
    expect(selectionOfRecord({ type: "FOCUS_RATE", period: "DAILY", slot: null })).toEqual({
      type: "FOCUS_RATE",
      period: "WEEKLY",
    });
  });
});

describe("구간 이름 조사", () => {
  it("받침이 없는 심야는 가를 붙인다", () => {
    expect(SLOT_SUBJECT).toEqual({
      NIGHT: "심야가",
      MORNING: "아침이",
      AFTERNOON: "점심이",
      EVENING: "저녁이",
      DAWN: "새벽이",
    });
  });
});

describe("boardParams", () => {
  it("요청 파라미터로 바꾸고 지금 구간이면 slot을 뺀다", () => {
    expect(boardParams({ type: "TIME_SLOT", period: "DAILY", slot: null })).toEqual({
      type: "TIME_SLOT",
      period: "DAILY",
    });
    expect(boardParams({ type: "TIME_SLOT", period: "DAILY", slot: "NIGHT" }, -1)).toEqual({
      type: "TIME_SLOT",
      period: "DAILY",
      slot: "NIGHT",
      offset: -1,
    });
    expect(boardParams({ type: "MAX_STREAK" })).toEqual({ type: "MAX_STREAK" });
  });
});
