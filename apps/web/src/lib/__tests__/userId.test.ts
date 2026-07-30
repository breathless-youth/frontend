import { describe, expect, it } from "vitest";

import { parseUserId } from "@/lib/userId";

describe("parseUserId", () => {
  it("양의 정수 문자열만 숫자로 받는다", () => {
    expect(parseUserId("7")).toBe(7);
  });

  it.each([null, "", "0", "-1", "1.5", "abc", "1abc"])("%s 는 null", (raw) => {
    expect(parseUserId(raw)).toBeNull();
  });

  // 비십진 표기·안전 정수 초과는 신뢰 경계에서 거부한다 (적대적 리뷰 회귀 케이스).
  it.each(["0x10", "1e2", " 7", "+7", "9999999999999999999999"])("%s 는 null", (raw) => {
    expect(parseUserId(raw)).toBeNull();
  });
});
