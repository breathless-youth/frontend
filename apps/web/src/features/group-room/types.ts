import type { DeskMember } from "./model/desks";
import type { ApplyBlockReason } from "./model/limits";
import type { RoomRole, RoomVisibility } from "./model/roomMenu";

export type SocialTab = "mine" | "public";

/** 시험·목표 칩 하나. 서버 값과 화면 글자가 다를 수 있어 둘을 따로 받는다. */
export interface CategoryOption {
  value: string;
  label: string;
}

/**
 * 책상에 앉히는 멤버
 *
 * 지금 보는 사람의 책상은 닉네임 대신 `나`로 그려서 판단 모듈의 멤버에 그 표시만 더한다.
 */
export interface RoomDeskMember extends DeskMember {
  isMe: boolean;
}

export interface MyRoomSummary {
  roomId: number;
  name: string;
  categoryLabel: string;
  visibility: RoomVisibility;
  memberCount: number;
  members: RoomDeskMember[];
}

export interface PendingApplication {
  applicationId: number;
  roomId: number;
  roomName: string;
  categoryLabel: string;
  expiresAt: string;
}

export interface PublicRoomSummary {
  roomId: number;
  name: string;
  categoryLabel: string;
  memberCount: number;
  weeklyAverageSec: number;
  studyingCount: number;
}

export type ApplyState =
  | { kind: "can_apply" }
  | { kind: "applied" }
  | { kind: "full" }
  | { kind: "blocked"; reason: ApplyBlockReason };

export interface PublicRoomDetail {
  roomId: number;
  name: string;
  categoryLabel: string;
  memberCount: number;
  intro: string;
  ownerNickname: string;
  /** 그룹장 아바타의 프로필 사진이고, 없거나 받지 못하면 닉네임 첫 글자를 그린다. */
  ownerImageUrl?: string | null;
  weeklyAverageSec: number;
  members: RoomDeskMember[];
}

/**
 * 아바타와 함께 그리는 사람의 프로필 사진
 *
 * 사진이 없거나 받지 못하면 아바타가 닉네임 첫 글자를 그린다.
 */
interface ProfilePhoto {
  imageUrl?: string | null;
}

export interface ApplicationRequest extends ProfilePhoto {
  applicationId: number;
  nickname: string;
  appliedAt: string;
  expiresAt: string;
  message: string;
}

export interface WeeklyRankRow extends ProfilePhoto {
  userId: number;
  rank: number;
  nickname: string;
  weeklyStudySec: number;
  accumulating: boolean;
  isMe: boolean;
}

export interface RoomHome {
  roomId: number;
  name: string;
  categoryLabel: string;
  visibility: RoomVisibility;
  role: RoomRole;
  memberCount: number;
  /** 그룹 홈 메뉴에서 여는 그룹 설정을 지금 소개로 채운다. */
  intro: string;
  members: RoomDeskMember[];
  weeklyRanks: WeeklyRankRow[];
  newRequestCount: number;
  notifyOn: boolean;
}

export interface RoomMemberRow extends ProfilePhoto {
  userId: number;
  nickname: string;
  isOwner: boolean;
  isMe: boolean;
  lastStudiedAt: string | null;
}

export interface BlockedUser extends ProfilePhoto {
  userId: number;
  nickname: string;
}

export interface RoomFormValues {
  name: string;
  visibility: RoomVisibility;
  category: string;
  intro: string;
}
