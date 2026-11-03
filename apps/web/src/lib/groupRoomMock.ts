import type { GroupApplicationItem, GroupRoomJoinResponse } from "@focusmakers/types";

import { ApiError } from "./api";
import type { GroupRoomApi } from "./groupRoomApi";
import {
  GROUP_MOCK_APPLICATION_TTL_MS,
  GROUP_MOCK_LIMITS,
  GROUP_MOCK_ME,
  isGroupFull,
  isMember,
  isRecentlyKicked,
  seedGroupWorld,
  viewGroupWorld,
} from "./groupRoomMockData";
import type { GroupMockScene, MockGroup, MockMember } from "./groupRoomMockData";

/**
 * 개발 빌드 전용 그룹 가짜 서버
 *
 * 백엔드 그룹 API가 아직 501이라 `?groupMock=<장면>`으로 켜서 화면 흐름을 먼저 돌려 본다.
 * `?groupMockError=<코드>`를 더하면 모든 변경이 그 코드로 실패해 오류 문구를 볼 수 있다.
 * `groupRoomApi`가 개발 빌드에서만 동적으로 불러와 운영 빌드에는 들어가지 않는다.
 * 권한과 한도, 오류 코드와 HTTP 상태는 Swagger 설명을 따라 실제 서버처럼 답한다.
 */

export const GROUP_MOCK_SCENES: readonly GroupMockScene[] = ["default", "empty", "limits"];

export interface GroupMockServer extends GroupRoomApi {
  /** 테스트가 견본 그룹의 그룹장을 바꿔 그룹장 화면을 연다. */
  setOwnerForTests(groupId: number, userId: number): void;
}

export interface GroupMockOptions {
  now?: () => number;
  /** 값이 있으면 모든 변경이 이 코드의 오류로 실패한다. */
  injectError?: string | null;
  /** 불러오는 중 모양이 보이도록 답을 늦추는 시간이고 기본은 300ms다. */
  delayMs?: number;
}

const DEFAULT_DELAY_MS = 300;
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;
/** 가짜 방 번호라 실제 숫자 4자리 방과 겹치지 않게 큰 수에서 센다. */
const MOCK_ROOM_ID_BASE = 900_000;
const ICE_TTL_SECONDS = 86_400;

// 상태가 정해진 공통 코드다.
// 나머지는 이름이 `_NOT_FOUND`로 끝나면 404, `NOT_GROUP_`으로 시작하면 403이고 그 밖의 그룹 코드는 모두 409다.
const STATUS_BY_CODE: ReadonlyMap<string, number> = new Map([
  ["BAD_REQUEST", 400],
  ["VALIDATION_FAILED", 400],
  ["CONTACT_NOT_ALLOWED", 400],
  ["REQUEST_FAILED", 400],
  ["UNAUTHORIZED", 401],
  ["INTERNAL_ERROR", 500],
  ["NOT_IMPLEMENTED", 501],
]);

function statusOf(code: string): number {
  const known = STATUS_BY_CODE.get(code);
  if (known !== undefined) {
    return known;
  }
  if (code === "NOT_FOUND" || code.endsWith("_NOT_FOUND")) {
    return 404;
  }
  if (code.startsWith("NOT_GROUP_")) {
    return 403;
  }
  return 409;
}

function apiError(code: string): ApiError {
  return new ApiError(`그룹 가짜 서버 ${code}`, statusOf(code), code);
}

const INVITE_CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const INVITE_CODE_LENGTH = 6;
const INVITE_CODE_SPACE = INVITE_CODE_CHARS.length ** INVITE_CODE_LENGTH;

/**
 * 순번의 초대코드
 *
 * 서버처럼 서로 비슷해 보이는 0, O, 1, I, L을 뺀 글자로 6자리를 만든다.
 * 곱하는 수가 글자 수와 서로소인 소수라 순번이 다르면 코드도 달라 내보낸 뒤 코드가 늘 바뀐다.
 */
