import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPeriodStats, getStreak, listStudySessionStats } from "../statsApi";

/**
 * 기본 base URL은 same-origin(빈 문자열) — dev의 vite 프록시 환경과 같다.
 * (모바일판 테스트는 `expo-constants` mock으로 절대 URL을 주입했지만, 웹판은 관례가 same-origin이다.)
 */
const mockedFetch = vi.fn();
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
    vi.clearAllMocks();
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
    expect(mockedFetch).toHaveBeenCalledWith("/api/stats?userId=7&date=2026-07-25", {
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

  it("date에 URL 특수문자가 섞여도 쿼리를 절단하지 않는다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, emptyStatsResponse));

    await listStudySessionStats(7, "2026-07-25&userId=9");

    expect(mockedFetch).toHaveBeenCalledWith("/api/stats?userId=7&date=2026-07-25%26userId%3D9", {
      method: "GET",
    });
  });
});

describe("getStreak", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("userId로 현재/최장 스트릭을 조회한다", async () => {
    mockedFetch.mockResolvedValue(
      jsonResponse(200, { streak: 5, maxStreak: 12, studiedDatesInRange: [] }),
    );

    await expect(getStreak(7)).resolves.toEqual({
      streak: 5,
      maxStreak: 12,
      studiedDatesInRange: [],
    });
    expect(mockedFetch).toHaveBeenCalledWith("/api/stats/streak?userId=7", {
      method: "GET",
    });
  });

  it("기록이 없으면 0/0 응답을 그대로 반환한다", async () => {
    mockedFetch.mockResolvedValue(
      jsonResponse(200, { streak: 0, maxStreak: 0, studiedDatesInRange: [] }),
    );

    await expect(getStreak(7)).resolves.toEqual({
      streak: 0,
      maxStreak: 0,
      studiedDatesInRange: [],
    });
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

  it("from/to 범위를 주면 쿼리 파라미터로 함께 보낸다", async () => {
    mockedFetch.mockResolvedValue(
      jsonResponse(200, { streak: 5, maxStreak: 12, studiedDatesInRange: ["2026-07-27"] }),
    );

    await expect(getStreak(7, { from: "2026-07-26", to: "2026-07-28" })).resolves.toEqual({
      streak: 5,
      maxStreak: 12,
      studiedDatesInRange: ["2026-07-27"],
    });
    expect(mockedFetch).toHaveBeenCalledWith(
      "/api/stats/streak?userId=7&from=2026-07-26&to=2026-07-28",
      { method: "GET" },
    );
  });

  it("from/to에 URL 특수문자가 섞여도 쿼리를 절단하지 않는다", async () => {
    mockedFetch.mockResolvedValue(
      jsonResponse(200, { streak: 0, maxStreak: 0, studiedDatesInRange: [] }),
    );

    await getStreak(7, { from: "2026-07-26&x=1", to: "2026-07-28" });

    expect(mockedFetch).toHaveBeenCalledWith(
      "/api/stats/streak?userId=7&from=2026-07-26%26x%3D1&to=2026-07-28",
      { method: "GET" },
    );
  });

  it("range가 없으면 기존과 같은 URL로 조회한다", async () => {
    mockedFetch.mockResolvedValue(
      jsonResponse(200, { streak: 0, maxStreak: 0, studiedDatesInRange: [] }),
    );

    await getStreak(7);
    expect(mockedFetch).toHaveBeenCalledWith("/api/stats/streak?userId=7", {
      method: "GET",
    });
  });
});

const emptyPeriodResponse = {
  from: "2026-08-24",
  to: "2026-08-30",
  compareFrom: null,
  compareTo: null,
  dailyList: [
    { date: "2026-08-24", studySec: 0, focusSec: 0 },
    { date: "2026-08-25", studySec: 3600, focusSec: 3300 },
  ],
  compareDailyList: [],
};

describe("getPeriodStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("userId와 from/to로 기간 집계를 조회한다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, emptyPeriodResponse));

    await expect(getPeriodStats(7, { from: "2026-08-24", to: "2026-08-30" })).resolves.toEqual(
      emptyPeriodResponse,
    );
    expect(mockedFetch).toHaveBeenCalledWith(
      "/api/stats/period?userId=7&from=2026-08-24&to=2026-08-30",
      { method: "GET" },
    );
  });

  it("비교 구간을 주면 compareFrom/compareTo를 함께 보낸다", async () => {
    const response = {
      ...emptyPeriodResponse,
      compareFrom: "2026-08-17",
      compareTo: "2026-08-23",
      compareDailyList: [{ date: "2026-08-17", studySec: 1800, focusSec: 1500 }],
    };
    mockedFetch.mockResolvedValue(jsonResponse(200, response));

    await expect(
      getPeriodStats(
        7,
        { from: "2026-08-24", to: "2026-08-30" },
        { from: "2026-08-17", to: "2026-08-23" },
      ),
    ).resolves.toEqual(response);
    expect(mockedFetch).toHaveBeenCalledWith(
      "/api/stats/period?userId=7&from=2026-08-24&to=2026-08-30&compareFrom=2026-08-17&compareTo=2026-08-23",
      { method: "GET" },
    );
  });

  it("비교 구간을 주지 않으면 compare 파라미터가 URL에 붙지 않는다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, emptyPeriodResponse));

    await getPeriodStats(7, { from: "2026-08-24", to: "2026-08-30" });

    const [url] = mockedFetch.mock.calls[0] as [string];
    expect(url).not.toContain("compareFrom");
    expect(url).not.toContain("compareTo");
  });

  it("비교 구간이 빈 배열로 오는 응답을 그대로 반환한다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, emptyPeriodResponse));

    await expect(
      getPeriodStats(7, { from: "2026-08-24", to: "2026-08-30" }),
    ).resolves.toMatchObject({ compareDailyList: [], compareFrom: null, compareTo: null });
  });

  it("JSON 오류 메시지가 있으면 해당 메시지로 실패한다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(400, { message: "from은 to보다 앞이어야 합니다" }));

    await expect(getPeriodStats(7, { from: "2026-08-30", to: "2026-08-24" })).rejects.toThrow(
      "from은 to보다 앞이어야 합니다",
    );
  });

  it("JSON 오류 본문을 읽지 못하면 HTTP 상태를 포함해 실패한다", async () => {
    mockedFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
    });

    await expect(getPeriodStats(7, { from: "2026-08-24", to: "2026-08-30" })).rejects.toThrow(
      "기간 집계 조회 실패 (HTTP 500)",
    );
  });

  it("네트워크 오류를 호출자에게 전달한다", async () => {
    mockedFetch.mockRejectedValue(new TypeError("Network request failed"));

    await expect(getPeriodStats(7, { from: "2026-08-24", to: "2026-08-30" })).rejects.toThrow(
      "Network request failed",
    );
  });

  it("구간 날짜에 URL 특수문자가 섞여도 쿼리를 절단하지 않는다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, emptyPeriodResponse));

    await getPeriodStats(
      7,
      { from: "2026-08-24&x=1", to: "2026-08-30" },
      {
        from: "2026-08-17#z",
        to: "2026-08-23",
      },
    );

    expect(mockedFetch).toHaveBeenCalledWith(
      "/api/stats/period?userId=7&from=2026-08-24%26x%3D1&to=2026-08-30&compareFrom=2026-08-17%23z&compareTo=2026-08-23",
      { method: "GET" },
    );
  });
});
