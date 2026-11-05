import { countGraphemes, normalizeServerText } from "@/lib/graphemes";
import i18n from "@/lib/i18n";

/** 그룹 개수, 기간, 글자 수의 한도. */
export const GROUP_ROOM_LIMITS = {
  maxMembers: 6,
  maxRoomsAndApplications: 5,
  maxPendingApplications: 3,
  kickCooldownDays: 3,
  applicationTtlDays: 3,
  roomNameMax: 20,
  roomIntroMax: 500,
  applicationMessageMax: 50,
  reportReasonMax: 100,
} as const;

export type ApplyBlockReason =
  "kicked_recently" | "rooms_and_applications_full" | "pending_applications_full";

const APPLY_BLOCK_KEYS = {
  kicked_recently: "group-room:limits.applyBlock.kickedRecently",
  rooms_and_applications_full: "group-room:limits.applyBlock.roomsAndApplicationsFull",
  pending_applications_full: "group-room:limits.applyBlock.pendingApplicationsFull",
} as const satisfies Record<ApplyBlockReason, string>;

/**
 * 공개 그룹에 신청할 수 없는 이유의 문장
 *
 * 흐려진 신청 버튼의 글자를 이 문장으로 바꿔 왜 누를 수 없는지 알린다.
 * 일수는 내보내진 경우의 문장만 쓰고 다른 문장은 넘긴 `count`를 쓰지 않는다.
 */
export function applyBlockCopy(reason: ApplyBlockReason): string {
  return i18n.t(APPLY_BLOCK_KEYS[reason], { count: GROUP_ROOM_LIMITS.kickCooldownDays });
}

export type JoinBlockReason =
  "room_full" | "kicked_recently" | "rooms_and_applications_full" | "invalid_code";

const JOIN_BLOCK_KEYS = {
  room_full: "group-room:limits.joinBlock.roomFull",
  kicked_recently: "group-room:limits.joinBlock.kickedRecently",
  rooms_and_applications_full: "group-room:limits.joinBlock.roomsAndApplicationsFull",
  invalid_code: "group-room:limits.joinBlock.invalidCode",
} as const satisfies Record<JoinBlockReason, string>;

/**
 * 초대코드로 들어갈 수 없는 이유의 문장
 *
 * 코드 입력칸 아래에 이 한 문장만 보여 준다.
 * 내보낸 뒤 코드가 새로 바뀌므로 예전 코드를 넣은 사람도 `invalid_code` 문장을 본다.
 * 일수는 내보내진 경우의 문장만 쓰고 다른 문장은 넘긴 `count`를 쓰지 않는다.
 */
export function joinBlockCopy(reason: JoinBlockReason): string {
  return i18n.t(JOIN_BLOCK_KEYS[reason], { count: GROUP_ROOM_LIMITS.kickCooldownDays });
}

/** 그룹과 신청이 이미 5개여서 그룹 만들기가 흐려졌을 때 그 아래에 보이는 문장. */
export function createRoomLimitCopy(): string {
  return joinBlockCopy("rooms_and_applications_full");
}

export function canCreateRoom(joinedCount: number, pendingCount: number): boolean {
  return joinedCount + pendingCount < GROUP_ROOM_LIMITS.maxRoomsAndApplications;
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
  return i18n.t("group-room:limits.memberCount", {
    count: memberCount,
    max: GROUP_ROOM_LIMITS.maxMembers,
  });
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
 * 그래서 NFC로 맞추고 서버 strip()이 빼는 앞뒤 공백만 뺀 뒤 이모지 조합을 한 글자로 센다.
 * 글자 수 표시도 이 값을 써야 끝에 붙은 공백 때문에 한도를 넘은 것처럼 보이지 않는다.
 */
export function countGroupText(text: string): number {
  return countGraphemes(normalizeServerText(text));
}
