import { describe, expect, it } from "vitest";

import { rankingPopupAllowed } from "../homePopup";

describe("rankingPopupAllowed", () => {
  it("공지·인터뷰·복구 창 중 하나라도 뜬 실행이면 쉰다", () => {
    expect(rankingPopupAllowed({ noticeShown: true, recoveryShown: false })).toBe(false);
    expect(rankingPopupAllowed({ noticeShown: false, recoveryShown: true })).toBe(false);
    expect(rankingPopupAllowed({ noticeShown: false, recoveryShown: false })).toBe(true);
  });
});
