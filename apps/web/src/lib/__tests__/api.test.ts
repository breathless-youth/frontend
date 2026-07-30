import { describe, expect, it } from "vitest";

import { parseErrorMessage } from "@/lib/api";

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
