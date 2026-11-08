import type {
  BlockListResponse,
  GroupApplicationCreateRequest,
  GroupApplicationCreateResponse,
  GroupApplicationsResponse,
  GroupCreateRequest,
  GroupCreateResponse,
  GroupHomeResponse,
  GroupInviteResponse,
  GroupJoinRequest,
  GroupJoinResponse,
  GroupJoinVia,
  GroupMembersResponse,
  GroupNotificationRequest,
  GroupOwnerTransferRequest,
  GroupRoomJoinResponse,
  GroupUpdateRequest,
  MyApplicationsResponse,
  MyGroupsResponse,
  PublicGroupDetailResponse,
  PublicGroupPageResponse,
  ReportRequest,
  StudyCategory,
} from "@focusmakers/types";

import { API_BASE_URL, apiFetch, parseApiError } from "./api";
import { groupRequestLocale } from "./groupRequestLocale";

/**
 * 그룹 공부방 API 호출
 *
 * 함수마다 맨 앞에서 개발 빌드 가짜 서버가 켜졌는지 먼저 본다.
 * 백엔드 그룹 로직이 501인 동안 화면 흐름을 돌려 보려는 것이고, 운영 빌드에서는 이 분기와 동적 import가 빠진다.
 */

/** `/api/groups`와 `/api/group-applications`는 `groups`, `/api/blocks`는 `blocks`다. */
type GroupEndpoint = "groups" | "blocks";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** 쪽 크기를 정하지 않으면 서버 기본값과 같은 20개씩 받는다. */
const DEFAULT_PAGE_SIZE = 20;

export interface PublicGroupsParams {
  query?: string;
  category?: StudyCategory | null;
  page: number;
  size?: number;
}

/**
 * 그룹 API 27개
 *
 * 개발 빌드 가짜 서버가 같은 모양을 구현하고, 라우트 테스트가 이 이름으로 함수를 바꿔 끼운다.
 */
export interface GroupRoomApi {
  getMyGroups: typeof getMyGroups;
  getMyApplications: typeof getMyApplications;
  getPublicGroups: typeof getPublicGroups;
  getPublicGroup: typeof getPublicGroup;
  getGroupHome: typeof getGroupHome;
  getGroupMembers: typeof getGroupMembers;
  getGroupInvite: typeof getGroupInvite;
  getGroupApplications: typeof getGroupApplications;
  getBlocks: typeof getBlocks;
  createGroup: typeof createGroup;
  updateGroup: typeof updateGroup;
  setGroupNotification: typeof setGroupNotification;
  transferGroupOwner: typeof transferGroupOwner;
  kickGroupMember: typeof kickGroupMember;
  leaveGroup: typeof leaveGroup;
  regenerateGroupInvite: typeof regenerateGroupInvite;
  joinGroupByCode: typeof joinGroupByCode;
  joinPublicGroup: typeof joinPublicGroup;
  applyToGroup: typeof applyToGroup;
  cancelApplication: typeof cancelApplication;
  acceptApplication: typeof acceptApplication;
  declineApplication: typeof declineApplication;
  reportApplication: typeof reportApplication;
  reportGroupMember: typeof reportGroupMember;
  unblockUser: typeof unblockUser;
  joinGroupRoom: typeof joinGroupRoom;
  leaveGroupRoom: typeof leaveGroupRoom;
}

/**
 * 개발 빌드 가짜 서버
 *
 * 주소에 `?groupMock=<장면>`이 있을 때만 서버를 돌려주고, 없으면 null이라 실제 서버로 보낸다.
 * 운영 빌드에서는 `import.meta.env.DEV`가 거짓으로 바뀌어 분기 안의 동적 import가 통째로 빠진다.
 */
async function groupDevMock(): Promise<GroupRoomApi | null> {
  if (import.meta.env.DEV) {
    const { activeGroupMockServer } = await import("./groupRoomMock");
    return activeGroupMockServer();
  }
  return null;
}

/**
 * 쿼리 문자열 만들기
 *
 * 검색칸을 비운 상태는 조건이 없는 것이라 빈 글도 값이 없는 것으로 보고 보내지 않는다.
 */
