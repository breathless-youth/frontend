import type {
  BlockedUser as BlockedUserResponse,
  GroupApplicationItem,
  GroupHomeResponse,
  GroupMemberDesk,
  GroupMemberItem,
  GroupMemberStatus,
  GroupRole,
  GroupUnavailableReason,
  GroupVisibility,
  MyApplicationItem,
  MyGroupCard,
  PublicGroupCard,
  PublicGroupDetailResponse,
} from "@focusmakers/types";

import { studyCategoryLabel } from "@/lib/studyCategory";

import type { MemberPresence } from "./model/desks";
import type { ApplyBlockReason } from "./model/limits";
import type { RoomRole, RoomVisibility } from "./model/roomMenu";
import type {
  ApplicationRequest,
  ApplyState,
  BlockedUser,
  MyRoomSummary,
  PendingApplication,
  PublicRoomDetail,
  PublicRoomSummary,
  RoomDeskMember,
  RoomHome,
  RoomMemberRow,
  WeeklyRankRow,
} from "./types";

/**
 * 그룹 API 응답을 화면 타입으로 바꾸는 함수
 *
 * 판단 모듈인 `model/`이 서버 타입을 모르게 두려고 서버 모양은 여기서만 다룬다.
 * 서버의 `groupId`는 화면의 `roomId`이고, 프로필 사진은 화면의 사진 칸으로 넘긴다.
 * 웹은 서버와 따로 배포되어 서버가 상태 값을 더해도 화면이 깨지지 않게 모르는 값마다 정한 값으로 바꾼다.
 */

// 서버가 보낸 값을 그대로 열쇠로 쓰므로 객체 속성과 겹치지 않게 Map에 두고, 빠진 값이 없는지는 satisfies로 본다.
const PRESENCE_BY_STATUS: ReadonlyMap<string, MemberPresence> = new Map(
  Object.entries({
    IN_ROOM: "this_room",
    STUDYING: "studying_elsewhere",
    PAUSED: "paused_elsewhere",
    IDLE: "away",
  } satisfies Record<GroupMemberStatus, MemberPresence>),
);

const BLOCK_REASON_BY_SERVER: ReadonlyMap<string, ApplyBlockReason> = new Map(
  Object.entries({
    RECENTLY_KICKED: "kicked_recently",
    GROUP_SLOT_LIMIT: "rooms_and_applications_full",
    APPLICATION_LIMIT: "pending_applications_full",
  } satisfies Record<GroupUnavailableReason, ApplyBlockReason>),
);

// 서버가 시험·목표 값을 더해도 화면이 깨지지 않게 모르는 값은 글자 없이 보인다.
function categoryLabel(category: string): string {
  return studyCategoryLabel(category) ?? "";
}

function toRoomRole(role: GroupRole): RoomRole {
  return role === "OWNER" ? "owner" : "member";
}

/** 모르는 공부 상태는 공부 중이라고 잘못 보이지 않게 자리를 비운 것으로 본다. */
export function toMemberPresence(status: GroupMemberStatus): MemberPresence {
  return PRESENCE_BY_STATUS.get(status) ?? "away";
}

export function toRoomVisibility(visibility: GroupVisibility): RoomVisibility {
  return visibility === "PUBLIC" ? "public" : "private";
}

export function toGroupVisibility(visibility: RoomVisibility): GroupVisibility {
  return visibility === "public" ? "PUBLIC" : "PRIVATE";
}

/** 모르는 이유는 이유가 비어 온 때처럼 가장 넓은 한도인 그룹 개수 문장으로 본다. */
export function toApplyBlockReason(reason: GroupUnavailableReason): ApplyBlockReason {
  return BLOCK_REASON_BY_SERVER.get(reason) ?? "rooms_and_applications_full";
}

/**
 * 공개 그룹 보기의 신청 버튼 상태
 *
 * 이미 멤버면 공개 그룹 보기 대신 그룹 홈으로 가야 해서 null이다.
 * `UNAVAILABLE`인데 이유가 비어 오면 버튼을 흐린 채 두려고 가장 넓은 한도인 그룹 개수 문장을 쓴다.
 * 모르는 상태는 신청할 수 있는지 알 수 없어 이유 문장 없이 신청 버튼만 흐린다.
 */
export function toApplyState(detail: PublicGroupDetailResponse): ApplyState | null {
  switch (detail.applyState) {
    case "MEMBER":
      return null;
    case "APPLIED":
      return { kind: "applied" };
    case "FULL":
      return { kind: "full" };
    case "UNAVAILABLE":
      return {
        kind: "blocked",
        reason:
          detail.unavailableReason === null
            ? "rooms_and_applications_full"
            : toApplyBlockReason(detail.unavailableReason),
      };
    case "CAN_APPLY":
      return { kind: "can_apply" };
    default:
      return { kind: "full" };
  }
}

/**
 * 책상에 앉힐 멤버
 *
 * 지금 보는 사람의 책상은 닉네임 대신 `나`로 그리도록 사용자 번호를 견줘 표시한다.
 * 오늘 순공은 이 그룹이 아니라 앱 전체에서 쌓은 값이다.
 */
