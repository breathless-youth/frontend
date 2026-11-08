import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import type * as UserIdModule from "@/lib/userId";

import { personalRecord, personalRecordStats } from "@/test/personalRecordFixtures";
import { RecordsPage } from "../RecordsPage";

vi.mock("@/lib/userId", async (original) => ({
  ...(await original<typeof UserIdModule>()),
  useUserId: () => 7,
  hasTokenSource: () => true,
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function Destination() {
  const location = useLocation();
  return (
    <output data-testid="opened-editor">
      {location.pathname}
      {location.search}
    </output>
  );
}

it("원본 ID 없는 개인 기록이 기록 탭에서 펼쳐지고 같은 날짜의 기록 고치기를 연다", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-07T12:00:00+09:00"));
  const requests: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    requests.push(url);
    if (url.startsWith("/api/planner/records/stats?"))
      return Response.json(
        personalRecordStats({
          sessions: [personalRecord()],
          sessionCount: 1,
          totalStudySec: 3600,
          totalFocusSec: 3600,
        }),
      );
    if (url.startsWith("/api/planner/records/stats/period?"))
      return Response.json({
        from: "2026-11-01",
        to: "2026-11-30",
        compareFrom: "2026-10-01",
        compareTo: "2026-10-31",
        dailyList: [{ date: "2026-11-07", studySec: 3600, focusSec: 3600 }],
        compareDailyList: [],
      });
    return new Response(null, { status: 404 });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/records?userId=7&date=2026-11-07"]}>
        <Routes>
          <Route path="/records" element={<RecordsPage />} />
          <Route path="/planner" element={<Destination />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: /수동 기록, 과목 없음,.*1시간/ }));
  expect(screen.getByRole("img", { name: "수정됨" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "수정" }));
  expect(await screen.findByTestId("opened-editor")).toHaveTextContent(
    "/planner?userId=7&date=2026-11-07&from=records&edit=records",
  );
  expect(requests.some((url) => url.startsWith("/api/stats"))).toBe(false);
  client.clear();
});
