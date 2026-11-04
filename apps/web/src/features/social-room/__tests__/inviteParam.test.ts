import { describe, expect, it } from "vitest";

import { parseInviteParam } from "../inviteParam";

describe("parseInviteParam", () => {
  it.each([
    ["3712", { kind: "room", code: "3712" }],
    ["0712", { kind: "room", code: "0712" }],
    ["k7m2pq", { kind: "group", code: "K7M2PQ" }],
    ["123456", { kind: "group", code: "123456" }],
    ["12345", null],
    [null, null],
  ] as const)("%s는 %o다", (raw, expected) => {
    expect(parseInviteParam(raw)).toEqual(expected);
  });

  it("링크 끝에 붙은 공백이나 문장 부호는 빼고 본다", () => {
    expect(parseInviteParam("3712.")).toEqual({ kind: "room", code: "3712" });
    expect(parseInviteParam(" K7Q2MX ")).toEqual({ kind: "group", code: "K7Q2MX" });
  });

  it("빈 코드와 영문이 섞인 4자리는 어느 코드도 아니다", () => {
    expect(parseInviteParam("")).toBeNull();
    expect(parseInviteParam("37A2")).toBeNull();
  });
});