export function toRoomDeskMember(desk: GroupMemberDesk, myUserId: number): RoomDeskMember {
  return {
    userId: desk.userId,
    nickname: desk.nickname,
    isOwner: desk.owner,
    isMe: desk.userId === myUserId,
    presence: toMemberPresence(desk.status),
    todayStudySec: desk.todayFocusSec,
    lastStudiedAt: desk.lastStudiedAt,
    accumulating: desk.accumulating,
  };
}

export function toMyRoomSummary(card: MyGroupCard, myUserId: number): MyRoomSummary {
  return {
    roomId: card.groupId,
    name: card.name,
    categoryLabel: categoryLabel(card.category),
    visibility: toRoomVisibility(card.visibility),
    memberCount: card.memberCount,
    // 공개 그룹 그룹장이 아니면 서버가 null을 준다.
    newRequestCount: card.newApplicationCount ?? 0,
    members: card.members.map((desk) => toRoomDeskMember(desk, myUserId)),
  };
}

export function toPendingApplication(item: MyApplicationItem): PendingApplication {
  return {
    applicationId: item.applicationId,
    roomId: item.groupId,
    roomName: item.groupName,
    categoryLabel: categoryLabel(item.category),
    expiresAt: item.expiresAt,
  };
}

export function toPublicRoomSummary(card: PublicGroupCard): PublicRoomSummary {
  return {
    roomId: card.groupId,
    name: card.name,
    categoryLabel: categoryLabel(card.category),
    memberCount: card.memberCount,
    weeklyAverageSec: card.weeklyAverageFocusSec,
    studyingCount: card.studyingCount,
    member: card.member,
  };
}

/**
 * 공개 그룹 보기
 *
 * 멤버인 그룹은 그룹 홈으로 보내므로 여기서 보는 사람은 멤버가 아니고 `나`로 그릴 책상이 없다.
 */
export function toPublicRoomDetail(
  detail: PublicGroupDetailResponse,
  myUserId: number,
): PublicRoomDetail {
  return {
    roomId: detail.groupId,
    name: detail.name,
    categoryLabel: categoryLabel(detail.category),
    memberCount: detail.memberCount,
    intro: detail.description ?? "",
    ownerNickname: detail.owner.nickname,
    ownerImageUrl: detail.owner.profileImageUrl,
    weeklyAverageSec: detail.weeklyAverageFocusSec,
    members: detail.members.map((desk) => toRoomDeskMember(desk, myUserId)),
  };
}

/**
 * 이번 주 순위
 *
 * 이번 주 순공이 많은 순이고 같으면 같은 순위를 주고 다음 순위는 그 수만큼 건너뛴다.
 * 같은 값끼리는 받은 순서를 지켜야 다시 받을 때마다 줄이 자리를 바꾸지 않는다.
 * 쌓이는 중인지는 그대로 넘기고 1초씩 올리며 위 줄에서 멈추는 일은 화면의 `liveRankSeconds`가 맡는다.
 */
export function weeklyRanks(
  members: readonly GroupMemberDesk[],
  myUserId: number,
): WeeklyRankRow[] {
  const sorted = [...members].sort((a, b) => b.weekFocusSec - a.weekFocusSec);
  const rows: WeeklyRankRow[] = [];
  for (const [index, desk] of sorted.entries()) {
    const previous = rows.at(-1);
    rows.push({
      userId: desk.userId,
      rank:
        previous !== undefined && previous.weeklyStudySec === desk.weekFocusSec
          ? previous.rank
          : index + 1,
      nickname: desk.nickname,
      weeklyStudySec: desk.weekFocusSec,
      accumulating: desk.accumulating,
      isMe: desk.userId === myUserId,
      imageUrl: desk.profileImageUrl,
    });
  }
  return rows;
}

/**
 * 그룹 홈
 *
 * 새 신청 수는 공개 그룹의 그룹장에게만 오므로 그 밖에는 0으로 본다.
 * 소개가 없으면 그룹 설정의 소개 칸을 빈 글로 채운다.
 */
export function toRoomHome(home: GroupHomeResponse, myUserId: number): RoomHome {
  return {
    roomId: home.groupId,
    name: home.name,
    categoryLabel: categoryLabel(home.category),
    visibility: toRoomVisibility(home.visibility),
    role: toRoomRole(home.myRole),
    memberCount: home.memberCount,
    intro: home.description ?? "",
    members: home.members.map((desk) => toRoomDeskMember(desk, myUserId)),
    weeklyRanks: weeklyRanks(home.members, myUserId),
    newRequestCount: home.newApplicationCount ?? 0,
    notifyOn: home.notifyEnabled,
  };
}

export function toRoomMemberRow(item: GroupMemberItem, myUserId: number): RoomMemberRow {
  return {
    userId: item.userId,
    nickname: item.nickname,
    isOwner: item.owner,
    isMe: item.userId === myUserId,
    lastStudiedAt: item.lastStudiedAt,
    imageUrl: item.profileImageUrl,
  };
}

export function toApplicationRequest(item: GroupApplicationItem): ApplicationRequest {
  return {
    applicationId: item.applicationId,
    nickname: item.nickname,
    appliedAt: item.appliedAt,
    expiresAt: item.expiresAt,
    message: item.introduction,
    imageUrl: item.profileImageUrl,
  };
}

export function toBlockedUserRow(item: BlockedUserResponse): BlockedUser {
  return {
    userId: item.userId,
    nickname: item.nickname,
    imageUrl: item.profileImageUrl,
  };
}
