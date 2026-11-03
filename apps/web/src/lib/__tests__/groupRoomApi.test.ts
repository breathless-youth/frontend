import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api";
import {
  acceptApplication,
  applyToGroup,
  cancelApplication,
  createGroup,
  declineApplication,
  getBlocks,
  getGroupApplications,
  getGroupHome,
  getGroupInvite,
  getGroupMembers,
  getMyApplications,
  getMyGroups,
  getPublicGroup,
  getPublicGroups,
  joinGroupByCode,
  joinGroupRoom,
  kickGroupMember,
  leaveGroup,
  leaveGroupRoom,
  regenerateGroupInvite,
  reportApplication,
  reportGroupMember,
  setGroupNotification,
  transferGroupOwner,
  unblockUser,
  updateGroup,
} from "../groupRoomApi";

const mockedFetch = vi.fn();
globalThis.fetch = mockedFetch as unknown as typeof fetch;
const json = vi.fn();
const response = (status: number, body?: unknown) => {
  json.mockResolvedValue(body);
  return { ok: status >= 200 && status < 300, status, json };
};
const lastCall = () => mockedFetch.mock.calls.at(-1) as [string, RequestInit];

beforeEach(() => vi.clearAllMocks());

describe("groupRoomApi", () => {
  it("내 그룹 탭은 API-Version 1로 받는다", async () => {
    mockedFetch.mockResolvedValue(
      response(200, {
        groups: [],
        pendingApplicationCount: 0,
        ownedGroupCount: 0,
        limits: { maxGroupsAndApplications: 5, maxPendingApplications: 3, maxOwnedGroups: 2 },
      }),
    );
    await getMyGroups();
    expect(lastCall()[0]).toBe("/api/groups/me");
    expect(new Headers(lastCall()[1].headers).get("API-Version")).toBe("1");
  });

  it("공개 그룹 목록은 값이 있는 조건만 쿼리로 보낸다", async () => {
    mockedFetch.mockResolvedValue(response(200, { groups: [], hasNext: false }));
    await getPublicGroups({ query: "공시", category: "CIVIL_SERVICE", page: 1 });
    expect(lastCall()[0]).toBe(
      "/api/groups/public?query=%EA%B3%B5%EC%8B%9C&category=CIVIL_SERVICE&page=1&size=20",
    );
    await getPublicGroups({ query: "", category: null, page: 0 });
    expect(lastCall()[0]).toBe("/api/groups/public?page=0&size=20");
  });

  it("신고 사유가 비면 빈 객체를 보낸다", async () => {
    mockedFetch.mockResolvedValue(response(204));
    await reportApplication(55, "   ");
    expect(lastCall()[1].body).toBe("{}");
    await reportGroupMember(10, 42, "카메라 앞에서 불쾌한 행동을 했어요");
    expect(lastCall()[0]).toBe("/api/groups/10/members/42/report");
    expect(lastCall()[1].body).toBe(
      JSON.stringify({ reason: "카메라 앞에서 불쾌한 행동을 했어요" }),
    );
  });

  it("초대코드 참여는 코드와 들어온 경로를 보낸다", async () => {
    mockedFetch.mockResolvedValue(response(200, { groupId: 10, joined: true }));
    await expect(joinGroupByCode("K7M2PQ", "LINK")).resolves.toEqual({ groupId: 10, joined: true });
    expect(lastCall()[1].body).toBe(JSON.stringify({ inviteCode: "K7M2PQ", via: "LINK" }));
  });

  it("실패는 code를 담은 ApiError다", async () => {
    mockedFetch.mockResolvedValue(response(409, { code: "GROUP_FULL", message: "자리가 없어요" }));
    const error = await joinGroupByCode("K7M2PQ", "CODE").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "GROUP_FULL" });
  });

  it("204는 본문을 읽지 않는다", async () => {
    mockedFetch.mockResolvedValue(response(204));
    await expect(kickGroupMember(10, 42)).resolves.toBeUndefined();
    expect(lastCall()[1].method).toBe("DELETE");
    expect(json).not.toHaveBeenCalled();
  });

  it("공부방 자리 잡기와 차단 해제는 각자의 경로로 보낸다", async () => {
    mockedFetch.mockResolvedValue(
      response(200, {
        roomId: 123,
        graceRejoin: false,
        cameraOn: null,
        micOn: null,
        onBreak: null,
        iceServers: [],
        iceTtlSeconds: 86400,
      }),
    );
    await joinGroupRoom(10);
    expect(lastCall()[0]).toBe("/api/groups/10/room/join");
    mockedFetch.mockResolvedValue(response(204));
    await unblockUser(42);
    expect(lastCall()[0]).toBe("/api/blocks/42");
  });

  it("조회는 취소 신호를 넘긴다", async () => {
    mockedFetch.mockResolvedValue(response(200, { members: [] }));
    const controller = new AbortController();
    await getGroupMembers(10, controller.signal);
    expect(lastCall()[1].signal).toBe(controller.signal);
  });

  it.each([
    {
      name: "getMyApplications",
      call: () => getMyApplications(),
      method: "GET",
      path: "/api/group-applications/me",
    },
    {
      name: "getPublicGroup",
      call: () => getPublicGroup(12),
      method: "GET",
      path: "/api/groups/public/12",
    },
    { name: "getGroupHome", call: () => getGroupHome(10), method: "GET", path: "/api/groups/10" },
    {
      name: "getGroupMembers",
      call: () => getGroupMembers(10),
      method: "GET",
      path: "/api/groups/10/members",
    },
    {
      name: "getGroupInvite",
      call: () => getGroupInvite(11),
      method: "GET",
      path: "/api/groups/11/invite",
    },
    {
      name: "getGroupApplications",
      call: () => getGroupApplications(10),
      method: "GET",
      path: "/api/groups/10/applications",
    },
    { name: "getBlocks", call: () => getBlocks(), method: "GET", path: "/api/blocks" },
    {
      name: "createGroup",
      call: () =>
        createGroup({ name: "토익 900 모임", visibility: "PUBLIC", category: "LANGUAGE" }),
      method: "POST",
      path: "/api/groups",
      body: { name: "토익 900 모임", visibility: "PUBLIC", category: "LANGUAGE" },
    },
    {
      name: "updateGroup",
      call: () =>
        updateGroup(10, { name: "새벽 공시반", category: "CIVIL_SERVICE", description: "" }),
      method: "PATCH",
      path: "/api/groups/10",
      body: { name: "새벽 공시반", category: "CIVIL_SERVICE", description: "" },
    },
    {
      name: "setGroupNotification",
      call: () => setGroupNotification(10, true),
      method: "PUT",
      path: "/api/groups/10/notifications",
      body: { enabled: true },
    },
    {
      name: "transferGroupOwner",
      call: () => transferGroupOwner(10, 42),
      method: "PUT",
      path: "/api/groups/10/owner",
      body: { userId: 42 },
    },
    {
      name: "kickGroupMember",
      call: () => kickGroupMember(10, 42),
      method: "DELETE",
      path: "/api/groups/10/members/42",
    },
    {
      name: "leaveGroup",
      call: () => leaveGroup(10),
      method: "POST",
      path: "/api/groups/10/leave",
    },
    {
      name: "regenerateGroupInvite",
      call: () => regenerateGroupInvite(11),
      method: "POST",
      path: "/api/groups/11/invite",
    },
    {
      name: "joinGroupByCode",
      call: () => joinGroupByCode("K7Q2MX", "CODE"),
      method: "POST",
      path: "/api/groups/join",
      body: { inviteCode: "K7Q2MX", via: "CODE" },
    },
    {
      name: "applyToGroup",
      call: () => applyToGroup(13, "새벽 5시에 일어나는 공시생이에요"),
      method: "POST",
      path: "/api/groups/13/applications",
      body: { introduction: "새벽 5시에 일어나는 공시생이에요" },
    },
    {
      name: "cancelApplication",
      call: () => cancelApplication(55),
      method: "DELETE",
      path: "/api/group-applications/55",
    },
    {
      name: "acceptApplication",
      call: () => acceptApplication(55),
      method: "POST",
      path: "/api/group-applications/55/accept",
    },
    {
      name: "declineApplication",
      call: () => declineApplication(55),
      method: "POST",
      path: "/api/group-applications/55/decline",
    },
    {
      name: "reportApplication",
      call: () => reportApplication(55, " 광고 글이에요 "),
      method: "POST",
      path: "/api/group-applications/55/report",
      body: { reason: "광고 글이에요" },
    },
    {
      name: "reportGroupMember",
      call: () => reportGroupMember(10, 42, ""),
      method: "POST",
      path: "/api/groups/10/members/42/report",
      body: {},
    },
    { name: "unblockUser", call: () => unblockUser(42), method: "DELETE", path: "/api/blocks/42" },
    {
      name: "joinGroupRoom",
      call: () => joinGroupRoom(10),
      method: "POST",
      path: "/api/groups/10/room/join",
    },
    {
      name: "leaveGroupRoom",
      call: () => leaveGroupRoom(10),
      method: "POST",
      path: "/api/groups/10/room/leave",
    },
  ] as const)("$name은 $method $path로 보낸다", async ({ call, method, path, ...rest }) => {
    mockedFetch.mockResolvedValue(response(200, {}));
    await call();
    const [url, init] = lastCall();
    expect(url).toBe(path);
    expect(init.method).toBe(method);
    const body = "body" in rest ? rest.body : undefined;
    expect(init.body).toBe(body === undefined ? undefined : JSON.stringify(body));
    expect(new Headers(init.headers).get("Content-Type")).toBe(
      body === undefined ? null : "application/json",
    );
  });
});
