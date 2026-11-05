import { describe, expect, it } from "vitest";

import { countGraphemes } from "@/lib/graphemes";

import { buildGroupRoomFixtures } from "../fixtures";
import { roomStatusText, studyingCountText } from "../model/desks";
import {
  GROUP_ROOM_LIMITS,
  countGroupText,
  memberCountText,
  myRoomsTabCount,
} from "../model/limits";
import {
  appliedAtText,
  formatHoursMinutes,
  lastStudiedText,
  remainingText,
} from "../model/timeText";

const NOW = new Date("2026-11-02T10:00:00+09:00");
const fixtures = buildGroupRoomFixtures(NOW);

describe("buildGroupRoomFixtures", () => {
  it("내 그룹은 셋이고 답을 기다리는 신청이 하나다", () => {
    expect(myRoomsTabCount(fixtures.myRooms.length, fixtures.pending.length)).toBe("4/5");
    const [first] = fixtures.myRooms;
    expect(first).toMatchObject({
      name: "수능 D-200 밤샘반",
      visibility: "public",
      memberCount: 5,
    });
    expect(roomStatusText(first.members)).toBe("3명 공부 중");
    expect(remainingText(fixtures.pending[0].expiresAt, NOW)).toBe("2일 23시간");
  });

  it("공개 그룹 목록의 첫 그룹은 멤버 넷 가운데 둘이 공부 중이다", () => {
    const [first] = fixtures.publicRooms;
    expect(first.name).toBe("새벽 5시 기상 공시반");
    expect(memberCountText(first.memberCount)).toBe("멤버 4/6");
    expect(formatHoursMinutes(first.weeklyAverageSec)).toBe("21시간 10분");
    expect(studyingCountText(first.studyingCount)).toBe("2명 공부 중");
    expect(fixtures.categories.map((category) => category.label)).toContain("수능");
  });

  it("공개 그룹 보기는 옥수수라떼가 그룹장이고 소개가 더 보기로 접힐 만큼 길다", () => {
    expect(fixtures.publicDetail).toMatchObject({
      name: "새벽 5시 기상 공시반",
      ownerNickname: "옥수수라떼",
    });
    expect(fixtures.publicDetail.intro.length).toBeGreaterThan(120);
  });

  it("신청 확인에는 방금 온 신청이 하나만 있다", () => {
    expect(fixtures.requests.map((request) => appliedAtText(request.appliedAt, NOW))).toEqual([
      "방금 신청",
      "어제 신청",
    ]);
    expect(fixtures.requests.map((request) => remainingText(request.expiresAt, NOW))).toEqual([
      "2일 23시간",
      "1일 20시간",
    ]);
  });

  it("그룹 홈은 공개 그룹 그룹장의 화면이고 새 신청 둘과 내 순위 줄이 있다", () => {
    expect(fixtures.roomHome).toMatchObject({
      visibility: "public",
      role: "owner",
      newRequestCount: 2,
      notifyOn: false,
    });
    expect(roomStatusText(fixtures.roomHome.members)).toBe("3명 공부 중");
    expect(fixtures.roomHome.weeklyRanks.filter((row) => row.isMe)).toHaveLength(1);
    expect(fixtures.roomHomeQuiet.newRequestCount).toBe(0);
  });

  it("그룹 만들기와 그룹 설정의 입력값은 그룹 홈과 같은 그룹이고 소개가 44자다", () => {
    expect(fixtures.roomForm).toEqual({
      name: fixtures.roomHome.name,
      visibility: fixtures.roomHome.visibility,
      joinPolicy: "approval",
      category: "수능",
      intro: fixtures.roomHome.intro,
    });
    expect(fixtures.categories.map((category) => category.value)).toContain(
      fixtures.roomForm.category,
    );
    expect(countGroupText(fixtures.roomForm.intro)).toBe(44);
  });

  it("멤버 목록에는 그룹장인 나, 다른 멤버, 16일 전에 공부한 멤버가 있다", () => {
    expect(fixtures.members.some((member) => member.isOwner && member.isMe)).toBe(true);
    expect(fixtures.members.some((member) => !member.isOwner && !member.isMe)).toBe(true);
    expect(fixtures.members.map((member) => lastStudiedText(member.lastStudiedAt, NOW))).toContain(
      "16일 전",
    );
    expect(fixtures.blocked.length).toBeGreaterThan(0);
  });

  it("가장 긴 이름은 그룹 이름 한도와 닉네임 한도를 채운다", () => {
    expect(countGroupText(fixtures.longest.roomName)).toBe(GROUP_ROOM_LIMITS.roomNameMax);
    // 프로필 닉네임은 12자까지 쓸 수 있다.
    expect(countGraphemes(fixtures.longest.nickname)).toBe(12);
  });
});
