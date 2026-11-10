import { describe, expect, it } from "vitest";

import { publicInviteCode, publicInviteLink } from "../publicInviteLink";

describe("공개 그룹 초대 링크", () => {
  it("그룹 ID 앞에 go-를 붙인 코드를 만든다", () => {
    expect(publicInviteCode(12)).toBe("go-12");
  });

  // 앱 셸은 하이픈을 지우고 대문자로 바꾼 6자리가 서버 초대코드 글자면 그룹 초대코드로 넘긴다.
  it.each([23456, 2345, 99999])(
    "앱 셸이 정리해도 그룹 %i의 코드는 6자리 초대코드가 되지 않는다",
    (groupId) => {
      const shellNormalized = publicInviteCode(groupId).replace(/[\s-]/g, "").toUpperCase();
      expect(shellNormalized).not.toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    },
  );

  it("지금 떠 있는 웹 주소로 참여 링크를 만든다", () => {
    expect(publicInviteLink(12)).toBe(`${window.location.origin}/social/join?code=go-12`);
  });
});
