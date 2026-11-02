import { describe, expect, it } from "vitest";

import type { DeskMember } from "../desks";
import {
  arrangeDesks,
  deskTone,
  liveRankSeconds,
  liveSeconds,
  roomStatusText,
  studyingCount,
  studyingCountText,
} from "../desks";

function member(
  userId: number,
  presence: DeskMember["presence"],
  todayStudySec: number,
): DeskMember {
  return {
    userId,
    nickname: `멤버${userId}`,
    isOwner: false,
    presence,
    todayStudySec,
    lastStudiedAt: null,
    accumulating: presence === "this_room" || presence === "studying_elsewhere",
  };
}

describe("deskTone", () => {
  it("공부방은 파랑, 다른 곳 측정은 초록, 다른 곳 일시정지와 쉼은 회색이다", () => {
    expect(deskTone("this_room")).toBe("room");
    expect(deskTone("studying_elsewhere")).toBe("elsewhere");
    expect(deskTone("paused_elsewhere")).toBe("rest");
    expect(deskTone("away")).toBe("rest");
  });
});

describe("arrangeDesks", () => {
  it("공부방, 다른 곳, 쉼, 빈자리 순서이고 같은 색 안에서는 오늘 순공이 많은 사람이 앞이다", () => {
    const slots = arrangeDesks([
      member(1, "this_room", 1000),
      member(2, "away", 5000),
      member(3, "studying_elsewhere", 3000),
      member(4, "this_room", 2000),
      member(5, "paused_elsewhere", 100),
    ]);
    expect(slots.map((slot) => (slot.kind === "member" ? slot.member.userId : "empty"))).toEqual([
      4,
      1,
      3,
      2,
      5,
      "empty",
    ]);
    expect(slots.map((slot) => (slot.kind === "member" ? slot.tone : "empty"))).toEqual([
      "room",
      "room",
      "elsewhere",
      "rest",
      "rest",
      "empty",
    ]);
  });

  it("같은 색과 같은 시간이면 받은 순서를 지킨다", () => {
    const slots = arrangeDesks([
      member(7, "this_room", 600),
      member(8, "this_room", 600),
      member(9, "this_room", 600),
    ]);
    expect(
      slots.slice(0, 3).map((slot) => (slot.kind === "member" ? slot.member.userId : 0)),
    ).toEqual([7, 8, 9]);
  });

  it("빈자리로 6자리를 채운다", () => {
    expect(
      arrangeDesks([member(1, "away", 0)]).filter((slot) => slot.kind === "empty"),
    ).toHaveLength(5);
    expect(
      arrangeDesks([1, 2, 3, 4, 5, 6].map((id) => member(id, "away", 0))).some(
        (slot) => slot.kind === "empty",
      ),
    ).toBe(false);
  });

  it("자리보다 멤버가 많으면 정렬한 앞에서 자리 수만큼만 둔다", () => {
    const slots = arrangeDesks(
      [1, 2, 3].map((id) => member(id, "away", id * 100)),
      2,
    );
    expect(slots.map((slot) => (slot.kind === "member" ? slot.member.userId : "empty"))).toEqual([
      3, 2,
    ]);
  });
});

describe("공부 중인 사람 수", () => {
  it("파랑과 초록을 더한다", () => {
    const members = [
      member(1, "this_room", 0),
      member(2, "studying_elsewhere", 0),
      member(3, "paused_elsewhere", 0),
    ];
    expect(studyingCount(members)).toBe(2);
    expect(roomStatusText(members)).toBe("2명 공부 중");
  });

  it("아무도 공부하지 않으면 지금은 아무도 없어요다", () => {
    expect(roomStatusText([member(1, "away", 0)])).toBe("지금은 아무도 없어요");
  });

  it("멤버 목록 없이 받은 수로도 같은 문장을 만든다", () => {
    expect(studyingCountText(3)).toBe("3명 공부 중");
    expect(studyingCountText(0)).toBe("지금은 아무도 없어요");
  });
});

describe("liveSeconds", () => {
  it("순공이 쌓이는 중일 때만 흐른 초를 더하고 음수는 0으로 본다", () => {
    expect(liveSeconds(100, true, 5)).toBe(105);
    expect(liveSeconds(100, false, 5)).toBe(100);
    expect(liveSeconds(100, true, -3)).toBe(100);
  });
});

describe("liveRankSeconds", () => {
  it("순공이 쌓이는 중인 줄만 흐른 초를 더한다", () => {
    expect(
      liveRankSeconds(
        [
          { weeklyStudySec: 1000, accumulating: true },
          { weeklyStudySec: 500, accumulating: false },
        ],
        30,
      ),
    ).toEqual([1030, 500]);
  });

  it("아래 줄이 위 줄을 넘지 않는다", () => {
    expect(
      liveRankSeconds(
        [
          { weeklyStudySec: 1000, accumulating: false },
          { weeklyStudySec: 995, accumulating: true },
          { weeklyStudySec: 990, accumulating: true },
          { weeklyStudySec: 500, accumulating: true },
        ],
        30,
      ),
    ).toEqual([1000, 1000, 1000, 530]);
  });
});
