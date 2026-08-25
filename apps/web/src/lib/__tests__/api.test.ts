import { describe, expect, it } from "vitest";

import { ApiError, parseApiError, parseErrorMessage } from "@/lib/api";

function fakeRes(status: number, body?: unknown): Pick<Response, "status" | "json"> {
  return {
    status,
    json: () => (body === undefined ? Promise.reject(new Error("no body")) : Promise.resolve(body)),
  };
}

describe("parseErrorMessage", () => {
  it("서버 에러 계약 { message }를 읽는다", async () => {
    const err = await parseErrorMessage(fakeRes(400, { message: "잘못된 요청" }), "조회 실패");
    expect(err.message).toBe("잘못된 요청");
  });

  it("본문이 없으면 fallback + HTTP 상태로 대체한다", async () => {
    const err = await parseErrorMessage(fakeRes(500), "조회 실패");
    expect(err.message).toBe("조회 실패 (HTTP 500)");
  });

  it("본문에 message가 없어도 fallback으로 대체한다", async () => {
    const err = await parseErrorMessage(fakeRes(404, {}), "조회 실패");
    expect(err.message).toBe("조회 실패 (HTTP 404)");
  });
});

describe("parseApiError", () => {
  it("서버 에러 계약 { code, message }를 ApiError로 읽는다", async () => {
    const err = await parseApiError(
      fakeRes(409, { code: "CONFLICT", message: "방이 가득 참" }),
      "참여 실패",
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.code).toBe("CONFLICT");
    expect(err.message).toBe("방이 가득 참");
  });

  it("code가 없으면 code는 undefined로 둔다", async () => {
    const err = await parseApiError(fakeRes(500, { message: "서버 오류" }), "참여 실패");
    expect(err.code).toBeUndefined();
    expect(err.message).toBe("서버 오류");
  });

  it("본문이 JSON이 아니면 fallback + HTTP 상태로 대체하고 status를 보존한다", async () => {
    const err = await parseApiError(fakeRes(502), "참여 실패");
    expect(err.code).toBeUndefined();
    expect(err.status).toBe(502);
    expect(err.message).toBe("참여 실패 (HTTP 502)");
  });
});