function toQuery(pairs: [string, string | number | null | undefined][]): string {
  const parts = pairs
    .filter(
      (pair): pair is [string, string | number] =>
        pair[1] !== undefined && pair[1] !== null && pair[1] !== "",
    )
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);
  return parts.length === 0 ? "" : `?${parts.join("&")}`;
}

async function request(
  path: string,
  method: Method,
  endpoint: GroupEndpoint,
  fallback: string,
  options: { body?: unknown; signal?: AbortSignal; headers?: Record<string, string> } = {},
): Promise<Response> {
  const res = await apiFetch(`${API_BASE_URL}${path}`, {
    endpoint,
    method,
    signal: options.signal,
    headers: {
      ...options.headers,
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  if (!res.ok) {
    throw await parseApiError(res, fallback);
  }
  return res;
}

async function getJson<T>(
  path: string,
  endpoint: GroupEndpoint,
  fallback: string,
  signal?: AbortSignal,
  headers?: Record<string, string>,
): Promise<T> {
  const res = await request(path, "GET", endpoint, fallback, { signal, headers });
  return (await res.json()) as T;
}

/**
 * 번역을 싣는 그룹 조회 4개에만 붙이는 헤더
 *
 * 다른 그룹 API는 언어로 응답이 달라지지 않아 보내지 않는다.
 */
function translatedHeaders(): Record<string, string> {
  return { "Accept-Language": groupRequestLocale() };
}

/** 결과를 돌려주는 변경은 모두 `/api/groups` 아래의 POST다. */
async function sendJson<T>(path: string, fallback: string, body?: unknown): Promise<T> {
  const res = await request(path, "POST", "groups", fallback, { body });
  return (await res.json()) as T;
}

/** 응답 본문이 없는 204라 본문을 읽지 않는다. */
async function send(
  path: string,
  method: Method,
  endpoint: GroupEndpoint,
  fallback: string,
  body?: unknown,
): Promise<void> {
  await request(path, method, endpoint, fallback, { body });
}

/** 신고 본문: 사유는 쓰지 않아도 되지만 본문은 꼭 있어야 해서 사유가 없으면 빈 객체를 보낸다. */
function reportBody(reason: string): ReportRequest {
  const trimmed = reason.trim();
  return trimmed === "" ? {} : { reason: trimmed };
}

/** Bodyless direct membership entry for OPEN public groups. */
export async function joinPublicGroup(groupId: number): Promise<GroupJoinResponse> {
  const mock = await groupDevMock();
  if (mock !== null) return mock.joinPublicGroup(groupId);
  return sendJson(`/api/groups/${groupId}/members`, "public group join failed");
}

export async function getMyGroups(signal?: AbortSignal): Promise<MyGroupsResponse> {
  const mock = await groupDevMock();
  if (mock !== null) {
    return mock.getMyGroups(signal);
  }
  return getJson("/api/groups/me", "groups", "my groups fetch failed", signal, translatedHeaders());
}

export async function getMyApplications(signal?: AbortSignal): Promise<MyApplicationsResponse> {
  const mock = await groupDevMock();
  if (mock !== null) {
    return mock.getMyApplications(signal);
  }
  return getJson("/api/group-applications/me", "groups", "my applications fetch failed", signal);
}

export async function getPublicGroups(
  params: PublicGroupsParams,
  signal?: AbortSignal,
): Promise<PublicGroupPageResponse> {
  const mock = await groupDevMock();
  if (mock !== null) {
    return mock.getPublicGroups(params, signal);
  }
  const query = toQuery([
    ["query", params.query],
    ["category", params.category],
    ["page", params.page],
    ["size", params.size ?? DEFAULT_PAGE_SIZE],
  ]);
  return getJson(
    `/api/groups/public${query}`,
    "groups",
    "public groups fetch failed",
    signal,
    translatedHeaders(),
  );
}

export async function getPublicGroup(
  groupId: number,
  signal?: AbortSignal,
): Promise<PublicGroupDetailResponse> {
  const mock = await groupDevMock();
  if (mock !== null) {
    return mock.getPublicGroup(groupId, signal);
  }
  return getJson(
    `/api/groups/public/${groupId}`,
    "groups",
    "public group fetch failed",
    signal,
    translatedHeaders(),
  );
}

export async function getGroupHome(
  groupId: number,
  signal?: AbortSignal,
): Promise<GroupHomeResponse> {
  const mock = await groupDevMock();
  if (mock !== null) {
    return mock.getGroupHome(groupId, signal);
  }
  return getJson(
    `/api/groups/${groupId}`,
    "groups",
    "group home fetch failed",
    signal,
    translatedHeaders(),
  );
}

export async function getGroupMembers(
  groupId: number,
  signal?: AbortSignal,
): Promise<GroupMembersResponse> {
  const mock = await groupDevMock();
  if (mock !== null) {
    return mock.getGroupMembers(groupId, signal);
  }
  return getJson(`/api/groups/${groupId}/members`, "groups", "group members fetch failed", signal);
}

/** 비공개 그룹에만 코드가 있어 공개 그룹이면 서버가 400을 준다. */
export async function getGroupInvite(
  groupId: number,
  signal?: AbortSignal,
): Promise<GroupInviteResponse> {
  const mock = await groupDevMock();
  if (mock !== null) {
    return mock.getGroupInvite(groupId, signal);
  }
  return getJson(`/api/groups/${groupId}/invite`, "groups", "group invite fetch failed", signal);
}

export async function getGroupApplications(
  groupId: number,
  signal?: AbortSignal,
): Promise<GroupApplicationsResponse> {
  const mock = await groupDevMock();
  if (mock !== null) {
    return mock.getGroupApplications(groupId, signal);
  }
  return getJson(
    `/api/groups/${groupId}/applications`,
    "groups",
    "group applications fetch failed",
    signal,
  );
}

export async function getBlocks(signal?: AbortSignal): Promise<BlockListResponse> {
  const mock = await groupDevMock();
  if (mock !== null) {
    return mock.getBlocks(signal);
  }
  return getJson("/api/blocks", "blocks", "blocks fetch failed", signal);
}

export async function createGroup(body: GroupCreateRequest): Promise<GroupCreateResponse> {
  const mock = await groupDevMock();
  if (mock !== null) {
    return mock.createGroup(body);
  }
  return sendJson("/api/groups", "group create failed", body);
}

/** 전체 교체라 소개를 빼면 서버가 소개를 비운다. */
export async function updateGroup(groupId: number, body: GroupUpdateRequest): Promise<void> {
  const mock = await groupDevMock();
  if (mock !== null) {
    return mock.updateGroup(groupId, body);
  }
  return send(`/api/groups/${groupId}`, "PATCH", "groups", "group update failed", body);
}

export async function setGroupNotification(groupId: number, enabled: boolean): Promise<void> {
  const mock = await groupDevMock();
  if (mock !== null) {
    return mock.setGroupNotification(groupId, enabled);
  }
  const body: GroupNotificationRequest = { enabled };
  return send(
    `/api/groups/${groupId}/notifications`,
    "PUT",
    "groups",
    "group notification update failed",
    body,
  );
}

export async function transferGroupOwner(groupId: number, userId: number): Promise<void> {
  const mock = await groupDevMock();
  if (mock !== null) {
    return mock.transferGroupOwner(groupId, userId);
  }
  const body: GroupOwnerTransferRequest = { userId };
  return send(`/api/groups/${groupId}/owner`, "PUT", "groups", "group owner transfer failed", body);
}

/** 비공개 그룹이면 서버가 초대코드를 새로 만들지만 응답에는 없어 초대코드를 다시 받아야 한다. */
export async function kickGroupMember(groupId: number, userId: number): Promise<void> {
  const mock = await groupDevMock();
  if (mock !== null) {
    return mock.kickGroupMember(groupId, userId);
  }
  return send(
    `/api/groups/${groupId}/members/${userId}`,
    "DELETE",
    "groups",
    "group member kick failed",
  );
}

export async function leaveGroup(groupId: number): Promise<void> {
  const mock = await groupDevMock();
  if (mock !== null) {
    return mock.leaveGroup(groupId);
  }
  return send(`/api/groups/${groupId}/leave`, "POST", "groups", "group leave failed");
}

export async function regenerateGroupInvite(groupId: number): Promise<GroupInviteResponse> {
  const mock = await groupDevMock();
  if (mock !== null) {
    return mock.regenerateGroupInvite(groupId);
  }
  return sendJson(`/api/groups/${groupId}/invite`, "group invite regenerate failed");
}

/** 이미 멤버여도 200이고 `joined`만 false다. */
export async function joinGroupByCode(
  inviteCode: string,
  via: GroupJoinVia,
): Promise<GroupJoinResponse> {
  const mock = await groupDevMock();
  if (mock !== null) {
    return mock.joinGroupByCode(inviteCode, via);
  }
  const body: GroupJoinRequest = { inviteCode, via };
  return sendJson("/api/groups/join", "group join by code failed", body);
}

export async function applyToGroup(
  groupId: number,
  introduction: string,
): Promise<GroupApplicationCreateResponse> {
  const mock = await groupDevMock();
  if (mock !== null) {
    return mock.applyToGroup(groupId, introduction);
  }
  const body: GroupApplicationCreateRequest = { introduction };
  return sendJson(`/api/groups/${groupId}/applications`, "group apply failed", body);
}

export async function cancelApplication(applicationId: number): Promise<void> {
  const mock = await groupDevMock();
  if (mock !== null) {
    return mock.cancelApplication(applicationId);
  }
  return send(
    `/api/group-applications/${applicationId}`,
    "DELETE",
    "groups",
    "application cancel failed",
  );
}

export async function acceptApplication(applicationId: number): Promise<void> {
  const mock = await groupDevMock();
  if (mock !== null) {
    return mock.acceptApplication(applicationId);
  }
  return send(
    `/api/group-applications/${applicationId}/accept`,
    "POST",
    "groups",
    "application accept failed",
  );
}

export async function declineApplication(applicationId: number): Promise<void> {
  const mock = await groupDevMock();
  if (mock !== null) {
    return mock.declineApplication(applicationId);
  }
  return send(
    `/api/group-applications/${applicationId}/decline`,
    "POST",
    "groups",
    "application decline failed",
  );
}

export async function reportApplication(applicationId: number, reason: string): Promise<void> {
  const mock = await groupDevMock();
  if (mock !== null) {
    return mock.reportApplication(applicationId, reason);
  }
  return send(
    `/api/group-applications/${applicationId}/report`,
    "POST",
    "groups",
    "application report failed",
    reportBody(reason),
  );
}

/** 서버는 신고와 함께 그 멤버를 차단한다. */
export async function reportGroupMember(
  groupId: number,
  userId: number,
  reason: string,
): Promise<void> {
  const mock = await groupDevMock();
  if (mock !== null) {
    return mock.reportGroupMember(groupId, userId, reason);
  }
  return send(
    `/api/groups/${groupId}/members/${userId}/report`,
    "POST",
    "groups",
    "group member report failed",
    reportBody(reason),
  );
}

export async function unblockUser(userId: number): Promise<void> {
  const mock = await groupDevMock();
  if (mock !== null) {
    return mock.unblockUser(userId);
  }
  return send(`/api/blocks/${userId}`, "DELETE", "blocks", "unblock failed");
}

/** 자리는 30초 동안만 잡혀 있고, 그 안에 응답의 방을 구독해야 들어간 것으로 정해진다. */
export async function joinGroupRoom(groupId: number): Promise<GroupRoomJoinResponse> {
  const mock = await groupDevMock();
  if (mock !== null) {
    return mock.joinGroupRoom(groupId);
  }
  return sendJson(`/api/groups/${groupId}/room/join`, "group room join failed");
}

export async function leaveGroupRoom(groupId: number): Promise<void> {
  const mock = await groupDevMock();
  if (mock !== null) {
    return mock.leaveGroupRoom(groupId);
  }
  return send(`/api/groups/${groupId}/room/leave`, "POST", "groups", "group room leave failed");
}
