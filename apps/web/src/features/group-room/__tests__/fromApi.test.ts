import { describe, expect, it } from "vitest";

import { seedGroupData } from "@/lib/groupRoomMockData";

import {
  toApplicationRequest,
  toApplyBlockReason,
  toApplyState,
  toBlockedUserRow,
  toGroupVisibility,
  toMemberPresence,
  toMyRoomSummary,
  toPendingApplication,
  toPublicRoomDetail,
  toPublicRoomSummary,
  toRoomDeskMember,
  toRoomHome,
  toRoomMemberRow,
  toRoomVisibility,
  weeklyRanks,
} from "../fromApi";

const NOW = Date.parse("2026-11-03T10:00:00+09:00");
const seed = seedGroupData("default", NOW);
const desk = (userId: number, weekFocusSec: number) => ({
  ...seed.homes[10]!.members[0]!,
  userId,
  nickname: `멤버${userId}`,
  weekFocusSec,
});
const PHOTO = "https://cdn.example.com/profile.png";

describe("fromApi", () => {
  it("서버 상태 네 가지를 책상 상태로 바꾼다", () => {
    expect(
      ["IN_ROOM", "STUDYING", "PAUSED", "IDLE"].map((status) => toMemberPresence(status as never)),
    ).toEqual(["this_room", "studying_elsewhere", "paused_elsewhere", "away"]);
  });

  it("공개 그룹 보기의 신청 상태를 바꾸고 멤버면 null이다", () => {
    const detail = seed.publicDetails[12]!;
    expect(toApplyState({ ...detail, applyState: "MEMBER" })).toBeNull();
    expect(toApplyState({ ...detail, applyState: "APPLIED" })).toEqual({ kind: "applied" });
    expect(toApplyState({ ...detail, applyState: "FULL" })).toEqual({ kind: "full" });
    expect(
      toApplyState({
        ...detail,
        applyState: "UNAVAILABLE",
        unavailableReason: "RECENTLY_KICKED",
      }),
    ).toEqual({ kind: "blocked", reason: "kicked_recently" });
    expect(toApplyState({ ...detail, applyState: "CAN_APPLY" })).toEqual({ kind: "can_apply" });
  });

  it("신청할 수 없는 이유를 바꾸고 이유가 비어 오면 그룹 개수가 가득 찬 것으로 본다", () => {
    expect(
      (["RECENTLY_KICKED", "GROUP_SLOT_LIMIT", "APPLICATION_LIMIT"] as const).map(
        toApplyBlockReason,
      ),
    ).toEqual(["kicked_recently", "rooms_and_applications_full", "pending_applications_full"]);
    expect(
      toApplyState({
        ...seed.publicDetails[13]!,
        applyState: "UNAVAILABLE",
        unavailableReason: null,
      }),
    ).toEqual({ kind: "blocked", reason: "rooms_and_applications_full" });
  });

  // 웹은 서버보다 먼저 배포될 수 있어 서버가 새 값을 더해도 화면이 깨지지 않아야 한다.
  it("서버가 모르는 공부 상태를 보내면 자리를 비운 것으로 본다", () => {
    expect(toMemberPresence("SLEEPING" as never)).toBe("away");
    const desk = { ...seed.homes[10]!.members[1]!, status: "SLEEPING" as never };
    expect(toRoomDeskMember(desk, 1).presence).toBe("away");
  });

  it("서버가 모르는 신청 불가 이유를 보내면 그룹 개수가 가득 찬 것으로 본다", () => {
    expect(toApplyBlockReason("NEW_REASON" as never)).toBe("rooms_and_applications_full");
    expect(
      toApplyState({
        ...seed.publicDetails[13]!,
        applyState: "UNAVAILABLE",
        unavailableReason: "NEW_REASON" as never,
      }),
    ).toEqual({ kind: "blocked", reason: "rooms_and_applications_full" });
  });

  it("서버가 모르는 신청 상태를 보내면 이유 없이 신청을 막는다", () => {
    expect(toApplyState({ ...seed.publicDetails[13]!, applyState: "WAITLISTED" as never })).toEqual(
      { kind: "full" },
    );
  });

  it("이번 주 순위는 이번 주 순공 순이고 같으면 같은 순위다", () => {
    const rows = weeklyRanks([desk(1, 100), desk(2, 300), desk(3, 300), desk(4, 50)], 3);
    expect(rows.map((row) => [row.userId, row.rank, row.isMe])).toEqual([
      [2, 1, false],
      [3, 1, true],
      [1, 3, false],
      [4, 4, false],
    ]);
  });

  it("공개 그룹 그룹장이 아니면 새 신청 수는 0이고 소개가 없으면 빈 글이다", () => {
    const home = toRoomHome(
      { ...seed.homes[11]!, newApplicationCount: null, description: null },
      1,
    );
    expect(home.newRequestCount).toBe(0);
    expect(home.role).toBe("member");
    expect(home.visibility).toBe("private");
    expect(home.intro).toBe("");
  });

  it("그룹 홈은 책상과 순위에서 나를 표시하고 알림과 새 신청 수를 받는다", () => {
    const home = toRoomHome(seed.homes[10]!, 1);
    expect(home).toMatchObject({
      roomId: 10,
      name: "새벽 5시 기상 공시반",
      categoryLabel: "공무원",
      visibility: "public",
      role: "owner",
      memberCount: 4,
      newRequestCount: 2,
      notifyOn: false,
      intro: seed.homes[10]!.description,
    });
    expect(home.members.filter((member) => member.isMe).map((member) => member.userId)).toEqual([
      1,
    ]);
    expect(home.weeklyRanks.filter((row) => row.isMe).map((row) => row.userId)).toEqual([1]);
  });

  it("책상 멤버는 그룹장 표시와 앱 전체 오늘 순공을 받는다", () => {
    const me = seed.homes[10]!.members[0]!;
    expect(toRoomDeskMember(me, 1)).toEqual({
      userId: 1,
      nickname: "열공곰",
      isOwner: true,
      isMe: true,
      presence: "away",
      todayStudySec: me.todayFocusSec,
      lastStudiedAt: me.lastStudiedAt,
      accumulating: false,
    });
    expect(toRoomDeskMember(me, 2).isMe).toBe(false);
  });

  it("내 그룹 카드와 신청 중 목록을 화면 값으로 바꾼다", () => {
    const room = toMyRoomSummary(seed.mine.groups[1]!, 1);
    expect(room).toMatchObject({
      roomId: 11,
      name: "우리 반 저녁 스터디",
      categoryLabel: "내신",
      visibility: "private",
      memberCount: 5,
    });
    expect(room.members.filter((member) => member.isMe)).toHaveLength(1);
    expect(toPendingApplication(seed.myApplications.applications[0]!)).toEqual({
      applicationId: 31,
      roomId: 12,
      roomName: "의대 가자 2027",
      categoryLabel: "수능",
      expiresAt: seed.myApplications.applications[0]!.expiresAt,
    });
  });

  it("공개 그룹 보기는 멤버가 아니면 나로 보이는 책상이 없다", () => {
    const detail = toPublicRoomDetail(
      {
        ...seed.publicDetails[13]!,
        owner: { ...seed.publicDetails[13]!.owner, profileImageUrl: PHOTO },
      },
      1,
    );
    expect(detail).toMatchObject({
      roomId: 13,
      name: "토익 900 주말반",
      categoryLabel: "어학",
      memberCount: 3,
      intro: "주말마다 모의고사를 한 회씩 풀어요.",
      ownerNickname: "토익만점가자",
      ownerImageUrl: PHOTO,
    });
    expect(detail.members.some((member) => member.isMe)).toBe(false);
  });

  it("공개 그룹 카드는 평균 순공과 공부 중인 사람 수를 받고 모르는 시험·목표는 빈 글자다", () => {
    const card = seed.publicGroups.find((group) => group.groupId === 13)!;
    expect(toPublicRoomSummary(card)).toEqual({
      roomId: 13,
      name: "토익 900 주말반",
      categoryLabel: "어학",
      memberCount: card.memberCount,
      weeklyAverageSec: card.weeklyAverageFocusSec,
      studyingCount: card.studyingCount,
    });
    expect(toPublicRoomSummary({ ...card, category: "UNKNOWN" as never }).categoryLabel).toBe("");
  });

  it("프로필 사진을 순위, 멤버, 신청, 차단 줄의 사진 칸으로 넘긴다", () => {
    const withPhoto = { ...desk(7, 10), profileImageUrl: PHOTO };
    expect(weeklyRanks([withPhoto], 1)[0]).toMatchObject({ imageUrl: PHOTO, weeklyStudySec: 10 });
    const member = seed.members[11]!.members[0]!;
    expect(toRoomMemberRow({ ...member, profileImageUrl: PHOTO }, member.userId)).toEqual({
      userId: member.userId,
      nickname: member.nickname,
      isOwner: member.owner,
      isMe: true,
      lastStudiedAt: member.lastStudiedAt,
      imageUrl: PHOTO,
    });
    const application = seed.applications[10]!.applications[0]!;
    expect(toApplicationRequest({ ...application, profileImageUrl: PHOTO })).toEqual({
      applicationId: application.applicationId,
      nickname: application.nickname,
      appliedAt: application.appliedAt,
      expiresAt: application.expiresAt,
      message: application.introduction,
      imageUrl: PHOTO,
    });
    const blocked = seed.blocks.blockedUsers[0]!;
    expect(toBlockedUserRow({ ...blocked, profileImageUrl: PHOTO })).toEqual({
      userId: blocked.userId,
      nickname: blocked.nickname,
      imageUrl: PHOTO,
    });
  });

  it("공개 여부를 서버 값과 화면 값 사이에서 바꾼다", () => {
    expect(toRoomVisibility("PUBLIC")).toBe("public");
    expect(toRoomVisibility("PRIVATE")).toBe("private");
    expect(toGroupVisibility("public")).toBe("PUBLIC");
    expect(toGroupVisibility("private")).toBe("PRIVATE");
  });
});
