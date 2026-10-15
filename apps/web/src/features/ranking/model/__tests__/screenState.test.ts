import { describe, expect, it } from "vitest";

import {
  FIXTURE_FIRST,
  FIXTURE_FIRST_PLACE,
  FIXTURE_FIRST_PREVIOUS,
  FIXTURE_FOCUS_WEEKLY,
  FIXTURE_INELIGIBLE,
  FIXTURE_RATE_WEEKLY,
  FIXTURE_RESET_DAILY,
  FIXTURE_RESET_PREVIOUS,
  FIXTURE_STREAK,
  FIXTURE_TOTAL_DAYS,
  FIXTURE_TOTAL_TIME,
} from "@/lib/rankingFixtures";

import {
  aroundForScreen,
  aroundGroupsForScreen,
  classifyBoard,
  needsPreviousPeriod,
  viewStateOf,
} from "../screenState";

describe("classifyBoard", () => {
  it.each([
    ["연속 공부는 순위가 있으면 streak", FIXTURE_STREAK, null, "streak"],
    ["내가 1위면 first_place", FIXTURE_FIRST_PLACE, null, "first_place"],
    ["순위가 있으면 ranked", FIXTURE_FOCUS_WEEKLY, null, "ranked"],
    ["집중률 순위도 ranked", FIXTURE_RATE_WEEKLY, null, "ranked"],
    ["누적 순위도 ranked", FIXTURE_TOTAL_TIME, null, "ranked"],
    ["집중률에서 순위가 없으면 ineligible", FIXTURE_INELIGIBLE, null, "ineligible"],
    ["직전 기간에 순위가 있었으면 reset", FIXTURE_RESET_DAILY, FIXTURE_RESET_PREVIOUS, "reset"],
    ["직전 기간에도 없으면 first", FIXTURE_FIRST, FIXTURE_FIRST_PREVIOUS, "first"],
    ["직전 기간을 못 받았으면 first", FIXTURE_FIRST, null, "first"],
    ["명예의 전당에서 순위가 없으면 first", { ...FIXTURE_TOTAL_TIME, me: null }, null, "first"],
  ] as const)("%s", (_, board, previous, screen) => {
    expect(classifyBoard(board, previous)).toBe(screen);
  });
});

describe("needsPreviousPeriod", () => {
  it("순공·시간대 판에서 내 순위가 없을 때만 직전 기간을 받는다", () => {
    expect(needsPreviousPeriod(FIXTURE_FIRST)).toBe(true);
    expect(needsPreviousPeriod(FIXTURE_FOCUS_WEEKLY)).toBe(false);
    expect(needsPreviousPeriod(FIXTURE_INELIGIBLE)).toBe(false);
    expect(needsPreviousPeriod({ ...FIXTURE_TOTAL_TIME, me: null })).toBe(false);
  });
});

describe("viewStateOf", () => {
  it("연속 공부는 ranked로 센다", () => {
    expect(viewStateOf("streak")).toBe("ranked");
    expect(viewStateOf("reset")).toBe("reset");
  });
});

describe("aroundForScreen", () => {
  it("1위면 나와 뒤 2명만 남긴다", () => {
    expect(
      aroundForScreen(FIXTURE_FIRST_PLACE.around, "first_place", 1).map((row) => row.rank),
    ).toEqual([1, 2, 3]);
  });

  it("그 밖에는 서버가 준 대로 둔다", () => {
    expect(aroundForScreen(FIXTURE_FOCUS_WEEKLY.around, "ranked", 1205)).toHaveLength(5);
  });
});

describe("aroundGroupsForScreen", () => {
  // 공동 1위 묶음이 맨 앞이고 서버는 뒤 4묶음을 더 보낸다.
  // 묶음 순위는 1·4·5·7·8이라 순위 차로 자르면 내 묶음만 남는다.
  const tiedFirst = [
    { ...FIXTURE_TOTAL_DAYS.aroundGroups![0]!, rank: 1, me: true, myOrder: 2, othersCount: 2 },
    { ...FIXTURE_TOTAL_DAYS.aroundGroups![1]!, rank: 4, othersCount: 0 },
    { ...FIXTURE_TOTAL_DAYS.aroundGroups![3]!, rank: 5, othersCount: 1 },
    { ...FIXTURE_TOTAL_DAYS.aroundGroups![4]!, rank: 7, othersCount: 0 },
    { ...FIXTURE_TOTAL_DAYS.aroundGroups![2]!, rank: 8, me: false, myOrder: null },
  ];

  it("1위면 순위가 아니라 순서로 세어 내 묶음과 뒤 2묶음만 남긴다", () => {
    expect(aroundGroupsForScreen(tiedFirst, "first_place").map((group) => group.rank)).toEqual([
      1, 4, 5,
    ]);
  });

  it("1위여도 내 묶음이 없으면 입력을 그대로 돌려준다", () => {
    const noMe = tiedFirst.map((group) => ({ ...group, me: false, myOrder: null }));

    expect(aroundGroupsForScreen(noMe, "first_place")).toEqual(noMe);
  });

  it("그 밖에는 서버가 준 대로 둔다", () => {
    const groups = FIXTURE_TOTAL_DAYS.aroundGroups!;
    const result = aroundGroupsForScreen(groups, "ranked");

    expect(result).toHaveLength(5);
    expect(result).toEqual(groups);
  });
});
