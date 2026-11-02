import type { DeskMember } from "./model/desks";
import type { ApplyBlockReason } from "./model/limits";
import type { RoomRole, RoomVisibility } from "./model/roomMenu";

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
  weeklyAverageSec: number;
  members: RoomDeskMember[];
}

export interface ApplicationRequest {
  applicationId: number;
  nickname: string;
  appliedAt: string;
  expiresAt: string;
  message: string;
}

export interface WeeklyRankRow {
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
  members: RoomDeskMember[];
  weeklyRanks: WeeklyRankRow[];
  newRequestCount: number;
  notifyOn: boolean;
}

export interface RoomMemberRow {
  userId: number;
  nickname: string;
  isOwner: boolean;
  isMe: boolean;
  lastStudiedAt: string | null;
}

export interface BlockedUser {
  userId: number;
  nickname: string;
}

export interface RoomFormValues {
  name: string;
  visibility: RoomVisibility;
  category: string;
  intro: string;
}
