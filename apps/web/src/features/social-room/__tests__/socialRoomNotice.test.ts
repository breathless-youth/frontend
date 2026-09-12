import { afterEach, describe, expect, it } from "vitest";

import { consumeSocialRoomNotice, markSocialRoomNotice } from "../socialRoomNotice";

afterEach(() => localStorage.clear());

describe("socialRoomNotice", () => {
  it("kind와 message를 저장하고 1회 소비 후 지운다", () => {
    markSocialRoomNotice({ kind: "grace-end", message: "안내" });
    expect(consumeSocialRoomNotice()).toEqual({ kind: "grace-end", message: "안내" });
    expect(consumeSocialRoomNotice()).toBeNull();
  });

  it("옛 평문 문자열은 실패 토스트로 처리한다", () => {
    localStorage.setItem("focusmakers:social-room-notice", "옛 문구");
    expect(consumeSocialRoomNotice()).toEqual({ kind: "failure", message: "옛 문구" });
  });

  it("저장된 값이 없으면 null", () => {
    expect(consumeSocialRoomNotice()).toBeNull();
  });
});
