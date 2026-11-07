import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { getStudySessionDetail } from "@/lib/studySessionApi";
import type * as UserIdModule from "@/lib/userId";
import { ManualRecordPage } from "@/routes/ManualRecordPage";

const identity = vi.hoisted(() => ({ token: true, pending: false }));
vi.mock("@/lib/userId", async (importOriginal) => ({
  ...(await importOriginal<typeof UserIdModule>()),
  hasTokenSource: () => identity.token,
  useIdentityPending: () => identity.pending,
}));
vi.mock("@/lib/studySessionApi", () => ({ getStudySessionDetail: vi.fn() }));

function Destination() {
  const location = useLocation();
  return (
    <output data-testid="destination">
      {location.pathname}
      {location.search}
    </output>
  );
}
function mount(search: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/manual-record${search}`]}>
        <Routes>
          <Route path="/manual-record" element={<ManualRecordPage />} />
          <Route path="/planner" element={<Destination />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-07T12:00:00+09:00"));
  identity.token = true;
  identity.pending = false;
  vi.mocked(getStudySessionDetail).mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("옛 추가 URL은 폼을 띄우지 않고 선택일의 기록 고치기로 교체하며 셸 쿼리를 보존한다", async () => {
  mount("?userId=7&guestAuth=1&date=2026-11-04&entry=records");
  expect(await screen.findByTestId("destination")).toHaveTextContent(
    "/planner?userId=7&guestAuth=1&date=2026-11-04&from=records&edit=records",
  );
  expect(screen.queryByRole("heading", { name: "시간 직접 입력" })).not.toBeInTheDocument();
  expect(getStudySessionDetail).not.toHaveBeenCalled();
});
it("옛 새벽 칸 URL의 자정 날짜를 전날 05시 플래너 날짜로 바꾼다", async () => {
  const start = Date.parse("2026-11-05T03:00:00+09:00");
  mount(`?userId=7&date=2026-11-05&entry=planner_cell&from=home&start=${start}`);
  expect(await screen.findByTestId("destination")).toHaveTextContent(
    "/planner?userId=7&from=home&date=2026-11-04&edit=records",
  );
});
it("옛 기록 id 링크는 인증된 단건 조회 후 실제 시각의 플래너를 연다", async () => {
  vi.mocked(getStudySessionDetail).mockResolvedValue({
    id: 9,
    userId: 7,
    statDate: "2026-11-05",
    startedAt: "2026-11-04T18:00:00Z",
    endedAt: "2026-11-04T19:00:00Z",
    studySec: 3600,
    focusSec: 3600,
    focusRate: 100,
    events: [],
    source: "MANUAL",
  });
  mount("?userId=7&date=2026-11-05&entry=records&id=9");
  expect(await screen.findByTestId("destination")).toHaveTextContent(
    "/planner?userId=7&date=2026-11-04&from=records&edit=records&returnDate=2026-11-05",
  );
  expect(getStudySessionDetail).toHaveBeenCalledWith(9);
});
it("토큰 없는 옛 URL은 인증 조회 없이 기존 읽기 플래너로 보낸다", async () => {
  identity.token = false;
  mount("?userId=7&date=2026-11-05&entry=records&id=9");
  expect(await screen.findByTestId("destination")).toHaveTextContent(
    "/planner?userId=7&date=2026-11-05&from=records",
  );
  expect(getStudySessionDetail).not.toHaveBeenCalled();
});
it("기록 조회가 실패하면 다른 날짜로 보내지 않고 재시도한다", async () => {
  vi.mocked(getStudySessionDetail).mockRejectedValueOnce(new Error("offline"));
  mount("?userId=7&date=2026-11-05&entry=records&id=9");
  await waitFor(() => expect(screen.getByRole("button", { name: /다시/ })).toBeInTheDocument());
  expect(screen.queryByTestId("destination")).not.toBeInTheDocument();
  vi.mocked(getStudySessionDetail).mockResolvedValueOnce({
    id: 9,
    userId: 7,
    statDate: "2026-11-05",
    startedAt: "2026-11-05T01:00:00Z",
    endedAt: "2026-11-05T02:00:00Z",
    studySec: 3600,
    focusSec: 3600,
    focusRate: 100,
    events: [],
  });
  fireEvent.click(screen.getByRole("button", { name: /다시/ }));
  expect(await screen.findByTestId("destination")).toHaveTextContent("date=2026-11-05");
});
it("새벽의 오늘 추가 링크는 아직 시작하지 않은 05시 대신 현재 플래너를 연다", async () => {
  vi.setSystemTime(new Date("2026-11-07T03:00:00+09:00"));
  mount("?userId=7&date=2026-11-07&entry=records");
  expect(await screen.findByTestId("destination")).toHaveTextContent(
    "date=2026-11-06&from=records&edit=records&returnDate=2026-11-07",
  );
});
