import { describe, expect, it } from "vitest";

import { baseSearch, readGroupTabSearch, writeGroupTabSearch } from "../groupTabSearch";

describe("groupTabSearch", () => {
  it("탭과 시험·목표를 읽고 모르는 값은 버린다", () => {
    expect(readGroupTabSearch("?tab=public&category=CSAT&q=공시")).toEqual({
      tab: "public",
      query: "공시",
      category: "CSAT",
    });
    expect(readGroupTabSearch("?tab=other&category=자격증")).toEqual({
      tab: "mine",
      query: "",
      category: null,
    });
  });

  it("쓸 때 다른 쿼리는 남기고 기본값은 주소에서 뺀다", () => {
    expect(
      writeGroupTabSearch("?nativeTabBar=1&groupRooms=1", { tab: "public", category: "JOB" }),
    ).toBe("?nativeTabBar=1&groupRooms=1&tab=public&category=JOB");
    expect(
      writeGroupTabSearch("?groupRooms=1&tab=public&category=JOB", { tab: "mine", category: null }),
    ).toBe("?groupRooms=1");
    expect(writeGroupTabSearch("?tab=public", { query: "새벽 공시" })).toBe(
      "?tab=public&q=%EC%83%88%EB%B2%BD+%EA%B3%B5%EC%8B%9C",
    );
  });

  it("그룹 탭 밖으로 가는 주소는 탭 조건과 초대코드만 뺀다", () => {
    expect(baseSearch("?groupRooms=1&tab=public&q=a&category=JOB&code=K7M2PQ")).toBe(
      "?groupRooms=1",
    );
    expect(baseSearch("?tab=public")).toBe("");
  });
});
