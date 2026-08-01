import type { SubmitSessionMessage } from "@focuson/types";

import { relaySessionSubmit } from "../sessionSubmitRelay";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiBaseUrl: "http://api.test" } } },
}));

const mockedFetch = jest.fn();
globalThis.fetch = mockedFetch as unknown as typeof fetch;

const REQUEST = {
  userId: 7,
  startedAt: "2026-07-30T01:00:00.000Z",
  endedAt: "2026-07-30T02:00:00.000Z",
  studySec: 3600,
  focusSec: 3000,
  events: [],
};

const MESSAGE: SubmitSessionMessage = {
  type: "submit-session",
  requestId: "submit-1",
  request: REQUEST,
  atMs: 1,
};

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe("relaySessionSubmit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("웹이 준 본문을 고치지 않고 그대로 POST한다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(201, []));

    await relaySessionSubmit(MESSAGE);

    expect(mockedFetch).toHaveBeenCalledWith("http://api.test/api/study-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(REQUEST),
    });
  });

  it("성공하면 서버 응답을 담아 requestId와 함께 돌려준다", async () => {
    const sessions = [{ id: 1 }, { id: 2 }];
    mockedFetch.mockResolvedValue(jsonResponse(201, sessions));

    await expect(relaySessionSubmit(MESSAGE)).resolves.toEqual({
      type: "submit-result",
      requestId: "submit-1",
      ok: true,
      sessions,
      atMs: expect.any(Number),
    });
  });

  /**
   * 던지지 않는 것이 계약이다 — 호출부(`onMessage`)가 응답을 못 보내면 웹이 타임아웃까지
   * "저장 중..."에 갇힌다. 실패도 반드시 메시지로 돌아와야 한다.
   */
  it("서버가 400을 주면 서버 message를 실어 ok=false로 돌려준다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(400, { message: "세션 구간이 겹칩니다" }));

    await expect(relaySessionSubmit(MESSAGE)).resolves.toEqual({
      type: "submit-result",
      requestId: "submit-1",
      ok: false,
      message: "세션 구간이 겹칩니다",
      atMs: expect.any(Number),
    });
  });

  it("네트워크가 끊겨도 던지지 않고 ok=false로 돌려준다", async () => {
    mockedFetch.mockRejectedValue(new Error("Network request failed"));

    await expect(relaySessionSubmit(MESSAGE)).resolves.toMatchObject({
      ok: false,
      message: "Network request failed",
    });
  });

  it("본문 없는 실패에는 상태코드가 담긴 기본 문구를 쓴다", async () => {
    mockedFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    });

    await expect(relaySessionSubmit(MESSAGE)).resolves.toMatchObject({
      ok: false,
      message: "세션 제출 실패 (HTTP 500)",
    });
  });
});
