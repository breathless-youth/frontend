import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";

import { JOIN_RETRY_MESSAGE, joinErrorMessage } from "../joinErrorCopy";

describe("joinErrorMessage", () => {
  it("INVALID_CODE는 코드 재확인 문구다", () => {
    expect(joinErrorMessage(new ApiError("없는 코드", 404, "INVALID_CODE"))).toBe(
      "초대코드를 다시 확인해 주세요",
    );
  });

  it("INVALID_CODE_FORMAT도 코드 재확인 문구다 — 사용자 행동이 같다", () => {
    expect(joinErrorMessage(new ApiError("형식 위반", 400, "INVALID_CODE_FORMAT"))).toBe(
      "초대코드를 다시 확인해 주세요",
    );
  });

  it("ROOM_FULL은 정원 안내 문구다", () => {
    expect(joinErrorMessage(new ApiError("가득 참", 409, "ROOM_FULL"))).toBe("방이 가득 찼어요");
  });

  // 서버가 code를 누락하는 상황이 실사용에서 확인돼 추가한 4xx 폴백(BY-427, joinErrorCopy.ts 상단 주석)
  it.each([400, 404])("code 없는 %i도 코드 재확인 문구다 — 4xx status 폴백", (status) => {
    expect(joinErrorMessage(new ApiError("본문에 code 없음", status))).toBe(
      "초대코드를 다시 확인해 주세요",
    );
  });

  it("code 없는 500은 재시도 문구다 — 폴백은 4xx에만 걸린다", () => {
    expect(joinErrorMessage(new ApiError("서버 오류", 500))).toBe(JOIN_RETRY_MESSAGE);
  });

  it("네트워크 실패 등 일반 Error도 재시도 문구다", () => {
    expect(joinErrorMessage(new TypeError("Failed to fetch"))).toBe(JOIN_RETRY_MESSAGE);
  });

  it("Error가 아닌 값도 재시도 문구다", () => {
    expect(joinErrorMessage(undefined)).toBe(JOIN_RETRY_MESSAGE);
  });
});
