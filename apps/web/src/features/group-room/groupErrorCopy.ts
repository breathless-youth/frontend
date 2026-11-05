import { ApiError } from "@/lib/api";
import i18n from "@/lib/i18n";

import { contactBlockedCopy } from "./model/contactCheck";
import { applyBlockCopy, joinBlockCopy } from "./model/limits";
import { nameTakenCopy } from "./model/nameCheck";

/**
 * 그룹 API 오류를 화면 문구로 바꾸는 표
 *
 * 문구는 서버 `message`가 아니라 `code`로만 고른다.
 * 정한 문장은 판단 모듈의 함수에서 가져와 같은 문장을 두 곳에서 따로 쓰지 않는다.
 * 표에 없는 조합은 모두 다시 시도 문구다.
 * 표에는 문장 대신 문장을 만드는 함수를 둔다.
 * 문장을 모듈 상수로 만들면 불러온 시점의 언어에서 바뀌지 않기 때문이다.
 */

/** 오류가 난 사용자 동작 */
export type GroupAction =
  | "join_code"
  | "join_public"
  | "apply"
  | "create"
  | "update"
  | "answer"
  | "cancel_application"
  | "leave"
  | "kick"
  | "transfer"
  | "regenerate_invite"
  | "report"
  | "unblock"
  | "notify"
  | "load";

export function groupRetryCopy(): string {
  return i18n.t("common:errors.retryLater");
}

export function groupNotFoundCopy(): string {
  return i18n.t("group-room:groupError.notFound");
}

export function notGroupMemberCopy(): string {
  return i18n.t("group-room:groupError.notMember");
}

/** 신청 중 시트와 공개 그룹 보기에서 신청을 취소한 뒤 띄우는 토스트 문장 */
export function applicationCanceledCopy(): string {
  return i18n.t("group-room:groupError.applicationCanceled");
}

type CopyOf = () => string;

const invalidCodeCopy: CopyOf = () => joinBlockCopy("invalid_code");
const roomFullCopy: CopyOf = () => joinBlockCopy("room_full");
const groupCountFullCopy: CopyOf = () => applyBlockCopy("rooms_and_applications_full");

// 서버가 보낸 코드를 그대로 열쇠로 쓰므로 객체 속성과 겹치지 않게 Map에 둔다.
const COPY_BY_ACTION: Partial<Record<GroupAction, ReadonlyMap<string, CopyOf>>> = {
  join_code: new Map([
    ["INVITE_CODE_NOT_FOUND", invalidCodeCopy],
    ["VALIDATION_FAILED", invalidCodeCopy],
    ["BAD_REQUEST", invalidCodeCopy],
    ["GROUP_FULL", roomFullCopy],
    ["RECENTLY_KICKED", () => joinBlockCopy("kicked_recently")],
    ["GROUP_SLOT_LIMIT", () => joinBlockCopy("rooms_and_applications_full")],
  ]),
  join_public: new Map([
    ["GROUP_FULL", roomFullCopy],
    ["RECENTLY_KICKED", () => joinBlockCopy("kicked_recently")],
    ["GROUP_SLOT_LIMIT", groupCountFullCopy],
    ["GROUP_JOIN_APPROVAL_REQUIRED", () => i18n.t("group-room:joinPolicy.approvalRequiredError")],
  ]),
  apply: new Map([
    ["GROUP_JOIN_OPEN", () => i18n.t("group-room:joinPolicy.openError")],
    ["GROUP_SLOT_LIMIT", groupCountFullCopy],
    ["APPLICATION_LIMIT", () => applyBlockCopy("pending_applications_full")],
    ["RECENTLY_KICKED", () => applyBlockCopy("kicked_recently")],
    ["GROUP_FULL", roomFullCopy],
    ["CONTACT_NOT_ALLOWED", contactBlockedCopy],
  ]),
  answer: new Map([["GROUP_FULL", roomFullCopy]]),
  create: new Map([
    ["CONTACT_NOT_ALLOWED", contactBlockedCopy],
    ["GROUP_NAME_TAKEN", nameTakenCopy],
    // 5개 한도는 답을 기다리는 신청도 세므로 신청하기와 같은 문장을 쓴다.
    ["GROUP_SLOT_LIMIT", groupCountFullCopy],
  ]),
  update: new Map([
    ["CONTACT_NOT_ALLOWED", contactBlockedCopy],
    ["GROUP_NAME_TAKEN", nameTakenCopy],
  ]),
};

// 그룹이 사라졌거나 멤버가 아니라는 답은 어느 동작에서 받아도 뜻이 같다.
const COPY_FOR_ANY_ACTION: ReadonlyMap<string, CopyOf> = new Map([
  ["GROUP_NOT_FOUND", groupNotFoundCopy],
  ["NOT_GROUP_MEMBER", notGroupMemberCopy],
]);

const QUIET_CONFLICT_CODES: ReadonlySet<string> = new Set([
  "ALREADY_APPLIED",
  "ALREADY_MEMBER",
  "APPLICATION_NOT_PENDING",
]);

export function groupErrorCode(error: unknown): string | null {
  return error instanceof ApiError ? (error.code ?? null) : null;
}

export function groupErrorCopy(action: GroupAction, error: unknown): string {
  const code = groupErrorCode(error);
  const copyOf =
    code === null
      ? undefined
      : (COPY_BY_ACTION[action]?.get(code) ?? COPY_FOR_ANY_ACTION.get(code));
  return copyOf === undefined ? groupRetryCopy() : copyOf();
}

/**
 * 그룹이 사라졌거나 내가 멤버가 아니라는 오류
 *
 * 그룹 화면에서 이 오류를 받으면 오류 화면에 머물지 않고 그룹 탭으로 돌아가야 한다.
 */
export function isGroupGoneError(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return false;
  }
  return (
    (error.status === 403 && error.code === "NOT_GROUP_MEMBER") ||
    (error.status === 404 && error.code === "GROUP_NOT_FOUND")
  );
}

/**
 * 알릴 필요 없는 충돌
 *
 * 이미 신청했거나 들어갔거나 처리된 신청이라 문구 없이 다시 받으면 지금 상태가 보인다.
 */
export function isQuietGroupConflict(error: unknown): boolean {
  const code = groupErrorCode(error);
  return code !== null && QUIET_CONFLICT_CODES.has(code);
}

/**
 * 신청에 답하거나 신청을 취소하고 신고할 때 알릴 필요 없는 실패
 *
 * 그사이 처리된 신청의 충돌에 더해, 그사이 없어진 신청은 404 `NOT_FOUND`로 오고 다시 받으면 목록에서 빠져 있다.
 * 다시 시도해도 같은 답이라 다시 시도 문구 대신 다시 받은 목록으로 알린다.
 */
export function isQuietApplicationError(error: unknown): boolean {
  return isQuietGroupConflict(error) || groupErrorCode(error) === "NOT_FOUND";
}
