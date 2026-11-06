import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { markSessionGuideSeen } from "@/features/study-session/sessionGuide";
import { SessionGuidePage } from "@/routes/SessionGuidePage";
import type * as Amplitude from "@/lib/amplitude";
import { plannerTask } from "@/test/plannerFixtures";
import { requestSessionStart } from "@/lib/sessionStart";
import type * as SessionStart from "@/lib/sessionStart";
import { enterGroupStudyRoom } from "@/features/group-room/enterGroupStudyRoom";
import { PlannerStudyStartSheet } from "../PlannerStudyStartSheet";
vi.mock("@/lib/sessionStart", async (original) => ({
  ...(await original<typeof SessionStart>()),
  requestSessionStart: vi.fn(async (_user, go) => {
    go();
    return "web";
  }),
}));
vi.mock("@/features/group-room/enterGroupStudyRoom", () => ({
  enterGroupStudyRoom: vi.fn(async () => ({ roomId: 11, graceRejoin: false, iceServers: [] })),
}));
vi.mock("@/lib/groupRoomCapability", () => ({ hasGroupRooms: () => true }));
const analytics = vi.hoisted(() => ({ trackFocusStartTapped: vi.fn() }));
vi.mock("@/lib/amplitude", async (original) => ({
  ...(await original<typeof Amplitude>()),
  ...analytics,
}));
beforeEach(() => {
  markSessionGuideSeen(7);
  vi.mocked(requestSessionStart).mockImplementation(async (_user, go) => {
    go();
    return "web";
  });
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});
function Location() {
  const location = useLocation();
  return (
    <output>
      {JSON.stringify({ path: location.pathname, search: location.search, state: location.state })}
    </output>
  );
}
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/planner?userId=7&date=2026-11-05&from=week&lang=ko"]}>
        <Routes>
          <Route
            path="/planner"
            element={
              <PlannerStudyStartSheet
                open
                onOpenChange={() => {}}
                userId={7}
                task={plannerTask({ date: "2026-11-05" })}
                subject={{ name: "수학", colorIndex: 2 }}
              />
            }
          />
          <Route path="/session-guide" element={<SessionGuidePage />} />
          <Route path="/room/1" element={<p>공부 세션</p>} />
        </Routes>
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
it("혼자 공부를 고르면 과목을 한 번 전달하고 날짜 쿼리를 걷는다", async () => {
  const client = setup();
  await userEvent.click(screen.getByRole("button", { name: "혼자 공부" }));
  await waitFor(() =>
    expect(requestSessionStart).toHaveBeenCalledWith(7, expect.any(Function), { subjectId: 3 }),
  );
  expect(screen.getByRole("status", { hidden: true })).toHaveTextContent('"path":"/room/1"');
  expect(screen.getByRole("status", { hidden: true })).toHaveTextContent("initialSubjectId=3");
  expect(screen.getByRole("status", { hidden: true })).not.toHaveTextContent("date=");
  expect(analytics.trackFocusStartTapped).toHaveBeenCalledExactlyOnceWith("planner");
  client.clear();
});
it("처음 혼자 공부할 때는 과목을 들고 가이드로 가고 마지막 시작 뒤 웹 세션을 연다", async () => {
  localStorage.clear();
  const client = setup();
  await userEvent.click(screen.getByRole("button", { name: "혼자 공부" }));

  expect(await screen.findByRole("dialog", { name: "세션 도움말" })).toBeInTheDocument();
  expect(requestSessionStart).not.toHaveBeenCalled();
  expect(analytics.trackFocusStartTapped).not.toHaveBeenCalled();
  expect(screen.getByRole("status", { hidden: true })).toHaveTextContent('"source":"planner"');
  expect(screen.getByRole("status", { hidden: true })).toHaveTextContent('"initialSubjectId":3');
  expect(screen.getByRole("status", { hidden: true })).not.toHaveTextContent("date=");
  expect(screen.getByRole("status", { hidden: true })).not.toHaveTextContent("from=");
  for (let step = 0; step < 4; step += 1) {
    await userEvent.click(screen.getByRole("button", { name: "다음" }));
  }
  await userEvent.click(screen.getByRole("button", { name: "순공 시작하기" }));

  expect(await screen.findByText("공부 세션")).toBeInTheDocument();
  expect(screen.getByRole("status", { hidden: true })).toHaveTextContent("initialSubjectId=3");
  expect(requestSessionStart).toHaveBeenCalledExactlyOnceWith(7, expect.any(Function), {
    subjectId: 3,
  });
  expect(analytics.trackFocusStartTapped).toHaveBeenCalledExactlyOnceWith("planner");
  client.clear();
});
it("그룹 목록에서 공부 중인 수를 보여 주고 선택 과목과 입장 결과를 넘긴다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        groups: [{ groupId: 8, name: "아침반", studyingCount: 2 }],
        pendingApplicationCount: 0,
        ownedGroupCount: 0,
        limits: {},
      }),
    ),
  );
  const client = setup();
  await userEvent.click(screen.getByRole("button", { name: "그룹 공부방" }));
  await userEvent.click(await screen.findByRole("button", { name: /아침반/ }));
  await waitFor(() => expect(enterGroupStudyRoom).toHaveBeenCalledWith(7, 8));
  expect(screen.getByRole("status", { hidden: true })).toHaveTextContent('"initialSubjectId":3');
  expect(screen.getByRole("status", { hidden: true })).toHaveTextContent('"path":"/groups/8/room"');
  client.clear();
});

it("시작할 과목과 할 일·설명을 보여 주고 그룹에서 돌아와도 시작하지 않는다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        groups: [{ groupId: 8, name: "아침반", studyingCount: 0 }],
        pendingApplicationCount: 0,
        ownedGroupCount: 0,
        limits: {},
      }),
    ),
  );
  const client = setup();
  expect(screen.getByText("수학 · 수학 3단원")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "혼자 공부" })).toHaveAccessibleDescription(
    "바로 순공 측정을 시작해요",
  );
  expect(screen.getByRole("button", { name: "그룹 공부방" })).toHaveAccessibleDescription(
    "내 그룹을 골라 같이 공부해요",
  );
  await userEvent.click(screen.getByRole("button", { name: "그룹 공부방" }));
  expect(await screen.findByText("지금은 아무도 없어요")).toBeInTheDocument();
  expect(screen.getByText("수학 · 수학 3단원")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "공부할 곳 고르기로 돌아가기" }));
  expect(screen.getByRole("dialog", { name: "어디서 공부할까요?" })).toBeInTheDocument();
  expect(screen.getByText("수학 · 수학 3단원")).toBeInTheDocument();
  expect(requestSessionStart).not.toHaveBeenCalled();
  expect(enterGroupStudyRoom).not.toHaveBeenCalled();
  client.clear();
});
