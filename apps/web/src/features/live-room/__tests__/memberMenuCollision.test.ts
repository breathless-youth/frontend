import { describe, expect, it } from "vitest";

import { MEMBER_MENU_BAR_CLEARANCE_PX, memberMenuCollisionPadding } from "../memberMenuCollision";

describe("memberMenuCollisionPadding", () => {
  it("아래로 펼칠 때는 아래쪽 바 자리를 비워 그 자리에 닿기 전에 위로 뒤집는다", () => {
    expect(memberMenuCollisionPadding("below")).toEqual({
      top: 8,
      right: 8,
      bottom: MEMBER_MENU_BAR_CLEARANCE_PX,
      left: 8,
    });
  });

  it("바 자리는 가장 큰 바인 큰 태블릿 바와 아래 여백, 간격을 모두 덮는다", () => {
    // 바 높이 110px, 바 아래 여백 37px, 메뉴와의 간격 8px
    expect(MEMBER_MENU_BAR_CLEARANCE_PX).toBeGreaterThanOrEqual(110 + 37 + 8);
  });

  it("가로에서 위로 펼칠 때는 화면 가장자리만 피한다", () => {
    expect(memberMenuCollisionPadding("above")).toBe(8);
  });
});
