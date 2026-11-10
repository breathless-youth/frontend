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

  it.each(["go-12", "GO-12", " go-12 ", "go-12."])("공개 그룹 링크 %s는 그룹 12다", (raw) => {
    expect(parseInviteParam(raw)).toEqual({ kind: "public", groupId: 12 });
  });

  it("공개 그룹 ID가 다섯 자리여도 6자리 그룹 코드로 읽지 않는다", () => {
    expect(parseInviteParam("go-12345")).toEqual({ kind: "public", groupId: 12345 });
  });

  it.each(["go-0", "go-", "go-abc", "go-012", "go-abcde", "go-01234", "g-23456"])(
    "그룹 ID가 아닌 %s는 어느 링크도 아니다",
    (raw) => {
      expect(parseInviteParam(raw)).toBeNull();
    },
  );
});
