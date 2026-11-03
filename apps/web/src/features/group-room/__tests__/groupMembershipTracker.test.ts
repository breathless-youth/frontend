import type { MyGroupCard } from "@focusmakers/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";
import { setGroupRoomCount, trackGroupRoomJoined, trackGroupRoomLeft } from "@/lib/amplitude";
import { seedGroupData } from "@/lib/groupRoomMockData";

import {
  markLocalMembership,
  observeMyGroups,
  reportMembershipChanges,
} from "../groupMembershipTracker";

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  setGroupRoomCount: vi.fn(),
  trackGroupRoomJoined: vi.fn(),
  trackGroupRoomLeft: vi.fn(),
}));

/** 기본 장면의 내 그룹 카드 하나이고, 테스트마다 그룹 번호와 공개 여부만 바꿔 쓴다. */
const seedCard = seedGroupData("default", Date.now()).mine.groups[0]!;
const card = (groupId: number, visibility: MyGroupCard["visibility"] = "PUBLIC"): MyGroupCard => ({
  ...seedCard,
  groupId,
  visibility,
});

/** 저장소가 막힌 웹뷰처럼 localStorage 읽기나 쓰기가 실패하게 한다. */
function blockStorage(method: "getItem" | "setItem") {
  vi.spyOn(Storage.prototype, method).mockImplementation(() => {
    throw new DOMException("blocked", "SecurityError");
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("observeMyGroups", () => {
  it("처음 본 목록은 가입·내보내짐으로 세지 않는다", () => {
    expect(observeMyGroups(1, [card(10), card(11)])).toEqual({
      joined: [],
      kicked: [],
      countChanged: true,
    });
  });

  it("새로 생긴 그룹은 신청 가입, 사라진 그룹은 내보내짐이다", () => {
    observeMyGroups(1, [card(10), card(11)]);

    expect(observeMyGroups(1, [card(10), card(12)])).toEqual({
      joined: [{ groupId: 12, visibility: "PUBLIC" }],
      kicked: [11],
      countChanged: false,
    });
  });

  it("같은 목록을 다시 받으면 아무것도 세지 않는다", () => {
    observeMyGroups(1, [card(10), card(11)]);

    expect(observeMyGroups(1, [card(11), card(10)])).toEqual({
      joined: [],
      kicked: [],
      countChanged: false,
    });
  });

  it("이 기기에서 만든 그룹과 코드로 들어간 그룹은 신청 가입으로 세지 않는다", () => {
    observeMyGroups(1, [card(10)]);
    markLocalMembership(1, { kind: "created", groupId: 20 });
    markLocalMembership(1, { kind: "joined_by_code", groupId: 21 });

    expect(observeMyGroups(1, [card(10), card(20), card(21, "PRIVATE")])).toEqual({
      joined: [],
      kicked: [],
      countChanged: true,
    });
  });

  it("이 기기에서 나간 그룹은 내보내짐으로 세지 않는다", () => {
    observeMyGroups(1, [card(10), card(11)]);
    markLocalMembership(1, { kind: "left", groupId: 11 });

    expect(observeMyGroups(1, [card(10)]).kicked).toEqual([]);
  });

  it("한 번 반영한 표시는 다음 비교에 남지 않는다", () => {
    observeMyGroups(1, [card(10)]);
    // 만든 그룹을 넘기고 나간 뒤 같은 그룹에 신청해 받아들여진 경우다.
    markLocalMembership(1, { kind: "created", groupId: 20 });
    observeMyGroups(1, [card(10), card(20)]);
    markLocalMembership(1, { kind: "left", groupId: 20 });
    observeMyGroups(1, [card(10)]);

    expect(observeMyGroups(1, [card(10), card(20)]).joined).toEqual([
      { groupId: 20, visibility: "PUBLIC" },
    ]);
    expect(observeMyGroups(1, [card(10)]).kicked).toEqual([20]);
  });

  it("표시보다 먼저 받아 둔 목록이 오면 표시를 남겨 다음 응답에서 뺀다", () => {
    observeMyGroups(1, [card(10), card(11)]);
    markLocalMembership(1, { kind: "created", groupId: 20 });
    markLocalMembership(1, { kind: "left", groupId: 11 });

    expect(observeMyGroups(1, [card(10), card(11)])).toEqual({
      joined: [],
      kicked: [],
      countChanged: false,
    });
    expect(observeMyGroups(1, [card(10), card(20)])).toEqual({
      joined: [],
      kicked: [],
      countChanged: false,
    });
  });

  it("같은 그룹에 한 일이 이어지면 마지막 일만 본다", () => {
    observeMyGroups(1, [card(10)]);
    // 코드로 들어갔다가 목록을 보기 전에 나갔다.
    markLocalMembership(1, { kind: "joined_by_code", groupId: 21 });
    markLocalMembership(1, { kind: "left", groupId: 21 });
    observeMyGroups(1, [card(10)]);

    // 나중에 신청으로 들어간 것은 표시에 가려지지 않는다.
    expect(observeMyGroups(1, [card(10), card(21)]).joined).toEqual([
      { groupId: 21, visibility: "PUBLIC" },
    ]);
  });

  it("기억은 사용자마다 따로다", () => {
    observeMyGroups(1, [card(10)]);

    expect(observeMyGroups(2, [card(30)])).toEqual({
      joined: [],
      kicked: [],
      countChanged: true,
    });
    expect(observeMyGroups(1, [card(10)])).toEqual({
      joined: [],
      kicked: [],
      countChanged: false,
    });
  });

  it("저장소를 읽을 수 없으면 아무것도 세지 않고 표시도 실패하지 않는다", () => {
    blockStorage("getItem");

    expect(() => markLocalMembership(1, { kind: "created", groupId: 20 })).not.toThrow();
    expect(observeMyGroups(1, [card(10)])).toEqual({
      joined: [],
      kicked: [],
      countChanged: false,
    });
  });

  it("기억을 남기지 못하면 같은 차이를 다시 세지 않도록 아무것도 세지 않는다", () => {
    observeMyGroups(1, [card(10), card(11)]);
    blockStorage("setItem");

    expect(observeMyGroups(1, [card(10)])).toEqual({
      joined: [],
      kicked: [],
      countChanged: false,
    });
  });

  it("망가진 기억은 처음 본 목록처럼 다시 시작한다", () => {
    localStorage.setItem("focusmakers.groupMembership.v1.1", "{");

    expect(observeMyGroups(1, [card(10)])).toEqual({
      joined: [],
      kicked: [],
      countChanged: true,
    });
    expect(observeMyGroups(1, [card(10), card(12)]).joined).toEqual([
      { groupId: 12, visibility: "PUBLIC" },
    ]);
  });
});

describe("reportMembershipChanges", () => {
  it("다른 사람이 받아 준 그룹은 신청 가입으로 공개 여부를 소문자로 보낸다", () => {
    reportMembershipChanges(1, [card(10)]);
    vi.clearAllMocks();

    reportMembershipChanges(1, [card(10), card(12)]);

    expect(trackGroupRoomJoined).toHaveBeenCalledExactlyOnceWith({
      via: "application",
      visibility: "public",
    });
    expect(trackGroupRoomLeft).not.toHaveBeenCalled();
  });

  it("사라진 그룹마다 내보내짐을 보낸다", () => {
    reportMembershipChanges(1, [card(10), card(11), card(12)]);
    vi.clearAllMocks();

    reportMembershipChanges(1, [card(10)]);

    expect(vi.mocked(trackGroupRoomLeft).mock.calls).toEqual([["kicked"], ["kicked"]]);
    expect(trackGroupRoomJoined).not.toHaveBeenCalled();
  });

  it("들어간 그룹 수는 처음 볼 때와 바뀔 때만 사용자 속성으로 보낸다", () => {
    reportMembershipChanges(1, [card(10), card(11)]);
    reportMembershipChanges(1, [card(10), card(12)]);
    reportMembershipChanges(1, [card(10)]);

    expect(vi.mocked(setGroupRoomCount).mock.calls).toEqual([[2], [1]]);
  });

  it("이 기기에서 한 일과 처음 본 목록으로는 가입·내보내짐을 보내지 않는다", () => {
    reportMembershipChanges(1, [card(10), card(11)]);
    markLocalMembership(1, { kind: "left", groupId: 11 });
    markLocalMembership(1, { kind: "joined_by_code", groupId: 21 });

    reportMembershipChanges(1, [card(10), card(21, "PRIVATE")]);

    expect(trackGroupRoomJoined).not.toHaveBeenCalled();
    expect(trackGroupRoomLeft).not.toHaveBeenCalled();
  });
});
