import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";

import {
  CHECK_CODE_MESSAGE,
  JOIN_RETRY_MESSAGE,
  ROOM_CLOSED_MESSAGE,
  ROOM_FULL_MESSAGE,
  USER_NOT_FOUND_MESSAGE,
  joinErrorMessage,
  rejoinFailure,
} from "../joinErrorCopy";

describe("joinErrorMessage — 초대코드 입력·공유 화면", () => {
  it("INVITE_CODE_NOT_FOUND는 코드 재확인 문구다", () => {
    expect(joinErrorMessage(new ApiError("없는 코드", 404, "INVITE_CODE_NOT_FOUND"))).toBe(
      CHECK_CODE_MESSAGE,
    );
  });

  it("BAD_REQUEST도 코드 재확인 문구다 — 4자리 형식 위반이라 사용자 행동이 같다", () => {
    expect(joinErrorMessage(new ApiError("형식 위반", 400, "BAD_REQUEST"))).toBe(
      CHECK_CODE_MESSAGE,
    );
  });

  it("ROOM_CLOSED는 방이 사라진 사유를 밝힌다 — 코드를 고쳐도 소용없다", () => {
    expect(joinErrorMessage(new ApiError("소멸된 방", 404, "ROOM_CLOSED"))).toBe(
      ROOM_CLOSED_MESSAGE,
    );
  });

  it("USER_NOT_FOUND는 사용자 정보 문구다", () => {
    expect(joinErrorMessage(new ApiError("없는 유저", 404, "USER_NOT_FOUND"))).toBe(
      USER_NOT_FOUND_MESSAGE,
    );
  });

  it("CONFLICT는 정원 안내 문구다", () => {
    expect(joinErrorMessage(new ApiError("정원 초과", 409, "CONFLICT"))).toBe(ROOM_FULL_MESSAGE);
  });

  it("VALIDATION_FAILED는 재시도 문구다 — 사용자가 고칠 수 있는 게 없다", () => {
    expect(joinErrorMessage(new ApiError("본문 누락", 400, "VALIDATION_FAILED"))).toBe(
      JOIN_RETRY_MESSAGE,
    );
  });

  it("INTERNAL_ERROR는 재시도 문구다", () => {
    expect(joinErrorMessage(new ApiError("서버 오류", 500, "INTERNAL_ERROR"))).toBe(
      JOIN_RETRY_MESSAGE,
    );
  });

  // 서버가 code를 누락하는 상황이 실사용에서 확인돼 추가한 4xx 폴백(BY-427, joinErrorCopy.ts 상단 주석)
  it.each([400, 404])("code 없는 %i도 코드 재확인 문구다 — 4xx status 폴백", (status) => {
    expect(joinErrorMessage(new ApiError("본문에 code 없음", status))).toBe(CHECK_CODE_MESSAGE);
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

describe("rejoinFailure — 룸 재입장(코드를 고칠 수 없는 자리)", () => {
  it("ROOM_CLOSED는 방을 떠난다", () => {
    expect(rejoinFailure(new ApiError("소멸된 방", 404, "ROOM_CLOSED"))).toEqual({
      kind: "leave",
      message: ROOM_CLOSED_MESSAGE,
    });
  });

  it("INVITE_CODE_NOT_FOUND도 방이 사라진 문구다 — 소멸 10분 뒤 같은 상황에서 온다", () => {
    expect(rejoinFailure(new ApiError("없는 코드", 404, "INVITE_CODE_NOT_FOUND"))).toEqual({
      kind: "leave",
      message: ROOM_CLOSED_MESSAGE,
    });
  });

  it("USER_NOT_FOUND는 사용자 정보 문구로 방을 떠난다", () => {
    expect(rejoinFailure(new ApiError("없는 유저", 404, "USER_NOT_FOUND"))).toEqual({
      kind: "leave",
      message: USER_NOT_FOUND_MESSAGE,
    });
  });

  it("BAD_REQUEST는 코드 재확인이 아니라 재시도 문구로 떠난다 — 고칠 입력칸이 없다", () => {
    expect(rejoinFailure(new ApiError("형식 위반", 400, "BAD_REQUEST"))).toEqual({
      kind: "leave",
      message: JOIN_RETRY_MESSAGE,
    });
  });

  it("CONFLICT만은 재시도로 남는다 — 자리가 다시 날 수 있다", () => {
    expect(rejoinFailure(new ApiError("정원 초과", 409, "CONFLICT"))).toEqual({
      kind: "retry",
      message: ROOM_FULL_MESSAGE,
    });
  });

  it("code 없는 404도 방을 떠난다 — 알 수 없는 4xx에 갇히지 않는다", () => {
    expect(rejoinFailure(new ApiError("본문에 code 없음", 404))).toEqual({
      kind: "leave",
      message: JOIN_RETRY_MESSAGE,
    });
  });

  it("500은 재시도로 남는다 — 방이 살아 있는데 쫓아내면 측정이 날아간다", () => {
    expect(rejoinFailure(new ApiError("서버 오류", 500, "INTERNAL_ERROR"))).toEqual({
      kind: "retry",
      message: JOIN_RETRY_MESSAGE,
    });
  });

  it("네트워크 실패도 재시도로 남는다", () => {
    expect(rejoinFailure(new TypeError("Failed to fetch"))).toEqual({
      kind: "retry",
      message: JOIN_RETRY_MESSAGE,
    });
  });
});
