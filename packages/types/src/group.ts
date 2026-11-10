import type { IceServer } from "./index";

/**
 * 그룹 공부방 REST 요청·응답 타입
 *
 * 이름과 필드는 dev 백엔드 Swagger(`/v3/api-docs`)의 스키마와 대조해 그대로 따랐다(2026-11-03).
 * Swagger는 null이 올 수 있는 필드에 nullable 표시 없이 설명에만 null을 적어서, 설명에 null이 있는 필드만 `| null`로 둔다.
 * 응답 스키마에는 required가 없지만 설명에 있는 필드는 늘 온다고 보고 필수로 둔다.
 * 시각은 UTC ISO-8601이고 순공은 초 단위다.
 */

/** 시험·목표 9개: 그룹 스키마의 `category`와 프로필 수정 요청의 `category`가 같은 값을 쓴다. */
export type StudyCategory =
  | "CSAT"
  | "SCHOOL_EXAM"
  | "UNIVERSITY_EXAM"
  | "CIVIL_SERVICE"
  | "CERTIFICATE"
  | "LANGUAGE"
  | "JOB"
  | "PROFESSIONAL"
  | "ETC";

/** 공개 여부: `visibility`, 만든 뒤에는 바꿀 수 없다. */
export type GroupVisibility = "PUBLIC" | "PRIVATE";

/** Public group membership policy from the backend Swagger. */
export type GroupJoinPolicy = "APPROVAL" | "OPEN";

/** 내 역할: `GroupHomeResponse.myRole` */
export type GroupRole = "OWNER" | "MEMBER";

/** 멤버 책상의 지금 상태: `IN_ROOM`은 카메라를 껐거나 휴식 중이어도 이 그룹 공부방에 있는 것이다. */
export type GroupMemberStatus = "IN_ROOM" | "STUDYING" | "PAUSED" | "IDLE";

/** 초대코드로 들어온 경로: `GroupJoinRequest.via`, 분석에만 쓰이고 들어오는 규칙은 같다. */
export type GroupJoinVia = "LINK" | "CODE";

/** 공개 그룹 보기에서 내가 할 수 있는 것: `MEMBER`, `APPLIED`, `FULL`, `UNAVAILABLE`, `CAN_APPLY` 순으로 먼저 맞는 하나가 온다. */
export type GroupApplyState = "CAN_APPLY" | "APPLIED" | "MEMBER" | "FULL" | "UNAVAILABLE";

/** 신청할 수 없는 이유: `RECENTLY_KICKED`, `GROUP_SLOT_LIMIT`, `APPLICATION_LIMIT` 순으로 먼저 맞는 하나가 온다. */
export type GroupUnavailableReason = "RECENTLY_KICKED" | "GROUP_SLOT_LIMIT" | "APPLICATION_LIMIT";

/** `GroupMemberDesk`: `GET /api/groups/me`, `GET /api/groups/{groupId}`, `GET /api/groups/public/{groupId}`의 멤버 책상 */
export interface GroupMemberDesk {
  userId: number;
  nickname: string;
  profileImageUrl: string | null;
  owner: boolean;
  status: GroupMemberStatus;
  /** 응답을 받은 뒤로는 FE가 순공을 1초씩 올린다. */
  accumulating: boolean;
  /** 앱 전체 오늘 순공이고 오늘은 KST 날짜로 센다. */
  todayFocusSec: number;
  /**
   * 앱 전체 이번 주 순공이고 월요일 0시 KST부터 센다.
   * 그룹 안 순위는 이 값으로 FE가 정한다.
   */
  weekFocusSec: number;
  lastStudiedAt: string | null;
}

/** `GroupLimits`: `GET /api/groups/me`의 한도 */
export interface GroupLimits {
  /** 들어간 그룹과 답을 기다리는 신청이 함께 쓰는 한도 */
  maxGroupsAndApplications: number;
  maxPendingApplications: number;
  /** 쓰지 않는다. 그룹장 한도가 없어졌고 이미 배포된 웹을 위해 서버가 남겨 둔 값이다. */
  maxOwnedGroups: number;
}

/** `GroupTranslation.language`: 서버가 번역한 언어 */
export type GroupTranslationLanguage = "ko" | "en" | "ja" | "zh-TW";

/**
 * `GroupTranslation`: 그룹 조회 4개의 번역
 *
 * 이름과 소개가 따로 번역돼서 한쪽만 null일 수 있고, 둘 다 없으면 객체가 null이다.
 * 번역이 꺼져 있거나 무료량이 끝나도 응답은 정상이고 이 값만 null이다.
 */
export interface GroupTranslation {
  language: GroupTranslationLanguage;
  name: string | null;
  /** 목록 응답은 소개를 번역하지 않아 늘 null이다. */
  description: string | null;
}

