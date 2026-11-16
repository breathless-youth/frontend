import { describe, expect, it } from "vitest";

import type { Mascot, MascotId } from "../../types";
import { sortMascots } from "../mascotOrder";

function mascot(id: MascotId, unlockHours: number, price: number | null = null): Mascot {
  return {
    id,
    price,
    unlockFocusSec: unlockHours * 3600,
    unlocked: false,
    selected: false,
    newlyUnlocked: false,
  };
}

describe("sortMascots", () => {
  it("공부 시간으로 여는 마스코트를 여는 시간 순서로 두고 포인트로 사는 마스코트를 맨 뒤에 둔다", () => {
    // 서버는 포인트로 사는 마스코트의 여는 시간을 0으로 주므로 시간만 보면 처음 마스코트와 섞인다.
    const fromServer = [
      mascot("camcorder", 0, 1000),
      mascot("book", 30),
      mascot("stopwatch", 0),
      mascot("lamp", 50),
      mascot("pencil", 2),
      mascot("padlock", 20),
      mascot("planner", 10),
    ];

    expect(sortMascots(fromServer).map((entry) => entry.id)).toEqual([
      "stopwatch",
      "pencil",
      "planner",
      "padlock",
      "book",
      "lamp",
      "camcorder",
    ]);
  });

  it("기준이 같으면 서버가 준 순서를 지키고 받은 목록은 바꾸지 않는다", () => {
    const fromServer = [mascot("lamp", 10), mascot("book", 10), mascot("planner", 0)];

    expect(sortMascots(fromServer).map((entry) => entry.id)).toEqual(["planner", "lamp", "book"]);
    expect(fromServer.map((entry) => entry.id)).toEqual(["lamp", "book", "planner"]);
  });
});
