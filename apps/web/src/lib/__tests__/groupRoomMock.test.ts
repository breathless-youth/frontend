import { afterEach, describe, expect, it, vi } from "vitest";

import type * as TokenSourceModule from "@/lib/auth/tokenSource";
import type { TokenSource } from "@/lib/auth/tokenSource";

import type { GroupMockServer } from "../groupRoomMock";
import {
  __resetGroupMockForTests,
  activeGroupMockServer,
  createGroupMockServer,
} from "../groupRoomMock";
import { seedGroupData, seedGroupWorld } from "../groupRoomMockData";

const tokenSourceMock = vi.hoisted(() => ({ source: null as TokenSource | null }));

vi.mock("@/lib/auth/tokenSource", async (importOriginal) => ({
  ...(await importOriginal<typeof TokenSourceModule>()),
  getTokenSource: () => tokenSourceMock.source,
}));

const NOW = Date.parse("2026-11-03T10:00:00+09:00");
const DAY_MS = 24 * 60 * 60 * 1000;
const server = (scene: "default" | "empty" | "limits") =>
  createGroupMockServer(scene, { now: () => NOW, delayMs: 0 });

/** 앱이 토큰과 함께 받은 사용자 */
function signedIn(userId: number): TokenSource {
  return {
    getAccessToken: () => Promise.resolve("token"),
    getCurrentToken: () => "token",
    refresh: () => Promise.resolve("token"),
    getUserId: () => userId,
    hasSettled: () => true,
    subscribe: () => () => {},
  };
}

async function memberId(api: GroupMockServer, groupId: number, nickname: string): Promise<number> {
  const { members } = await api.getGroupMembers(groupId);
  return members.find((member) => member.nickname === nickname)!.userId;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  tokenSourceMock.source = null;
  window.history.replaceState(null, "", "/");
  __resetGroupMockForTests();
});