/** `MyGroupCard`: `GET /api/groups/me`의 그룹 카드 */
export interface MyGroupCard {
  joinPolicy: GroupJoinPolicy;
  groupId: number;
  name: string;
  category: StudyCategory;
  visibility: GroupVisibility;
  memberCount: number;
  /** 책상 상태가 `IN_ROOM`이거나 `STUDYING`인 멤버 수 */
  studyingCount: number;
  /** 내가 이 그룹의 그룹장이면 true */
  owner: boolean;
  /** 답을 기다리는 새 신청 수이고 APPROVAL 공개 그룹 그룹장에게만 값이 있다. */
  newApplicationCount: number | null;
  /**
   * 들어간 순서다.
   * 책상 순서는 FE가 정한다.
   */
  members: GroupMemberDesk[];
  translation: GroupTranslation | null;
}

/** `MyGroupsResponse`: `GET /api/groups/me` */
export interface MyGroupsResponse {
  /** 들어간 순서 */
  groups: MyGroupCard[];
  pendingApplicationCount: number;
  /** 한도 판단에 쓰지 않는다. 이미 배포된 웹이 읽어서 서버가 남겨 둔 값이다. */
  ownedGroupCount: number;
  limits: GroupLimits;
}

/** `GroupHomeResponse`: `GET /api/groups/{groupId}` */
export interface GroupHomeResponse {
  joinPolicy: GroupJoinPolicy;
  groupId: number;
  name: string;
  visibility: GroupVisibility;
  category: StudyCategory;
  description: string | null;
  memberCount: number;
  myRole: GroupRole;
  notifyEnabled: boolean;
  /** APPROVAL 공개 그룹의 그룹장에게만 값이 있다. */
  newApplicationCount: number | null;
  studyingCount: number;
  /** 들어간 순서 */
  members: GroupMemberDesk[];
  translation: GroupTranslation | null;
}

/** `PublicGroupCard`: `GET /api/groups/public`의 그룹 카드 */
export interface PublicGroupCard {
  joinPolicy: GroupJoinPolicy;
  groupId: number;
  name: string;
  category: StudyCategory;
  /** 6이면 다 찬 그룹이다. */
  memberCount: number;
  /** 지금 멤버들의 이번 주 순공 합을 멤버 수로 나눈 값 */
  weeklyAverageFocusSec: number;
  /** 지금 멤버들의 이번 주(월요일 0시 KST부터) 앱 전체 순공 합 */
  weeklyTotalFocusSec: number;
  studyingCount: number;
  /** 내가 이 그룹의 멤버면 true */
  member: boolean;
  translation: GroupTranslation | null;
}

/** `PublicGroupPageResponse`: `GET /api/groups/public` */
export interface PublicGroupPageResponse {
  /** 쪽마다 순서가 바뀔 수 있어 같은 그룹이 다음 쪽에 다시 올 수 있다. */
  groups: PublicGroupCard[];
  hasNext: boolean;
}

/** `GroupOwnerProfile`: `GET /api/groups/public/{groupId}`의 그룹장 */
export interface GroupOwnerProfile {
  userId: number;
  nickname: string;
  profileImageUrl: string | null;
}

/** `PendingApplicationRef`: `GET /api/groups/public/{groupId}`의 답을 기다리는 내 신청 */
export interface PendingApplicationRef {
  applicationId: number;
  /** 신청하고 3일 뒤다. */
  expiresAt: string;
}

/** `PublicGroupDetailResponse`: `GET /api/groups/public/{groupId}` */
export interface PublicGroupDetailResponse {
  joinPolicy: GroupJoinPolicy;
  groupId: number;
  name: string;
  category: StudyCategory;
  description: string | null;
  memberCount: number;
  owner: GroupOwnerProfile;
  weeklyAverageFocusSec: number;
  /** 지금 멤버들의 이번 주(월요일 0시 KST부터) 앱 전체 순공 합 */
  weeklyTotalFocusSec: number;
  /** 들어간 순서 */
  members: GroupMemberDesk[];
  applyState: GroupApplyState;
  /** `applyState`가 `UNAVAILABLE`일 때만 값이 있다. */
  unavailableReason: GroupUnavailableReason | null;
  /** `applyState`가 `APPLIED`일 때만 값이 있다. */
  application: PendingApplicationRef | null;
  translation: GroupTranslation | null;
}

/** `GroupCreateRequest`: `POST /api/groups` */
export interface GroupCreateRequest {
  joinPolicy?: GroupJoinPolicy | null;
  name: string;
  visibility: GroupVisibility;
  category: StudyCategory;
  description?: string;
}

