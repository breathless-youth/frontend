import type { SubmitPayload } from "@focuson/study-core";

import { StudySessionSubmitError, submitStudySession } from "../studySessionApi";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiBaseUrl: "http://api.test" } } },
}));

const mockedFetch = jest.fn();
globalThis.fetch = mockedFetch as unknown as typeof fetch;

const PAYLOAD: SubmitPayload = {
  startedAt: "2026-07-29T00:00:00.000Z",
  endedAt: "2026-07-29T01:00:00.000Z",
  studySec: 3_000,
  focusSec: 2_000,
  events: [],
};

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("submitStudySession", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("userId·payload를 JSON 바디로 POST한다", async () => {
    const response = [{ id: 1, userId: 7, statDate: "2026-07-29" }];
    mockedFetch.mockResolvedValue(jsonResponse(200, response));

    await expect(submitStudySession(7, PAYLOAD)).resolves.toEqual(response);
    expect(mockedFetch).toHaveBeenCalledWith("http://api.test/api/study-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: 7, ...PAYLOAD }),
    });
  });

  it("400이면 서버 메시지로 StudySessionSubmitError(status=400)를 던진다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(400, { message: "studySec가 유효하지 않습니다" }));

    await expect(submitStudySession(7, PAYLOAD)).rejects.toMatchObject({
      name: "StudySessionSubmitError",
      message: "studySec가 유효하지 않습니다",
      status: 400,
    });
    await expect(submitStudySession(7, PAYLOAD)).rejects.toBeInstanceOf(StudySessionSubmitError);
  });

  it("네트워크 오류를 호출자에게 전달한다", async () => {
    mockedFetch.mockRejectedValue(new TypeError("Network request failed"));

    await expect(submitStudySession(7, PAYLOAD)).rejects.toThrow("Network request failed");
  });
});