describe("그룹 가짜 서버", () => {
  it("기본 장면은 그룹 두 개와 신청 하나다", async () => {
    const mine = await server("default").getMyGroups();
    expect(mine.groups.map((group) => group.name)).toEqual([
      "새벽 5시 기상 공시반",
      "우리 반 저녁 스터디",
    ]);
    expect(mine.pendingApplicationCount).toBe(1);
    expect(mine.ownedGroupCount).toBe(1);
  });

  it("만든 그룹이 내 그룹 탭 끝에 들어간다", async () => {
    const api = server("default");
    const { groupId } = await api.createGroup({
      name: "토익 900 모임",
      visibility: "PUBLIC",
      category: "LANGUAGE",
    });
    const mine = await api.getMyGroups();
    expect(mine.groups.at(-1)).toMatchObject({ groupId, owner: true, memberCount: 1 });
  });

  it("없는 코드는 404 INVITE_CODE_NOT_FOUND다", async () => {
    await expect(server("default").joinGroupByCode("ZZZZZZ", "CODE")).rejects.toMatchObject({
      status: 404,
      code: "INVITE_CODE_NOT_FOUND",
    });
  });

  it("한도 장면은 그룹 만들기를 OWNED_GROUP_LIMIT로 막는다", async () => {
    await expect(
      server("limits").createGroup({ name: "새 그룹", visibility: "PRIVATE", category: "ETC" }),
    ).rejects.toMatchObject({ status: 409, code: "OWNED_GROUP_LIMIT" });
  });

  it("공개 그룹 목록은 20개씩 나누고 마지막 쪽은 다음 쪽이 없다", async () => {
    const api = server("default");
    expect((await api.getPublicGroups({ page: 0 })).groups).toHaveLength(20);
    expect(await api.getPublicGroups({ page: 1 })).toMatchObject({ hasNext: false });
  });

  it("그룹장이 아니면 내보낼 수 없고 코드도 그대로다", async () => {
    const api = server("default");
    const before = await api.getGroupInvite(11);
    await expect(api.kickGroupMember(11, await memberId(api, 11, "수빈"))).rejects.toMatchObject({
      status: 403,
      code: "NOT_GROUP_OWNER",
    });
    expect((await api.getGroupInvite(11)).inviteCode).toBe(before.inviteCode);
  });

  it("비공개 그룹의 그룹장이 내보내면 초대코드가 바뀐다", async () => {
    const api = server("default");
    api.setOwnerForTests(11, 1);
    const before = await api.getGroupInvite(11);
    const subin = await memberId(api, 11, "수빈");
    await api.kickGroupMember(11, subin);
    expect((await api.getGroupInvite(11)).inviteCode).not.toBe(before.inviteCode);
    expect((await api.getGroupMembers(11)).members.map((member) => member.userId)).not.toContain(
      subin,
    );
  });

  it("받은 사용자 번호가 견본의 나이고 예전 견본 멤버 번호여도 멤버와 겹치지 않는다", async () => {
    // 5는 이 견본에서 민준이 쓰던 번호라 실제 개발 계정과 겹치던 자리다.
    const api = createGroupMockServer("default", { now: () => NOW, delayMs: 0, meId: 5 });
    expect((await api.getGroupHome(10)).members.find((member) => member.owner)?.userId).toBe(5);
    const userIds = (await api.getGroupMembers(11)).members.map((member) => member.userId);
    expect(userIds).toHaveLength(5);
    expect(new Set(userIds).size).toBe(5);
    expect(await api.getPublicGroup(12)).toMatchObject({ applyState: "APPLIED" });
    await expect(api.kickGroupMember(10, 5)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("견본의 다른 사람은 실제 개발 계정이 쓰는 작은 번호를 쓰지 않는다", () => {
    const world = seedGroupWorld("default", NOW, 5);
    const others = [
      ...world.groups.flatMap((group) => [
        ...group.members.map((member) => member.userId),
        ...group.applications.map((application) => application.userId),
      ]),
      ...world.blocks.map((blocked) => blocked.userId),
    ].filter((userId) => userId !== 5);
    expect(Math.min(...others)).toBeGreaterThanOrEqual(1_000_000_000);
  });

  it("개발 빌드의 가짜 서버는 앱이 토큰으로 아는 사용자를 견본의 나로 쓴다", async () => {
    vi.useFakeTimers();
    tokenSourceMock.source = signedIn(4242);
    window.history.replaceState(null, "", "/social?groupMock=default");
    __resetGroupMockForTests();
    const answer = activeGroupMockServer()!.getGroupHome(10);
    await vi.advanceTimersByTimeAsync(300);
    expect((await answer).members.find((member) => member.owner)?.userId).toBe(4242);
  });

  it("앱이 지금 사용자를 모르면 견본의 나는 1이다", async () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/social?groupMock=default");
    __resetGroupMockForTests();
    const answer = activeGroupMockServer()!.getGroupHome(10);
    await vi.advanceTimersByTimeAsync(300);
    expect((await answer).members.find((member) => member.owner)?.userId).toBe(1);
  });

  it("운영 빌드에서는 장면을 읽지 않는다", () => {
    vi.stubEnv("DEV", false);
    window.history.replaceState(null, "", "/social?groupMock=default");
    __resetGroupMockForTests();
    expect(activeGroupMockServer()).toBeNull();
  });

  it("나가기는 초대코드를 바꾸지 않아 같은 코드로 다시 들어온다", async () => {
    const api = server("default");
    const { inviteCode } = await api.getGroupInvite(11);
    await api.leaveGroup(11);
    await expect(api.getGroupHome(11)).rejects.toMatchObject({
      status: 403,
      code: "NOT_GROUP_MEMBER",
    });
    await expect(api.joinGroupByCode(inviteCode, "LINK")).resolves.toEqual({
      groupId: 11,
      joined: true,
    });
  });

  it("이미 멤버인 그룹의 코드는 대소문자와 상관없이 joined false다", async () => {
    await expect(server("default").joinGroupByCode("k7q2mx", "LINK")).resolves.toEqual({
      groupId: 11,
      joined: false,
    });
  });

  it("다른 멤버가 있는 그룹장은 나갈 수 없고 혼자면 그룹이 사라진다", async () => {
    const api = server("default");
    await expect(api.leaveGroup(10)).rejects.toMatchObject({
      status: 409,
      code: "OWNER_CANNOT_LEAVE",
    });
    const { groupId } = await api.createGroup({
      name: "혼자 공부",
      visibility: "PRIVATE",
      category: "ETC",
    });
    await api.leaveGroup(groupId);
    await expect(api.getGroupHome(groupId)).rejects.toMatchObject({
      status: 404,
      code: "GROUP_NOT_FOUND",
    });
  });

  it("멤버가 아닌 그룹은 403, 없는 그룹과 비공개 그룹의 공개 보기는 404다", async () => {
    const api = server("default");
    await expect(api.getGroupHome(13)).rejects.toMatchObject({
      status: 403,
      code: "NOT_GROUP_MEMBER",
    });
    await expect(api.getGroupApplications(11)).rejects.toMatchObject({
      status: 403,
      code: "NOT_GROUP_OWNER",
    });
    await expect(api.getGroupHome(999)).rejects.toMatchObject({
      status: 404,
      code: "GROUP_NOT_FOUND",
    });
    await expect(api.getPublicGroup(11)).rejects.toMatchObject({
      status: 404,
      code: "GROUP_NOT_FOUND",
    });
  });

  it("신청하면 공개 그룹 보기가 신청 중이 되고 취소하면 다시 신청할 수 있다", async () => {
    const api = server("default");
    const { applicationId } = await api.applyToGroup(13, "새벽 5시에 일어나는 공시생이에요");
    expect(await api.getPublicGroup(13)).toMatchObject({
      applyState: "APPLIED",
      application: { applicationId },
    });
    expect((await api.getMyGroups()).pendingApplicationCount).toBe(2);
    await expect(api.applyToGroup(13, "한 번 더")).rejects.toMatchObject({
      status: 409,
      code: "ALREADY_APPLIED",
    });
    await api.cancelApplication(applicationId);
    expect(await api.getPublicGroup(13)).toMatchObject({
      applyState: "CAN_APPLY",
      application: null,
    });
    await expect(api.cancelApplication(applicationId)).rejects.toMatchObject({
      status: 409,
      code: "APPLICATION_NOT_PENDING",
    });
  });

  it("수락하면 신청한 사람이 멤버가 되고 남은 자리가 줄어든다", async () => {
    const api = server("default");
    const [first] = (await api.getGroupApplications(10)).applications;
    await api.acceptApplication(first!.applicationId);
    expect(await api.getGroupApplications(10)).toMatchObject({
      remainingSeats: 1,
      applications: [expect.objectContaining({ applicationId: expect.any(Number) })],
    });
    expect((await api.getGroupMembers(10)).members.map((member) => member.userId)).toContain(
      first!.userId,
    );
    expect((await api.getGroupHome(10)).newApplicationCount).toBe(1);
  });

  it("그룹장을 넘기면 내 역할이 멤버가 되고 그룹장 화면을 열 수 없다", async () => {
    const api = server("default");
    const target = (await api.getGroupMembers(10)).members.find((member) => !member.owner)!;
    await api.transferGroupOwner(10, target.userId);
    expect(await api.getGroupHome(10)).toMatchObject({
      myRole: "MEMBER",
      newApplicationCount: null,
    });
    expect((await api.getGroupMembers(10)).members.find((member) => member.owner)?.userId).toBe(
      target.userId,
    );
    expect((await api.getMyGroups()).ownedGroupCount).toBe(0);
    await expect(api.getGroupApplications(10)).rejects.toMatchObject({
      status: 403,
      code: "NOT_GROUP_OWNER",
    });
  });

  it("한도 장면은 신청과 코드 참여를 GROUP_SLOT_LIMIT로 막는다", async () => {
    const api = server("limits");
    expect(await api.getMyGroups()).toMatchObject({
      pendingApplicationCount: 1,
      ownedGroupCount: 2,
    });
    expect((await api.getMyGroups()).groups).toHaveLength(4);
    await expect(api.joinGroupByCode("K7Q2MX", "CODE")).rejects.toMatchObject({
      status: 409,
      code: "GROUP_SLOT_LIMIT",
    });
    const applied = (await api.getMyApplications()).applications.map((item) => item.groupId);
    const target = (await api.getPublicGroups({ page: 0 })).groups.find(
      (group) => !group.member && group.memberCount < 6 && !applied.includes(group.groupId),
    )!;
    expect(await api.getPublicGroup(target.groupId)).toMatchObject({
      applyState: "UNAVAILABLE",
      unavailableReason: "GROUP_SLOT_LIMIT",
    });
    await expect(api.applyToGroup(target.groupId, "같이 공부해요")).rejects.toMatchObject({
      status: 409,
      code: "GROUP_SLOT_LIMIT",
    });
  });

  it("빈 장면은 그룹과 신청과 공개 그룹이 없고 코드로는 들어갈 수 있다", async () => {
    const api = server("empty");
    expect(await api.getMyGroups()).toMatchObject({
      groups: [],
      pendingApplicationCount: 0,
      ownedGroupCount: 0,
    });
    expect(await api.getPublicGroups({ page: 0 })).toEqual({ groups: [], hasNext: false });
    expect(await api.getBlocks()).toEqual({ blockedUsers: [] });
    await expect(api.joinGroupByCode("K7Q2MX", "CODE")).resolves.toEqual({
      groupId: 11,
      joined: true,
    });
    expect((await api.getMyGroups()).groups.map((group) => group.groupId)).toEqual([11]);
  });

  it("내보내진 지 3일이 안 된 공개 그룹은 신청할 수 없고 3일이 지나면 된다", async () => {
    let now = NOW;
    const api = createGroupMockServer("default", { now: () => now, delayMs: 0 });
    const kicked = Object.values(seedGroupData("default", NOW).publicDetails).find(
      (detail) => detail.unavailableReason === "RECENTLY_KICKED",
    )!;
    await expect(api.applyToGroup(kicked.groupId, "다시 해 볼게요")).rejects.toMatchObject({
      status: 409,
      code: "RECENTLY_KICKED",
    });
    now += 3 * DAY_MS;
    expect(await api.getPublicGroup(kicked.groupId)).toMatchObject({ applyState: "CAN_APPLY" });
  });

  it("공개 그룹 목록은 검색어와 시험·목표로 거르고 다 찬 그룹은 맨 뒤에 둔다", async () => {
    const api = server("default");
    const first = await api.getPublicGroups({ page: 0 });
    const last = await api.getPublicGroups({ page: 1 });
    expect(first.groups.find((group) => group.groupId === 10)).toMatchObject({ member: true });
    expect([...first.groups, ...last.groups].at(-1)?.memberCount).toBe(6);
    const found = await api.getPublicGroups({ page: 0, query: "공시", category: "CIVIL_SERVICE" });
    expect(found.groups.map((group) => group.name)).toEqual(["새벽 5시 기상 공시반"]);
  });

  it.each([
    ["GROUP_FULL", 409],
    ["INVITE_CODE_NOT_FOUND", 404],
    ["NOT_FOUND", 404],
    ["NOT_GROUP_OWNER", 403],
    ["NOT_GROUP_MEMBER", 403],
    ["CONTACT_NOT_ALLOWED", 400],
    ["VALIDATION_FAILED", 400],
    ["BAD_REQUEST", 400],
    ["UNAUTHORIZED", 401],
    ["INTERNAL_ERROR", 500],
    ["NOT_IMPLEMENTED", 501],
  ] as const)("오류 주입 %s는 변경을 %i로 실패시키고 조회는 그대로 둔다", async (code, status) => {
    const api = createGroupMockServer("default", { now: () => NOW, delayMs: 0, injectError: code });
    await expect(api.leaveGroup(11)).rejects.toMatchObject({ status, code });
    await expect(api.getMyGroups()).resolves.toMatchObject({ pendingApplicationCount: 1 });
  });

  it("개발 빌드는 주소의 장면과 오류를 처음 한 번 읽어 두고 300ms 뒤에 답한다", async () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/social?groupMock=limits&groupMockError=GROUP_FULL");
    __resetGroupMockForTests();
    const active = activeGroupMockServer();
    window.history.replaceState(null, "", "/social/groups/10");
    expect(activeGroupMockServer()).toBe(active);

    const answer = active!.joinGroupByCode("K7Q2MX", "CODE").catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(299);
    let settled = false;
    void answer.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await answer).toMatchObject({ status: 409, code: "GROUP_FULL" });
  });

  it("주소에 장면이 없거나 모르는 장면이면 끈다", () => {
    window.history.replaceState(null, "", "/social?groupMock=party");
    __resetGroupMockForTests();
    expect(activeGroupMockServer()).toBeNull();
  });

  it("견본은 뒤 작업이 읽는 그룹을 응답 모양으로 담는다", () => {
    const seed = seedGroupData("default", NOW);
    expect(seed.homes[10]).toMatchObject({
      name: "새벽 5시 기상 공시반",
      visibility: "PUBLIC",
      category: "CIVIL_SERVICE",
      myRole: "OWNER",
      memberCount: 4,
      newApplicationCount: 2,
    });
    expect(seed.homes[11]).toMatchObject({
      name: "우리 반 저녁 스터디",
      visibility: "PRIVATE",
      myRole: "MEMBER",
      memberCount: 5,
      newApplicationCount: null,
    });
    expect(seed.homes[11]!.members.map((member) => member.nickname)).toContain("민준");
    expect(seed.members[11]!.members).toHaveLength(5);
    expect(seed.invites[11]).toEqual({ inviteCode: "K7Q2MX" });
    expect(seed.publicDetails[10]).toMatchObject({ applyState: "MEMBER" });
    expect(seed.publicDetails[12]).toMatchObject({
      applyState: "APPLIED",
      application: { applicationId: expect.any(Number) },
    });
    expect(seed.publicDetails[13]).toMatchObject({
      applyState: "CAN_APPLY",
      unavailableReason: null,
      application: null,
    });
    expect(seed.applications[10]).toMatchObject({ remainingSeats: 2 });
    expect(seed.applications[10]!.applications).toHaveLength(2);
    expect(seed.myApplications.applications.map((item) => item.groupId)).toEqual([12]);
    expect(seed.publicGroups).toHaveLength(25);
    expect(seed.publicGroups.filter((group) => group.memberCount === 6)).toHaveLength(1);
    expect(seed.blocks.blockedUsers).toHaveLength(2);
    expect(seed.mine.groups[0]).toMatchObject({ groupId: 10, owner: true });
  });
});
