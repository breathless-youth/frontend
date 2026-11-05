import { describe, expect, it } from "vitest";

import { INVITE_CODE_LENGTH, isCompleteInviteCode, normalizeInviteCode } from "../inviteCode";

describe("normalizeInviteCode", () => {
  it("대문자로 맞추고 영문·숫자가 아닌 글자를 버린 뒤 6자리까지 자른다", () => {
    expect(normalizeInviteCode("ab12 cd")).toBe("AB12CD");
    expect(normalizeInviteCode("ａｂ１２ｃｄ")).toBe("AB12CD");
    expect(normalizeInviteCode("AB-12-CD-99")).toBe("AB12CD");
    expect(normalizeInviteCode("가나다")).toBe("");
  });

  it("서버 코드에 쓰지 않는 글자도 버리지 않는다", () => {
    expect(normalizeInviteCode("o0il1a")).toBe("O0IL1A");
  });
});

describe("isCompleteInviteCode", () => {
  it("영문 대문자와 숫자 6자리만 완성이다", () => {
    expect(INVITE_CODE_LENGTH).toBe(6);
    expect(isCompleteInviteCode("AB12CD")).toBe(true);
    expect(isCompleteInviteCode("AB12C")).toBe(false);
    expect(isCompleteInviteCode("ab12cd")).toBe(false);
  });
});
