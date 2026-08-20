import { describe, expect, it } from "vitest";

import { isCompleteInviteCode, sanitizeInviteCode } from "../inviteCode";

describe("sanitizeInviteCode", () => {
  it("숫자만 남긴다", () => {
    expect(sanitizeInviteCode("12a4")).toBe("124");
  });

  it("4자를 넘으면 앞에서 4자로 자른다", () => {
    expect(sanitizeInviteCode("371245")).toBe("3712");
  });

  it("붙여넣은 문구에서 코드만 추출한다", () => {
    expect(sanitizeInviteCode("코드: 3712")).toBe("3712");
  });

  it("공백이 섞여도 이어 붙인다", () => {
    expect(sanitizeInviteCode("12 34")).toBe("1234");
  });

  it("빈 문자열은 그대로 빈 문자열이다", () => {
    expect(sanitizeInviteCode("")).toBe("");
  });
});

describe("isCompleteInviteCode", () => {
  it("숫자 4자리면 true다", () => {
    expect(isCompleteInviteCode("3712")).toBe(true);
  });

  it("앞자리가 0이어도 4자리 그대로 유효하다", () => {
    expect(isCompleteInviteCode("0712")).toBe(true);
  });

  it("3자리는 false다", () => {
    expect(isCompleteInviteCode("371")).toBe(false);
  });

  it("숫자가 아닌 문자가 섞이면 false다", () => {
    expect(isCompleteInviteCode("12a4")).toBe(false);
  });
});
