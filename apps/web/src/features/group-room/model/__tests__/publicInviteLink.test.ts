import { describe, expect, it } from "vitest";

import { publicInviteCode, publicInviteLink } from "../publicInviteLink";

describe("공개 그룹 초대 링크", () => {
  it("그룹 ID 앞에 g-를 붙인 코드를 만든다", () => {
    expect(publicInviteCode(12)).toBe("g-12");
  });

  it("지금 떠 있는 웹 주소로 참여 링크를 만든다", () => {
    expect(publicInviteLink(12)).toBe(`${window.location.origin}/social/join?code=g-12`);
  });
});
