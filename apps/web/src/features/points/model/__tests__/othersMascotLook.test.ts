import { afterEach, describe, expect, it, vi } from "vitest";

import { isPointsEnabled } from "@/lib/pointsCapability";

import { toOthersMascotLook } from "../othersMascotLook";

vi.mock("@/lib/pointsCapability", () => ({ isPointsEnabled: vi.fn(() => true) }));

afterEach(() => {
  vi.mocked(isPointsEnabled).mockReturnValue(true);
});

const appearance = {
  mascotCode: "PLANNER",
  accessories: [
    {
      mascotCode: "PLANNER",
      slot: "HEAD",
      item: { itemId: 3, code: "PLANNER_HEAD_CROWN", imageUrl: "/crown.png" },
    },
  ],
};

describe("toOthersMascotLook", () => {
  it("서버가 준 모습을 그릴 수 있는 모양으로 바꾼다", () => {
    expect(toOthersMascotLook(appearance)).toEqual({
      id: "planner",
      accessories: [{ slot: "head", code: "PLANNER_HEAD_CROWN", imageUrl: "/crown.png" }],
    });
  });

  it("모습이 없는 응답이면 null이라 지금 기본 그림을 쓴다", () => {
    expect(toOthersMascotLook(undefined)).toBeNull();
    expect(toOthersMascotLook(null)).toBeNull();
  });

  it("포인트를 열지 않은 곳에서는 모습이 와도 null이다", () => {
    vi.mocked(isPointsEnabled).mockReturnValue(false);
    expect(toOthersMascotLook(appearance)).toBeNull();
  });
});
