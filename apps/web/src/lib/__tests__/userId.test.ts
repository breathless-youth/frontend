import { describe, expect, it } from "vitest";

import { parseUserId } from "@/lib/userId";

describe("parseUserId", () => {
  it("양의 정수 문자열만 숫자로 받는다", () => {
    expect(parseUserId("7")).toBe(7);
  });

  it.each([null, "", "0", "-1", "1.5", "abc", "1abc"])("%s 는 null", (raw) => {
    expect(parseUserId(raw)).toBeNull();
  });
});