/** `GroupCreateResponse`: `POST /api/groups` */
export interface GroupCreateResponse {
  groupId: number;
}

/** `GroupUpdateRequest`: `PATCH /api/groups/{groupId}` */
export interface GroupUpdateRequest {
  joinPolicy?: GroupJoinPolicy | null;
  name: string;
  category: StudyCategory;
  /** 전체 교체라 빼거나 비우면 소개가 없어진다. */
  description?: string;
}

/** `GroupNotificationRequest`: `PUT /api/groups/{groupId}/notifications` */
export interface GroupNotificationRequest {
  enabled: boolean;
}

/** `GroupOwnerTransferRequest`: `PUT /api/groups/{groupId}/owner` */
export interface GroupOwnerTransferRequest {
  userId: number;
}

/** `GroupMemberItem`: `GET /api/groups/{groupId}/members`의 멤버 */
export interface GroupMemberItem {
  userId: number;
  nickname: string;
  profileImageUrl: string | null;
  owner: boolean;
  joinedAt: string;
  lastStudiedAt: string | null;
}

/** `GroupMembersResponse`: `GET /api/groups/{groupId}/members` */
export interface GroupMembersResponse {
  /** 들어간 순서 */
  members: GroupMemberItem[];
}

/** `GroupInviteResponse`: `GET`·`POST /api/groups/{groupId}/invite` */
export interface GroupInviteResponse {
  inviteCode: string;
}

/** `GroupJoinRequest`: `POST /api/groups/join` */
export interface GroupJoinRequest {
  inviteCode: string;
  via: GroupJoinVia;
}

/** `GroupJoinResponse`: `POST /api/groups/join`, `POST /api/groups/{groupId}/members` */
export interface GroupJoinResponse {
  groupId: number;
  /** 이미 멤버였으면 false이고 이때도 응답은 200이다. */
  joined: boolean;
}

/** `GroupApplicationCreateRequest`: `POST /api/groups/{groupId}/applications` */
export interface GroupApplicationCreateRequest {
  introduction: string;
}

/** `GroupApplicationCreateResponse`: `POST /api/groups/{groupId}/applications` */
export interface GroupApplicationCreateResponse {
  applicationId: number;
  expiresAt: string;
}

/** `GroupApplicationItem`: `GET /api/groups/{groupId}/applications`의 신청 */
export interface GroupApplicationItem {
  applicationId: number;
  userId: number;
  nickname: string;
  profileImageUrl: string | null;
  introduction: string;
  appliedAt: string;
  expiresAt: string;
}

/** `GroupApplicationsResponse`: `GET /api/groups/{groupId}/applications` */
export interface GroupApplicationsResponse {
  /** 0이면 수락할 수 없다. */
  remainingSeats: number;
  /** 신청한 순서이고 오래된 것이 앞이다. */
  applications: GroupApplicationItem[];
}

/** `MyApplicationItem`: `GET /api/group-applications/me`의 신청 */
export interface MyApplicationItem {
  applicationId: number;
  groupId: number;
  groupName: string;
  category: StudyCategory;
  appliedAt: string;
  expiresAt: string;
}

/** `MyApplicationsResponse`: `GET /api/group-applications/me` */
export interface MyApplicationsResponse {
  /** 신청한 순서이고 오래된 것이 앞이다. */
  applications: MyApplicationItem[];
}

/** `ReportRequest`: `POST /api/group-applications/{applicationId}/report`, `POST /api/groups/{groupId}/members/{userId}/report` */
export interface ReportRequest {
  /** 사유는 쓰지 않아도 되지만 본문은 꼭 보내야 해서 사유가 없으면 `{}`를 보낸다. */
  reason?: string;
}

/** `BlockedUser`: `GET /api/blocks`의 차단한 사람 */
export interface BlockedUser {
  userId: number;
  nickname: string;
  profileImageUrl: string | null;
  blockedAt: string;
}

/** `BlockListResponse`: `GET /api/blocks` */
export interface BlockListResponse {
  /** 차단한 순서이고 오래된 것이 앞이다. */
  blockedUsers: BlockedUser[];
}

/** `GroupRoomJoinResponse`: `POST /api/groups/{groupId}/room/join` */
export interface GroupRoomJoinResponse {
  roomId: number;
  graceRejoin: boolean;
  /** `graceRejoin`이 true일 때만 이전 값이 있다. */
  cameraOn: boolean | null;
  /** `graceRejoin`이 true일 때만 이전 값이 있다. */
  micOn: boolean | null;
  /** `graceRejoin`이 true일 때만 이전 값이 있다. */
  onBreak: boolean | null;
  iceServers: IceServer[];
  iceTtlSeconds: number;
}
