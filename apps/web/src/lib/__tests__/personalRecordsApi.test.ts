import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  getPersonalRecordPeriod,
  getPersonalRecordRhythm,
  getPersonalRecordStats,
} from "../personalRecordsApi";
import { personalRecord, personalRecordStats } from "@/test/personalRecordFixtures";

const request = vi.fn<typeof fetch>();
beforeEach(() => {
  request.mockReset();
  vi.stubGlobal("fetch", request);
});

it("개인 기간 조회에 비교 기간과 시간대를 함께 보내 서로 다른 비교 결과를 구분한다", async () => {
  const response = {
    from: "2026-11-01",
    to: "2026-11-30",
    compareFrom: "2026-10-01",
    compareTo: "2026-10-31",
    dailyList: [],
    compareDailyList: [],
  };
  request.mockResolvedValue(Response.json(response));
  const result = await getPersonalRecordPeriod(
    { from: "2026-11-01", to: "2026-11-30" },
    { from: "2026-10-01", to: "2026-10-31" },
    { timeZone: "Asia/Seoul" },
  );
  expect(request.mock.calls[0]?.[0]).toBe(
    "/api/planner/records/stats/period?from=2026-11-01&to=2026-11-30&compareFrom=2026-10-01&compareTo=2026-10-31&timeZone=Asia%2FSeoul",
  );
  expect(result).toEqual(response);
});

it("개인 공부 리듬 조회에는 기간이나 구 앱 userId를 추가하지 않는다", async () => {
  const response = {
    studyDays: 0,
    focusSecByWeekdayHour: Array.from({ length: 7 }, () => Array<number>(24).fill(0)),
  };
  request.mockResolvedValue(Response.json(response));
  expect(await getPersonalRecordRhythm({ timeZone: "Asia/Seoul" })).toEqual(response);
  expect(request.mock.calls[0]?.[0]).toBe(
    "/api/planner/records/stats/rhythm?timeZone=Asia%2FSeoul",
  );
});
afterEach(() => vi.unstubAllGlobals());

it("개인 일간 조회에 자정 날짜와 시간대를 보내고 원본 없는 기록의 키를 보존한다", async () => {
  request.mockResolvedValue(
    Response.json(
      personalRecordStats({ sessions: [personalRecord({ displayKey: "manual:day" })] }),
    ),
  );
  const controller = new AbortController();
  const result = await getPersonalRecordStats("2026-11-07", {
    timeZone: "America/New_York",
    signal: controller.signal,
  });
  const [url, init] = request.mock.calls[0]!;
  expect(url).toBe("/api/planner/records/stats?date=2026-11-07&timeZone=America%2FNew_York");
  expect(new Headers(init?.headers).get("API-Version")).toBe("1");
  expect(init?.signal).toBe(controller.signal);
  expect(result.sessions[0]?.originalSessionId).toBeNull();
  expect(result.sessions[0]?.displayKey).toBe("manual:day");
});
