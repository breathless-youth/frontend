import { describe, expect, it } from "vitest";

import { groupFieldError } from "../fieldError";

describe("groupFieldError", () => {
  it("한도 안의 평범한 글에는 오류가 없다", () => {
    expect(groupFieldError("9급 행정직 준비 중이에요", 50, true)).toBeNull();
  });

  it("한도를 넘으면 한도를 알린다", () => {
    expect(groupFieldError("가".repeat(51), 50, false)).toBe("50자까지 쓸 수 있어요");
  });

  it("끝에 붙은 공백은 글자 수에 넣지 않는다", () => {
    expect(groupFieldError(`${"가".repeat(50)}  `, 50, false)).toBeNull();
  });

  it("연락처를 보는 칸이면 연락처나 링크를 알린다", () => {
    expect(groupFieldError("카톡 abc123", 50, true)).toBe("연락처나 링크는 보낼 수 없어요");
  });

  it("연락처를 보지 않는 칸이면 연락처가 있어도 오류가 없다", () => {
    expect(groupFieldError("카톡 abc123", 100, false)).toBeNull();
  });

  it("한도를 넘은 글에 연락처도 있으면 한도만 알린다", () => {
    expect(groupFieldError(`카톡 abc123 ${"가".repeat(45)}`, 50, true)).toBe(
      "50자까지 쓸 수 있어요",
    );
  });
});
