import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type * as UserIdModule from "@/lib/userId";
import { afterEach, expect, it, vi } from "vitest";

import { personalRecord, personalRecordStats } from "@/test/personalRecordFixtures";
import { useRecordsData } from "../useRecordsData";
import { useWeeklyData } from "../useWeeklyData";
import * as dateKey from "@/lib/dateKey";
import { personalRecordsKeys } from "@/lib/personalRecordsQueries";

vi.mock("@/lib/userId", async (original) => ({
  ...(await original<typeof UserIdModule>()),
  hasTokenSource: () => true,
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("인증된 기록 탭은 개인 일간·기간 조회를 사용하고 원본 없는 수정 기록을 받는다", async () => {
  const requests: string[] = [];
  vi.stubGlobal("fetch", async (input: string) => {
    requests.push(input);
    if (input.startsWith("/api/planner/records/stats?")) {
      return Response.json(
        personalRecordStats({ sessions: [personalRecord()], totalFocusSec: 3600 }),
      );
    }
    if (input.startsWith("/api/planner/records/stats/period?")) {
      return Response.json({
        from: "2026-11-01",
        to: "2026-11-30",
        compareFrom: "2026-10-01",
        compareTo: "2026-10-31",
        dailyList: [{ date: "2026-11-07", studySec: 3600, focusSec: 3600 }],
        compareDailyList: [],
      });
    }
    return new Response(null, { status: 404 });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useRecordsData(7, "2026-11-07", { year: 2026, month: 11 }), {
    wrapper,
  });
  await waitFor(() => expect(result.current.day.status).toBe("success"));
  if (result.current.day.status !== "success") throw new Error("missing personal records");
  expect(result.current.day.stats.sessions[0]).toMatchObject({
    displayKey: "manual:2026-11-07:0",
    originalSessionId: null,
    edited: true,
  });
  await waitFor(() => expect(result.current.dayFocusSec.get("2026-11-07")).toBe(3600));
  expect(requests.every((url) => url.startsWith("/api/planner/records/stats"))).toBe(true);
});

it("오래된 개인 기록도 기본 캐시 시간이 지나면 다시 조회한다", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-07T12:00:00+09:00"));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000, gcTime: Infinity } },
  });
  client.setQueryData(
    personalRecordsKeys.daily(7, "2026-01-01", "Asia/Seoul"),
    personalRecordStats(),
  );
  vi.setSystemTime(new Date("2026-11-07T12:00:31+09:00"));
  vi.stubGlobal("fetch", async (url: string) => {
    if (url.startsWith("/api/planner/records/stats?"))
      return Response.json(
        personalRecordStats({
          sessions: [
            personalRecord({
              displayKey: "manual:2026-01-01:0",
              recordKey: "m:2026-01-01T00:00:00Z",
              statDate: "2026-01-01",
              startedAt: "2026-01-01T00:00:00Z",
              endedAt: "2026-01-01T00:02:00Z",
              fullStartedAt: "2026-01-01T00:00:00Z",
              fullEndedAt: "2026-01-01T00:02:00Z",
              submissionStartedAt: "2026-01-01T00:00:00Z",
              studySec: 120,
              focusSec: 120,
            }),
          ],
          sessionCount: 1,
          totalStudySec: 120,
          totalFocusSec: 120,
        }),
      );
    return Response.json({
      from: "2026-01-01",
      to: "2026-01-31",
      compareFrom: null,
      compareTo: null,
      dailyList: [],
      compareDailyList: [],
    });
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useRecordsData(7, "2026-01-01", { year: 2026, month: 1 }), {
    wrapper,
  });
  await waitFor(() => {
    expect(result.current.day.status === "success" && result.current.day.stats.totalFocusSec).toBe(
      120,
    );
  });
});

it("개인 조회가 실패하면 원본 값으로 대체하지 않고 개인 조회를 재시도한다", async () => {
  let ready = false;
  const requests: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    requests.push(url);
    if (url.startsWith("/api/planner/records/stats?"))
      return ready ? Response.json(personalRecordStats()) : new Response(null, { status: 500 });
    return Response.json({
      from: "2026-11-01",
      to: "2026-11-30",
      compareFrom: null,
      compareTo: null,
      dailyList: [],
      compareDailyList: [],
    });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useRecordsData(7, "2026-11-07", { year: 2026, month: 11 }), {
    wrapper,
  });
  await waitFor(() => expect(result.current.day.status).toBe("error"));
  ready = true;
  act(() => {
    if (result.current.day.status === "error") result.current.day.retry();
  });
  await waitFor(() => expect(result.current.day.status).toBe("success"));
  expect(requests.some((url) => url.startsWith("/api/stats"))).toBe(false);
});

it("기기 시간대가 바뀌어 전면으로 돌아오면 이전 시간대 캐시와 구분해 조회한다", async () => {
  let zone = "Asia/Seoul";
  vi.spyOn(dateKey, "deviceTimeZone").mockImplementation(() => zone);
  const requests: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    requests.push(url);
    if (url.startsWith("/api/planner/records/stats?")) return Response.json(personalRecordStats());
    return Response.json({
      from: "2026-11-01",
      to: "2026-11-30",
      compareFrom: null,
      compareTo: null,
      dailyList: [],
      compareDailyList: [],
    });
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useRecordsData(7, "2026-11-07", { year: 2026, month: 11 }), {
    wrapper,
  });
  await waitFor(() => expect(result.current.day.status).toBe("success"));
  zone = "America/New_York";
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() =>
    expect(
      requests.some(
        (url) =>
          url.startsWith("/api/planner/records/stats?") &&
          url.includes("timeZone=America%2FNew_York"),
      ),
    ).toBe(true),
  );
  expect(
    client.getQueryData(personalRecordsKeys.daily(7, "2026-11-07", "Asia/Seoul")),
  ).toBeDefined();
  await waitFor(() =>
    expect(
      client.getQueryData(personalRecordsKeys.daily(7, "2026-11-07", "America/New_York")),
    ).toBeDefined(),
  );
});

it("주간 합계와 공부 리듬도 개인 수정본 조회로 연결한다", async () => {
  const requests: string[] = [];
  const rhythm = {
    studyDays: 3,
    focusSecByWeekdayHour: Array.from({ length: 7 }, () => Array<number>(24).fill(0)),
  };
  rhythm.focusSecByWeekdayHour[0]![9] = 1800;
  vi.stubGlobal("fetch", async (input: string) => {
    requests.push(input);
    if (input.startsWith("/api/planner/records/stats/period?")) {
      return Response.json({
        from: "2026-11-02",
        to: "2026-11-08",
        compareFrom: "2026-10-26",
        compareTo: "2026-11-01",
        dailyList: [{ date: "2026-11-07", studySec: 1800, focusSec: 1800 }],
        compareDailyList: [],
      });
    }
    if (input.startsWith("/api/planner/records/stats/rhythm?")) return Response.json(rhythm);
    return new Response(null, { status: 404 });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useWeeklyData(7, "2026-11-07"), { wrapper });
  await waitFor(() => expect(result.current.week.status).toBe("success"));
  await waitFor(() => expect(result.current.rhythm).toEqual({ status: "success", data: rhythm }));
  expect(requests.every((url) => url.startsWith("/api/planner/records/stats"))).toBe(true);
});
