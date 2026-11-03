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
 * 그룹 API 26개
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
  options: { body?: unknown; signal?: AbortSignal } = {},
): Promise<Response> {
  const res = await apiFetch(`${API_BASE_URL}${path}`, {
    endpoint,
    method,
    signal: options.signal,
    ...(options.body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(options.body) }),
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
): Promise<T> {
  const res = await request(path, "GET", endpoint, fallback, { signal });
  return (await res.json()) as T;
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

export async function getMyGroups(signal?: AbortSignal): Promise<MyGroupsResponse> {
  return getJson("/api/groups/me", "groups", "내 그룹 조회 실패", signal);
}

export async function getMyApplications(signal?: AbortSignal): Promise<MyApplicationsResponse> {
  return getJson("/api/group-applications/me", "groups", "내 신청 조회 실패", signal);
}

export async function getPublicGroups(
  params: PublicGroupsParams,
  signal?: AbortSignal,
): Promise<PublicGroupPageResponse> {
  const query = toQuery([
    ["query", params.query],
    ["category", params.category],
    ["page", params.page],
    ["size", params.size ?? DEFAULT_PAGE_SIZE],
  ]);
  return getJson(`/api/groups/public${query}`, "groups", "공개 그룹 목록 조회 실패", signal);
}

export async function getPublicGroup(
  groupId: number,
  signal?: AbortSignal,
): Promise<PublicGroupDetailResponse> {
  return getJson(`/api/groups/public/${groupId}`, "groups", "공개 그룹 조회 실패", signal);
}

export async function getGroupHome(
  groupId: number,
  signal?: AbortSignal,
): Promise<GroupHomeResponse> {
  return getJson(`/api/groups/${groupId}`, "groups", "그룹 홈 조회 실패", signal);
}

export async function getGroupMembers(
  groupId: number,
  signal?: AbortSignal,
): Promise<GroupMembersResponse> {
  return getJson(`/api/groups/${groupId}/members`, "groups", "멤버 목록 조회 실패", signal);
}

/** 비공개 그룹에만 코드가 있어 공개 그룹이면 서버가 400을 준다. */
export async function getGroupInvite(
  groupId: number,
  signal?: AbortSignal,
): Promise<GroupInviteResponse> {
  return getJson(`/api/groups/${groupId}/invite`, "groups", "초대코드 조회 실패", signal);
}

export async function getGroupApplications(
  groupId: number,
  signal?: AbortSignal,
): Promise<GroupApplicationsResponse> {
  return getJson(`/api/groups/${groupId}/applications`, "groups", "신청 목록 조회 실패", signal);
}

export async function getBlocks(signal?: AbortSignal): Promise<BlockListResponse> {
  return getJson("/api/blocks", "blocks", "차단 목록 조회 실패", signal);
}

export async function createGroup(body: GroupCreateRequest): Promise<GroupCreateResponse> {
  return sendJson("/api/groups", "그룹 만들기 실패", body);
}

/** 전체 교체라 소개를 빼면 서버가 소개를 비운다. */
export async function updateGroup(groupId: number, body: GroupUpdateRequest): Promise<void> {
  return send(`/api/groups/${groupId}`, "PATCH", "groups", "그룹 설정 저장 실패", body);
}

export async function setGroupNotification(groupId: number, enabled: boolean): Promise<void> {
  const body: GroupNotificationRequest = { enabled };
  return send(
    `/api/groups/${groupId}/notifications`,
    "PUT",
    "groups",
    "멤버 공부 알림 설정 실패",
    body,
  );
}

export async function transferGroupOwner(groupId: number, userId: number): Promise<void> {
  const body: GroupOwnerTransferRequest = { userId };
  return send(`/api/groups/${groupId}/owner`, "PUT", "groups", "그룹장 넘기기 실패", body);
}

/** 비공개 그룹이면 서버가 초대코드를 새로 만들지만 응답에는 없어 초대코드를 다시 받아야 한다. */
export async function kickGroupMember(groupId: number, userId: number): Promise<void> {
  return send(`/api/groups/${groupId}/members/${userId}`, "DELETE", "groups", "멤버 내보내기 실패");
}

export async function leaveGroup(groupId: number): Promise<void> {
  return send(`/api/groups/${groupId}/leave`, "POST", "groups", "그룹 나가기 실패");
}

export async function regenerateGroupInvite(groupId: number): Promise<GroupInviteResponse> {
  return sendJson(`/api/groups/${groupId}/invite`, "초대코드 새로 만들기 실패");
}

/** 이미 멤버여도 200이고 `joined`만 false다. */
export async function joinGroupByCode(
  inviteCode: string,
  via: GroupJoinVia,
): Promise<GroupJoinResponse> {
  const body: GroupJoinRequest = { inviteCode, via };
  return sendJson("/api/groups/join", "초대코드 참여 실패", body);
}

export async function applyToGroup(
  groupId: number,
  introduction: string,
): Promise<GroupApplicationCreateResponse> {
  const body: GroupApplicationCreateRequest = { introduction };
  return sendJson(`/api/groups/${groupId}/applications`, "그룹 신청 실패", body);
}

export async function cancelApplication(applicationId: number): Promise<void> {
  return send(`/api/group-applications/${applicationId}`, "DELETE", "groups", "신청 취소 실패");
}

export async function acceptApplication(applicationId: number): Promise<void> {
  return send(
    `/api/group-applications/${applicationId}/accept`,
    "POST",
    "groups",
    "신청 수락 실패",
  );
}

export async function declineApplication(applicationId: number): Promise<void> {
  return send(
    `/api/group-applications/${applicationId}/decline`,
    "POST",
    "groups",
    "신청 거절 실패",
  );
}

export async function reportApplication(applicationId: number, reason: string): Promise<void> {
  return send(
    `/api/group-applications/${applicationId}/report`,
    "POST",
    "groups",
    "신청 신고 실패",
    reportBody(reason),
  );
}

/** 서버는 신고와 함께 그 멤버를 차단한다. */
export async function reportGroupMember(
  groupId: number,
  userId: number,
  reason: string,
): Promise<void> {
  return send(
    `/api/groups/${groupId}/members/${userId}/report`,
    "POST",
    "groups",
    "멤버 신고 실패",
    reportBody(reason),
  );
}

export async function unblockUser(userId: number): Promise<void> {
  return send(`/api/blocks/${userId}`, "DELETE", "blocks", "차단 해제 실패");
}

/** 자리는 30초 동안만 잡혀 있고, 그 안에 응답의 방을 구독해야 들어간 것으로 정해진다. */
export async function joinGroupRoom(groupId: number): Promise<GroupRoomJoinResponse> {
  return sendJson(`/api/groups/${groupId}/room/join`, "그룹 공부방 자리 잡기 실패");
}

export async function leaveGroupRoom(groupId: number): Promise<void> {
  return send(`/api/groups/${groupId}/room/leave`, "POST", "groups", "그룹 공부방 나가기 실패");
}
