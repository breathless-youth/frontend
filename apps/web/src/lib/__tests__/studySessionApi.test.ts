import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";

import { getStudySessionDetail } from "../studySessionApi";

const mockedFetch = vi.fn();
globalThis.fetch = mockedFetch as unknown as typeof fetch;

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("getStudySessionDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("세션 id는 경로로, userId는 쿼리로 보내고 200 본문을 반환한다", async () => {
    const response = {
      id: 10,
      userId: 7,
      statDate: "2026-07-24",
      startedAt: "2026-07-24T01:00:00Z",
      endedAt: "2026-07-24T03:00:00Z",
      studySec: 6600,
      focusSec: 6000,
      focusRate: 90.9,
      events: [
        { status: "PHONE", startedAt: "2026-07-24T01:10:00Z", endedAt: "2026-07-24T01:20:00Z" },
      ],
    };
    mockedFetch.mockResolvedValue(jsonResponse(200, response));

    await expect(getStudySessionDetail(7, 10)).resolves.toEqual(response);
    expect(mockedFetch).toHaveBeenCalledWith("/api/study-sessions/10?userId=7", { method: "GET" });
  });

  it("404면 서버가 준 code와 message를 보존한 ApiError를 던진다", async () => {
    mockedFetch.mockResolvedValue(
      jsonResponse(404, { code: "NOT_FOUND", message: "세션을 찾을 수 없습니다" }),
    );

    const error = await getStudySessionDetail(7, 10).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      message: "세션을 찾을 수 없습니다",
    });
  });

  it("404 본문이 JSON이 아니면 세션 조회 실패 문구로 대체한다", async () => {
    mockedFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    });

    await expect(getStudySessionDetail(7, 10)).rejects.toThrow("세션 조회 실패 (HTTP 404)");
  });
});