function inviteCodeAt(sequence: number): string {
  let rest = (sequence * 104_729 + 7_919) % INVITE_CODE_SPACE;
  let code = "";
  for (let index = 0; index < INVITE_CODE_LENGTH; index += 1) {
    code = INVITE_CODE_CHARS[rest % INVITE_CODE_CHARS.length] + code;
    rest = Math.floor(rest / INVITE_CODE_CHARS.length);
  }
  return code;
}

function textOrNull(text: string | undefined): string | null {
  const trimmed = text?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/**
 * 장면 하나의 가짜 서버 만들기
 *
 * 상태는 이 서버 안에만 있어 새로 만들면 장면의 처음으로 돌아간다.
 * 함수는 `this`를 쓰지 않아 라우트 테스트가 함수 하나씩 떼어 mock 구현으로 넣을 수 있다.
 */
export function createGroupMockServer(
  scene: GroupMockScene,
  options: GroupMockOptions = {},
): GroupMockServer {
  const now = options.now ?? Date.now;
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const injectError = options.injectError ?? null;
  const world = seedGroupWorld(scene, now());
  // 새로 만드는 그룹과 신청의 번호는 견본 번호와 겹치지 않게 1001부터 쓴다.
  let lastId = 1_000;
  let inviteSequence = 0;
  // 답했거나 취소한 신청에 다시 답하면 서버는 404가 아니라 409를 준다.
  const closedApplicationIds = new Set<number>();

  const nextId = () => {
    lastId += 1;
    return lastId;
  };
  const isoNow = () => new Date(now()).toISOString();
  const view = () => viewGroupWorld(world, now());

  const settle = (): Promise<void> =>
    delayMs > 0 ? new Promise((resolve) => setTimeout(resolve, delayMs)) : Promise.resolve();

  async function read<T>(work: () => T): Promise<T> {
    await settle();
    return work();
  }

  async function change<T>(work: () => T): Promise<T> {
    await settle();
    if (injectError !== null) {
      throw apiError(injectError);
    }
    return work();
  }

  function findGroup(groupId: number): MockGroup {
    const group = world.groups.find((candidate) => candidate.groupId === groupId);
    if (group === undefined) {
      throw apiError("GROUP_NOT_FOUND");
    }
    return group;
  }

  function joinedGroup(groupId: number): MockGroup {
    const group = findGroup(groupId);
    if (!isMember(group, GROUP_MOCK_ME)) {
      throw apiError("NOT_GROUP_MEMBER");
    }
    return group;
  }

  function ownedGroup(groupId: number): MockGroup {
    const group = findGroup(groupId);
    if (group.ownerId !== GROUP_MOCK_ME) {
      throw apiError("NOT_GROUP_OWNER");
    }
    return group;
  }

  /** 넘기기, 내보내기, 신고의 대상인 다른 멤버 */
  function otherMember(group: MockGroup, userId: number): MockMember {
    if (userId === GROUP_MOCK_ME) {
      throw apiError("BAD_REQUEST");
    }
    const target = group.members.find((candidate) => candidate.userId === userId);
    if (target === undefined) {
      throw apiError("GROUP_MEMBER_NOT_FOUND");
    }
    return target;
  }

  function slotsUsed(): number {
    const { mine } = view();
    return mine.groups.length + mine.pendingApplicationCount;
  }

  function newInviteCode(): string {
    const taken = new Set(world.groups.map((group) => group.inviteCode));
    let code: string;
    do {
      inviteSequence += 1;
      code = inviteCodeAt(inviteSequence);
    } while (taken.has(code));
    return code;
  }

  function meJoiningNow(): MockMember {
    return { ...world.me, joinedAt: isoNow() };
  }

  /** 그룹장이 답할 신청을 찾고, 찾지 못한 까닭을 서버와 같은 코드로 알린다. */
  function applicationToAnswer(applicationId: number): {
    group: MockGroup;
    application: GroupApplicationItem;
  } {
    const group = world.groups.find((candidate) =>
      candidate.applications.some((item) => item.applicationId === applicationId),
    );
    if (group === undefined) {
      if (closedApplicationIds.has(applicationId)) {
        throw apiError("APPLICATION_NOT_PENDING");
      }
      // 내가 보낸 신청은 남의 그룹으로 간 것이라 그룹장이 아니라는 답이 맞다.
      if (world.myApplications.some((item) => item.applicationId === applicationId)) {
        throw apiError("NOT_GROUP_OWNER");
      }
      throw apiError("NOT_FOUND");
    }
    if (group.ownerId !== GROUP_MOCK_ME) {
      throw apiError("NOT_GROUP_OWNER");
    }
    const application = group.applications.find((item) => item.applicationId === applicationId)!;
    if (Date.parse(application.expiresAt) <= now()) {
      throw apiError("APPLICATION_NOT_PENDING");
    }
    return { group, application };
  }

  function closeApplication(group: MockGroup, application: GroupApplicationItem): void {
    group.applications = group.applications.filter((item) => item !== application);
    closedApplicationIds.add(application.applicationId);
  }

  return {
    getMyGroups: () => read(() => view().mine),
    getMyApplications: () => read(() => view().myApplications),
    getPublicGroups: (params) =>
      read(() => {
        const size = params.size ?? DEFAULT_PAGE_SIZE;
        if (params.page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
          throw apiError("REQUEST_FAILED");
        }
        const query = (params.query ?? "").toLowerCase();
        const category = params.category ?? null;
        const matched = view().publicGroups.filter(
          (group) =>
            (category === null || group.category === category) &&
            group.name.toLowerCase().includes(query),
        );
        const start = params.page * size;
        return {
          groups: matched.slice(start, start + size),
          hasNext: start + size < matched.length,
        };
      }),
    getPublicGroup: (groupId) =>
      read(() => {
        // 비공개 그룹은 있는지조차 알리지 않아 없는 그룹과 같은 404다.
        const detail = view().publicDetails[groupId];
        if (detail === undefined) {
          throw apiError("GROUP_NOT_FOUND");
        }
        return detail;
      }),
    getGroupHome: (groupId) =>
      read(() => {
        joinedGroup(groupId);
        return view().homes[groupId]!;
      }),
    getGroupMembers: (groupId) =>
      read(() => {
        joinedGroup(groupId);
        return view().members[groupId]!;
      }),
    getGroupInvite: (groupId) =>
      read(() => {
        const group = joinedGroup(groupId);
        if (group.inviteCode === null) {
          throw apiError("BAD_REQUEST");
        }
        return { inviteCode: group.inviteCode };
      }),
    getGroupApplications: (groupId) =>
      read(() => {
        ownedGroup(groupId);
        return view().applications[groupId]!;
      }),
    getBlocks: () => read(() => view().blocks),

    createGroup: (body) =>
      change(() => {
        const { mine } = view();
        if (mine.ownedGroupCount >= GROUP_MOCK_LIMITS.maxOwnedGroups) {
          throw apiError("OWNED_GROUP_LIMIT");
        }
        if (slotsUsed() >= GROUP_MOCK_LIMITS.maxGroupsAndApplications) {
          throw apiError("GROUP_SLOT_LIMIT");
        }
        const groupId = nextId();
        world.groups.push({
          groupId,
          name: body.name.trim(),
          visibility: body.visibility,
          category: body.category,
          description: textOrNull(body.description),
          ownerId: GROUP_MOCK_ME,
          members: [meJoiningNow()],
          inviteCode: body.visibility === "PRIVATE" ? newInviteCode() : null,
          applications: [],
          notifyEnabled: false,
        });
        return { groupId };
      }),
    updateGroup: (groupId, body) =>
      change(() => {
        const group = ownedGroup(groupId);
        group.name = body.name.trim();
        group.category = body.category;
        group.description = textOrNull(body.description);
      }),
    setGroupNotification: (groupId, enabled) =>
      change(() => {
        joinedGroup(groupId).notifyEnabled = enabled;
      }),
    transferGroupOwner: (groupId, userId) =>
      change(() => {
        const group = ownedGroup(groupId);
        group.ownerId = otherMember(group, userId).userId;
      }),
    kickGroupMember: (groupId, userId) =>
      change(() => {
        const group = ownedGroup(groupId);
        const target = otherMember(group, userId);
        group.members = group.members.filter((candidate) => candidate !== target);
        // 비공개 그룹은 내보낸 사람이 예전 코드로 돌아오지 못하게 코드를 새로 만든다.
        if (group.inviteCode !== null) {
          group.inviteCode = newInviteCode();
        }
      }),
    leaveGroup: (groupId) =>
      change(() => {
        const group = joinedGroup(groupId);
        if (group.ownerId === GROUP_MOCK_ME) {
          if (group.members.length > 1) {
            throw apiError("OWNER_CANNOT_LEAVE");
          }
          // 혼자 남은 그룹장이 나가면 그룹이 사라진다.
          world.groups = world.groups.filter((candidate) => candidate !== group);
          return;
        }
        // 스스로 나가면 서버가 코드를 바꾸지 않아 같은 링크로 다시 들어올 수 있다.
        group.members = group.members.filter((candidate) => candidate.userId !== GROUP_MOCK_ME);
        group.notifyEnabled = false;
      }),
    regenerateGroupInvite: (groupId) =>
      change(() => {
        const group = ownedGroup(groupId);
        if (group.inviteCode === null) {
          throw apiError("BAD_REQUEST");
        }
        group.inviteCode = newInviteCode();
        return { inviteCode: group.inviteCode };
      }),
    joinGroupByCode: (inviteCode) =>
      change(() => {
        const code = inviteCode.trim().toUpperCase();
        if (code === "") {
          throw apiError("VALIDATION_FAILED");
        }
        const group = world.groups.find((candidate) => candidate.inviteCode === code);
        if (group === undefined) {
          throw apiError("INVITE_CODE_NOT_FOUND");
        }
        // 서버는 한도와 정원보다 이미 멤버인지를 먼저 본다.
        if (isMember(group, GROUP_MOCK_ME)) {
          return { groupId: group.groupId, joined: false };
        }
        if (isRecentlyKicked(world, group.groupId, now())) {
          throw apiError("RECENTLY_KICKED");
        }
        if (slotsUsed() >= GROUP_MOCK_LIMITS.maxGroupsAndApplications) {
          throw apiError("GROUP_SLOT_LIMIT");
        }
        if (isGroupFull(group)) {
          throw apiError("GROUP_FULL");
        }
        group.members.push(meJoiningNow());
        return { groupId: group.groupId, joined: true };
      }),
    applyToGroup: (groupId) =>
      change(() => {
        const detail = view().publicDetails[groupId];
        if (detail === undefined) {
          throw apiError("GROUP_NOT_FOUND");
        }
        // 공개 그룹 보기의 상태 순서가 서버가 신청을 막는 순서와 같다.
        switch (detail.applyState) {
          case "MEMBER":
            throw apiError("ALREADY_MEMBER");
          case "APPLIED":
            throw apiError("ALREADY_APPLIED");
          case "FULL":
            throw apiError("GROUP_FULL");
          case "UNAVAILABLE":
            throw apiError(detail.unavailableReason ?? "GROUP_SLOT_LIMIT");
          case "CAN_APPLY":
            break;
        }
        const appliedAtMs = now();
        const application = {
          applicationId: nextId(),
          groupId,
          appliedAt: new Date(appliedAtMs).toISOString(),
          expiresAt: new Date(appliedAtMs + GROUP_MOCK_APPLICATION_TTL_MS).toISOString(),
        };
        world.myApplications.push(application);
        return { applicationId: application.applicationId, expiresAt: application.expiresAt };
      }),
    cancelApplication: (applicationId) =>
      change(() => {
        const application = world.myApplications.find(
          (item) => item.applicationId === applicationId,
        );
        if (application === undefined) {
          throw apiError(
            closedApplicationIds.has(applicationId) ? "APPLICATION_NOT_PENDING" : "NOT_FOUND",
          );
        }
        if (Date.parse(application.expiresAt) <= now()) {
          throw apiError("APPLICATION_NOT_PENDING");
        }
        world.myApplications = world.myApplications.filter((item) => item !== application);
        closedApplicationIds.add(applicationId);
      }),
    acceptApplication: (applicationId) =>
      change(() => {
        const { group, application } = applicationToAnswer(applicationId);
        // 자리가 없으면 신청은 기한까지 남아 자리가 나면 다시 수락할 수 있다.
        if (isGroupFull(group)) {
          throw apiError("GROUP_FULL");
        }
        closeApplication(group, application);
        group.members.push({
          userId: application.userId,
          nickname: application.nickname,
          profileImageUrl: application.profileImageUrl,
          status: "IDLE",
          accumulating: false,
          todayFocusSec: 0,
          weekFocusSec: 0,
          lastStudiedAt: null,
          joinedAt: isoNow(),
        });
      }),
    declineApplication: (applicationId) =>
      change(() => {
        const { group, application } = applicationToAnswer(applicationId);
        closeApplication(group, application);
      }),
    reportApplication: (applicationId) =>
      change(() => {
        // 신고한 신청은 바로 거절된다.
        const { group, application } = applicationToAnswer(applicationId);
        closeApplication(group, application);
      }),
    reportGroupMember: (groupId, userId) =>
      change(() => {
        const target = otherMember(joinedGroup(groupId), userId);
        // 신고하면 차단도 되고 이미 차단했으면 그대로다.
        if (!world.blocks.some((blocked) => blocked.userId === userId)) {
          world.blocks.push({
            userId,
            nickname: target.nickname,
            profileImageUrl: target.profileImageUrl,
            blockedAt: isoNow(),
          });
        }
      }),
    unblockUser: (userId) =>
      change(() => {
        world.blocks = world.blocks.filter((blocked) => blocked.userId !== userId);
      }),
    joinGroupRoom: (groupId) =>
      change((): GroupRoomJoinResponse => {
        joinedGroup(groupId);
        return {
          roomId: MOCK_ROOM_ID_BASE + groupId,
          graceRejoin: false,
          cameraOn: null,
          micOn: null,
          onBreak: null,
          iceServers: [],
          iceTtlSeconds: ICE_TTL_SECONDS,
        };
      }),
    leaveGroupRoom: (groupId) =>
      change(() => {
        joinedGroup(groupId);
      }),

    setOwnerForTests(groupId, userId) {
      const group = world.groups.find((candidate) => candidate.groupId === groupId);
      if (group === undefined || !isMember(group, userId)) {
        throw new Error(`그룹 ${groupId}에 멤버 ${userId}가 없어 그룹장으로 정할 수 없다`);
      }
      group.ownerId = userId;
    },
  };
}

// 앱 안에서 이동하면 주소에서 쿼리가 빠지므로 처음 읽을 때 한 번 정해 둔다.
let activeServer: GroupMockServer | null | undefined;

function readActiveServer(): GroupMockServer | null {
  const params = new URLSearchParams(window.location.search);
  const scene = GROUP_MOCK_SCENES.find((candidate) => candidate === params.get("groupMock"));
  if (scene === undefined) {
    return null;
  }
  return createGroupMockServer(scene, { injectError: params.get("groupMockError") || null });
}

/**
 * 주소가 고른 장면의 가짜 서버
 *
 * 개발 빌드에서만 주소를 읽고, 장면이 없거나 모르는 장면이면 null이라 실제 서버로 보낸다.
 */
export function activeGroupMockServer(): GroupMockServer | null {
  if (!import.meta.env.DEV) {
    return null;
  }
  if (activeServer === undefined) {
    activeServer = readActiveServer();
  }
  return activeServer;
}

/** 테스트마다 주소를 바꿔 장면을 다시 읽도록 기억한 서버를 비운다. */
export function __resetGroupMockForTests(): void {
  activeServer = undefined;
}
