import { countGraphemes } from "@/lib/graphemes";

/** 그룹 개수, 기간, 글자 수의 한도. */
export const GROUP_ROOM_LIMITS = {
  maxMembers: 6,
  maxRoomsAndApplications: 5,
  maxPendingApplications: 3,
  maxOwnedRooms: 2,
  kickCooldownDays: 3,
  applicationTtlDays: 3,
  roomNameMax: 20,
  roomIntroMax: 500,
  applicationMessageMax: 50,
  reportReasonMax: 100,
} as const;

export type ApplyBlockReason =
  "kicked_recently" | "rooms_and_applications_full" | "pending_applications_full";

const APPLY_BLOCK_COPY: Record<ApplyBlockReason, string> = {
  kicked_recently: `${GROUP_ROOM_LIMITS.kickCooldownDays}일 동안 이 그룹에 신청할 수 없어요`,
  rooms_and_applications_full: "그룹 개수가 가득 찼어요",
  pending_applications_full: "신청은 3곳까지 보낼 수 있어요",
};

/**
 * 공개 그룹에 신청할 수 없는 이유의 문장
 *
 * 흐려진 신청 버튼의 글자를 이 문장으로 바꿔 왜 누를 수 없는지 알린다.
 */
export function applyBlockCopy(reason: ApplyBlockReason): string {
  return APPLY_BLOCK_COPY[reason];
}

export type JoinBlockReason =
  "room_full" | "kicked_recently" | "rooms_and_applications_full" | "invalid_code";

const JOIN_BLOCK_COPY: Record<JoinBlockReason, string> = {
  room_full: "자리가 다 찼어요",
  kicked_recently: `내보내진 그룹에는 ${GROUP_ROOM_LIMITS.kickCooldownDays}일 동안 다시 들어갈 수 없어요`,
  rooms_and_applications_full: "이미 5개의 그룹을 가지고 있어요",
  invalid_code: "초대코드를 다시 확인해 주세요",
};

/**
 * 초대코드로 들어갈 수 없는 이유의 문장
 *
 * 코드 입력칸 아래에 이 한 문장만 보여 준다.
 * 내보낸 뒤 코드가 새로 바뀌므로 예전 코드를 넣은 사람도 `invalid_code` 문장을 본다.
 */
export function joinBlockCopy(reason: JoinBlockReason): string {
  return JOIN_BLOCK_COPY[reason];
}

/** 그룹장인 그룹이 이미 2개여서 그룹 만들기가 흐려졌을 때 그 아래에 보이는 문장. */
export const CREATE_ROOM_LIMIT_COPY = "그룹은 2개까지 만들 수 있어요";

export function canCreateRoom(ownedRoomCount: number): boolean {
  return ownedRoomCount < GROUP_ROOM_LIMITS.maxOwnedRooms;
}

/**
 * 내 그룹 탭 이름 옆 숫자
 *
 * 들어간 그룹과 답을 기다리는 신청이 같은 5개 한도를 함께 쓰므로 둘을 합쳐 보여 준다.
 */
export function myRoomsTabCount(joinedCount: number, pendingCount: number): string {
  return `${joinedCount + pendingCount}/${GROUP_ROOM_LIMITS.maxRoomsAndApplications}`;
}

export function memberCountText(memberCount: number): string {
  return `멤버 ${memberCount}/${GROUP_ROOM_LIMITS.maxMembers}`;
}

export function remainingSeats(memberCount: number): number {
  return Math.max(0, GROUP_ROOM_LIMITS.maxMembers - memberCount);
}

export function isRoomFull(memberCount: number): boolean {
  return memberCount >= GROUP_ROOM_LIMITS.maxMembers;
}

/**
 * 그룹 글 글자 수
 *
 * 서버와 같은 방식으로 세야 한도 끝에서 화면과 서버의 판정이 어긋나지 않는다.
 * 그래서 NFC로 맞추고 앞뒤 공백을 뺀 뒤 이모지 조합을 한 글자로 센다.
 * 글자 수 표시도 이 값을 써야 끝에 붙은 공백 때문에 한도를 넘은 것처럼 보이지 않는다.
 */
export function countGroupText(text: string): number {
  return countGraphemes(text.normalize("NFC").trim());
}
