import { getStreak, listStudySessionStats } from "../statsApi";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiBaseUrl: "http://api.test" } } },
}));

const mockedFetch = jest.fn();
globalThis.fetch = mockedFetch as unknown as typeof fetch;

const emptyStatsResponse = {
  sessions: [],
  sessionCount: 0,
  totalStudySec: 0,
  totalFocusSec: 0,
  longestFocusSec: 0,
  focusRate: 0,
  totalEventCounts: { PHONE: 0, DEVICE: 0, AWAY: 0, PAUSE: 0 },
  studiedDatesInMonth: ["2026-07-25"],
};

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("listStudySessionStats", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("userId와 date로 일일 통계를 조회한다", async () => {
    const response = {
      ...emptyStatsResponse,
      sessions: [
        {
          id: 10,
          statDate: "2026-07-25",
          startedAt: "2026-07-25T01:00:00Z",
          endedAt: "2026-07-25T02:00:00Z",
          studySec: 3600,
          focusSec: 3300,
          focusRate: 91.7,
          eventCounts: { PHONE: 1, DEVICE: 0, AWAY: 0, PAUSE: 0 },
        },
      ],
      sessionCount: 1,
      totalStudySec: 3600,
      totalFocusSec: 3300,
      longestFocusSec: 1800,
      focusRate: 91.7,
      totalEventCounts: { PHONE: 1, DEVICE: 0, AWAY: 0, PAUSE: 0 },
    };
    mockedFetch.mockResolvedValue(jsonResponse(200, response));

    await expect(listStudySessionStats(7, "2026-07-25")).resolves.toEqual(response);
    expect(mockedFetch).toHaveBeenCalledWith("http://api.test/api/stats?userId=7&date=2026-07-25", {
      method: "GET",
    });
  });

  it("세션이 없는 일자의 0값 응답을 그대로 반환한다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, emptyStatsResponse));

    await expect(listStudySessionStats(7, "2026-07-25")).resolves.toEqual(emptyStatsResponse);
  });

  it("JSON 오류 메시지가 있으면 해당 메시지로 실패한다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(400, { message: "date는 필수입니다" }));

    await expect(listStudySessionStats(7, "")).rejects.toThrow("date는 필수입니다");
  });

  it("JSON 오류 본문을 읽지 못하면 HTTP 상태를 포함해 실패한다", async () => {
    mockedFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
    });

    await expect(listStudySessionStats(7, "2026-07-25")).rejects.toThrow(
      "통계 조회 실패 (HTTP 500)",
    );
  });

  it("네트워크 오류를 호출자에게 전달한다", async () => {
    mockedFetch.mockRejectedValue(new TypeError("Network request failed"));

    await expect(listStudySessionStats(7, "2026-07-25")).rejects.toThrow("Network request failed");
  });
});

describe("getStreak", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("userId로 현재/최장 스트릭을 조회한다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, { streak: 5, maxStreak: 12 }));

    await expect(getStreak(7)).resolves.toEqual({ streak: 5, maxStreak: 12 });
    expect(mockedFetch).toHaveBeenCalledWith("http://api.test/api/stats/streak?userId=7", {
      method: "GET",
    });
  });

  it("기록이 없으면 0/0 응답을 그대로 반환한다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, { streak: 0, maxStreak: 0 }));

    await expect(getStreak(7)).resolves.toEqual({ streak: 0, maxStreak: 0 });
  });

  it("JSON 오류 메시지가 있으면 해당 메시지로 실패한다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(400, { message: "userId는 필수입니다" }));

    await expect(getStreak(7)).rejects.toThrow("userId는 필수입니다");
  });

  it("JSON 오류 본문을 읽지 못하면 HTTP 상태를 포함해 실패한다", async () => {
    mockedFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
    });

    await expect(getStreak(7)).rejects.toThrow("스트릭 조회 실패 (HTTP 500)");
  });

  it("네트워크 오류를 호출자에게 전달한다", async () => {
    mockedFetch.mockRejectedValue(new TypeError("Network request failed"));

    await expect(getStreak(7)).rejects.toThrow("Network request failed");
  });
});
