import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";

import {
  applicationCanceledCopy,
  groupErrorCode,
  groupErrorCopy,
  groupNotFoundCopy,
  groupRetryCopy,
  isGroupGoneError,
  isQuietApplicationError,
  isQuietGroupConflict,
  notGroupMemberCopy,
} from "../groupErrorCopy";

const api = (status: number, code?: string) => new ApiError("x", status, code);

describe("groupErrorCopy", () => {
  it.each([
    ["join_code", api(404, "INVITE_CODE_NOT_FOUND"), "초대코드를 다시 확인해 주세요"],
    ["join_code", api(400, "VALIDATION_FAILED"), "초대코드를 다시 확인해 주세요"],
    ["join_code", api(400, "BAD_REQUEST"), "초대코드를 다시 확인해 주세요"],
    ["join_code", api(409, "GROUP_FULL"), "자리가 다 찼어요"],
    ["join_code", api(409, "RECENTLY_KICKED"), "내보내진 그룹에는 3일 동안 다시 들어갈 수 없어요"],
    ["join_code", api(409, "GROUP_SLOT_LIMIT"), "그룹과 신청을 합쳐 5개까지예요"],
    ["apply", api(409, "GROUP_SLOT_LIMIT"), "그룹과 신청을 합쳐 5개까지예요"],
    ["apply", api(409, "APPLICATION_LIMIT"), "신청은 3곳까지 보낼 수 있어요"],
    ["apply", api(409, "RECENTLY_KICKED"), "3일 동안 이 그룹에 신청할 수 없어요"],
    ["apply", api(409, "GROUP_FULL"), "자리가 다 찼어요"],
    ["apply", api(400, "CONTACT_NOT_ALLOWED"), "연락처나 링크는 보낼 수 없어요"],
    ["create", api(400, "CONTACT_NOT_ALLOWED"), "연락처나 링크는 보낼 수 없어요"],
    ["update", api(400, "CONTACT_NOT_ALLOWED"), "연락처나 링크는 보낼 수 없어요"],
    // 5개 한도는 답을 기다리는 신청도 세어서 신청하기와 같은 문장을 쓴다.
    ["create", api(409, "GROUP_SLOT_LIMIT"), "그룹과 신청을 합쳐 5개까지예요"],
    ["answer", api(409, "GROUP_FULL"), "자리가 다 찼어요"],
    ["load", api(404, "GROUP_NOT_FOUND"), "그룹을 찾을 수 없어요"],
    ["kick", api(404, "GROUP_NOT_FOUND"), "그룹을 찾을 수 없어요"],
    ["load", api(403, "NOT_GROUP_MEMBER"), "이 그룹의 멤버가 아니에요"],
    ["kick", api(501, "NOT_IMPLEMENTED"), "잠시 후 다시 시도해 주세요"],
    ["update", api(409, "GROUP_SLOT_LIMIT"), "잠시 후 다시 시도해 주세요"],
    ["leave", api(409, "GROUP_FULL"), "잠시 후 다시 시도해 주세요"],
    ["join_code", new TypeError("Failed to fetch"), "잠시 후 다시 시도해 주세요"],
  ] as const)("%s의 %o는 정한 문구다", (action, error, copy) => {
    expect(groupErrorCopy(action, error)).toBe(copy);
  });

  it("서버가 보낸 message는 화면에 쓰지 않는다", () => {
    expect(groupErrorCopy("apply", new ApiError("서버가 보낸 문장", 409))).toBe(groupRetryCopy());
    expect(groupErrorCopy("apply", new ApiError("서버가 보낸 문장", 409, "CONFLICT"))).toBe(
      groupRetryCopy(),
    );
  });

  it("오류 코드는 ApiError의 code만 읽는다", () => {
    expect(groupErrorCode(api(409, "GROUP_FULL"))).toBe("GROUP_FULL");
    expect(groupErrorCode(api(500))).toBeNull();
    expect(groupErrorCode(new TypeError("Failed to fetch"))).toBeNull();
  });

  it("사라진 그룹과 알릴 필요 없는 충돌을 구분한다", () => {
    expect(isGroupGoneError(api(403, "NOT_GROUP_MEMBER"))).toBe(true);
    expect(isGroupGoneError(api(404, "GROUP_NOT_FOUND"))).toBe(true);
    expect(isGroupGoneError(api(403, "NOT_GROUP_OWNER"))).toBe(false);
    expect(isGroupGoneError(new TypeError("Failed to fetch"))).toBe(false);
    expect(isQuietGroupConflict(api(409, "APPLICATION_NOT_PENDING"))).toBe(true);
    expect(isQuietGroupConflict(api(409, "ALREADY_APPLIED"))).toBe(true);
    expect(isQuietGroupConflict(api(409, "ALREADY_MEMBER"))).toBe(true);
    expect(isQuietGroupConflict(api(409, "GROUP_FULL"))).toBe(false);
  });

  it("신청에 보낸 요청은 그사이 없어진 신청도 알리지 않는다", () => {
    expect(isQuietApplicationError(api(404, "NOT_FOUND"))).toBe(true);
    expect(isQuietApplicationError(api(409, "APPLICATION_NOT_PENDING"))).toBe(true);
    expect(isQuietApplicationError(api(409, "GROUP_FULL"))).toBe(false);
    expect(isQuietApplicationError(api(404, "GROUP_NOT_FOUND"))).toBe(false);
    expect(isQuietApplicationError(api(500))).toBe(false);
    expect(isQuietGroupConflict(api(404, "NOT_FOUND"))).toBe(false);
  });

  it("정한 문장은 글자 그대로다", () => {
    expect(groupNotFoundCopy()).toBe("그룹을 찾을 수 없어요");
    expect(notGroupMemberCopy()).toBe("이 그룹의 멤버가 아니에요");
    expect(groupRetryCopy()).toBe("잠시 후 다시 시도해 주세요");
    expect(applicationCanceledCopy()).toBe("신청을 취소했어요");
  });
});
