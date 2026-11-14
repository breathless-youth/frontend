import { plannerDay } from "@/test/plannerFixtures";
import { homeMission } from "@/test/homeMissionFixtures";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SubjectStartUnavailableError } from "@/lib/sessionStart";
import { hardNavigate } from "@/lib/hardNavigation";

import { HomeV3Entry } from "../HomeV3Entry";
import type { HomeV3Gateway } from "../HomeV3Gateway";
import { readHomeSubject, writeHomeSubject } from "../subjectSelection";
import i18n from "@/lib/i18n";
import type * as amplitude from "@/lib/amplitude";
import type * as hardNavigation from "@/lib/hardNavigation";
import type * as userIdModule from "@/lib/userId";

const mocked = vi.hoisted(() => ({
  subjects: vi.fn(),
  stats: vi.fn(),
  summary: vi.fn(),
  syncZone: vi.fn(),
  planner: vi.fn(),
  timelapseProperty: vi.fn(),
  day: { dateKey: "2026-11-07", timeZone: "Asia/Seoul" },
}));
vi.mock("@/lib/userId", async (original) => ({
  ...(await original<typeof userIdModule>()),
  assertCurrentUserId: vi.fn(),
}));
vi.mock("../useHomeDay", () => ({ useHomeDay: () => mocked.day }));
vi.mock("@/lib/subjectApi", () => ({ listSubjects: mocked.subjects }));
vi.mock("@/lib/statsApi", () => ({
  listStudySessionStats: mocked.stats,
  getStreak: vi.fn().mockResolvedValue({ streak: 0, maxStreak: 0, studiedDatesInRange: [] }),
}));
vi.mock("@/features/home/useHomeStudyStatusProperties", () => ({
  useHomeStudyStatusProperties: mocked.summary,
}));
vi.mock("@/features/profile/useTimeZoneSync", () => ({ syncProfileTimeZone: mocked.syncZone }));
vi.mock("@/features/planner/useOpenPlanner", () => ({ useOpenPlanner: () => mocked.planner }));
vi.mock("@/features/timelapse/timelapseQueries", () => ({
  recentTimelapsesQuery: () => ({ queryKey: ["timelapse", "recent"], queryFn: async () => [] }),
}));
vi.mock("@/features/app-lock/appLockCapability", () => ({ hasAppLockCapability: () => false }));
vi.mock("@/lib/amplitude", async (original) => ({
  ...(await original<typeof amplitude>()),
  setHasTimelapseUserProperty: mocked.timelapseProperty,
}));

vi.mock("@/features/study-session/vision/prefetchVisionAssets", () => ({
  prefetchVisionAssets: vi.fn(),
}));
vi.mock("@/routes/lazyRoutes", () => ({ prefetchTimelapsesPage: vi.fn() }));
vi.mock("@/lib/hardNavigation", async (original) => ({
  ...(await original<typeof hardNavigation>()),
  hardNavigate: vi.fn(),
}));
afterEach(() => vi.unstubAllGlobals());

function setup(overrides: Partial<HomeV3Gateway> = {}, real = false, path = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const gateway: HomeV3Gateway = {
    readMission: vi.fn().mockResolvedValue(homeMission(0, 0)),
    acknowledgeMission: vi.fn(),
    readPlannerDay: vi.fn().mockResolvedValue(
      plannerDay({
        date: "2026-11-07",
        goal: { goalSec: null, individualGoalSec: null, defaultGoalSec: null },
      }),
    ),
    saveDateGoal: vi.fn(),
    saveDefaultGoal: vi.fn(),
    startStudy: vi.fn(),
    ...overrides,
  };
  const onOverlayChange = vi.fn();
  const element = () => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <HomeV3Entry
          userId={7}
          gateway={real ? undefined : gateway}
          onOverlayChange={onOverlayChange}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(element());
  return { gateway, client, ...view, refresh: () => view.rerender(element()) };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocked.day = { dateKey: "2026-11-07", timeZone: "Asia/Seoul" };
  mocked.subjects.mockResolvedValue([
    { id: 2, name: "Math", colorIndex: 0, tasks: [], studySec: 0, focusSec: 0 },
  ]);
  mocked.stats.mockResolvedValue({ totalStudySec: 15512, totalFocusSec: 13337, focusRate: 86 });
  mocked.syncZone.mockResolvedValue(undefined);
});

describe("home v3 entry adapters", () => {
  it("uses the real default adapter for mission confirmation and HOME goal saves", async () => {
    let state = homeMission<0 | 1 | 2>(1);
    let goalSec = 28800;
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/home/mission/steps/2/complete") {
        state = homeMission(2);
        return Response.json(state);
      }
      if (url.pathname === "/api/home/mission") return Response.json(state);
      if (url.pathname.startsWith("/api/planner/days/"))
        return Response.json(
          plannerDay({ goal: { goalSec, individualGoalSec: goalSec, defaultGoalSec: goalSec } }),
        );
      if (url.pathname.startsWith("/api/planner/goals/")) {
        goalSec = JSON.parse(String(init?.body)).goalSec;
        return Response.json(
          url.pathname.endsWith("/default")
            ? { goalSec }
            : { goalSec, individualGoalSec: goalSec, defaultGoalSec: goalSec },
        );
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetch);
    setup({}, true);
    await userEvent.click(
      await screen.findByRole("button", { name: i18n.t("home:v3.mission.complete") }),
    );
    expect(
      await screen.findByText(i18n.t("home:v3.goal.remaining", { time: "4:17:43" })),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: i18n.t("home:v3.goal.change") }));
    await userEvent.click(
      await screen.findByRole("button", { name: i18n.t("planner:goal.increase") }),
    );
    await userEvent.click(screen.getByRole("button", { name: i18n.t("home:v3.goal.save") }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const datePut = fetch.mock.calls.find(
      ([url, init]) => String(url).includes("/api/planner/goals/2026") && init?.method === "PUT",
    );
    expect(new URL(String(datePut?.[0]), "http://localhost").searchParams.get("calendar")).toBe(
      "HOME",
    );
    expect(JSON.parse(String(datePut?.[1]?.body))).toEqual({ goalSec: 30600 });
  });
  it("opens the contact chat as a new document without the userId query", async () => {
    setup({}, false, "/home?userId=7&appVersion=26.46.0&guestAuth=1");

    await userEvent.click(
      await screen.findByRole("button", {
        name: `${i18n.t("home:v3.contact.bubble")} ${i18n.t("home:v3.contact.label")}`,
      }),
    );

    expect(hardNavigate).toHaveBeenCalledWith("/contact/chat?appVersion=26.46.0&guestAuth=1");
  });

  it("opens the contact chat without a trailing question mark when there is no query", async () => {
    setup({}, false, "/home");

    await userEvent.click(
      await screen.findByRole("button", {
        name: `${i18n.t("home:v3.contact.bubble")} ${i18n.t("home:v3.contact.label")}`,
      }),
    );

    expect(hardNavigate).toHaveBeenCalledWith("/contact/chat");
  });

  it("shows the app update action when the selected subject cannot be passed by an older app", async () => {
    writeHomeSubject(7, 2);
    const { gateway } = setup({
      startStudy: vi.fn().mockRejectedValue(new SubjectStartUnavailableError("unsupported")),
    });
    await screen.findByRole("button", { name: "Math" });
    await userEvent.click(screen.getByRole("button", { name: i18n.t("home:v3.startStudy") }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      i18n.t("planner:studyStart.updateApp"),
    );
    expect(gateway.startStudy).toHaveBeenCalledWith(2);
    expect(readHomeSubject(7)).toBe(2);
  });
  it("waits for profile timezone sync before reading today's stats, and refetches for a same-date zone change", async () => {
    let finish!: () => void;
    mocked.syncZone.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const { refresh } = setup();
    await waitFor(() => expect(mocked.syncZone).toHaveBeenCalled());
    expect(mocked.stats).not.toHaveBeenCalled();
    await act(async () => finish());
    await waitFor(() => expect(mocked.stats).toHaveBeenCalledOnce());
    mocked.day = { ...mocked.day, timeZone: "Asia/Tokyo" };
    refresh();
    await waitFor(() => expect(mocked.stats).toHaveBeenCalledTimes(2));
    expect(mocked.syncZone).toHaveBeenLastCalledWith(7, "Asia/Tokyo");
  });
  it("closes an open goal sheet when the local date changes", async () => {
    const { refresh } = setup({
      readMission: vi.fn().mockResolvedValue(homeMission(2, 300)),
    });
    await userEvent.click(await screen.findByRole("button", { name: i18n.t("home:v3.goal.set") }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    mocked.day = { ...mocked.day, dateKey: "2026-11-08" };
    refresh();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("uses the account's last subject for the start boundary and preserves analytics", async () => {
    writeHomeSubject(7, 2);
    const { gateway } = setup();
    await screen.findByRole("button", { name: "Math" });
    await userEvent.click(screen.getByRole("button", { name: i18n.t("home:v3.startStudy") }));
    expect(gateway.startStudy).toHaveBeenCalledWith(2);
    expect(mocked.summary).toHaveBeenCalled();
    expect(mocked.timelapseProperty).toHaveBeenCalledWith(false);
  });

  it("clears a subject that was deleted on another surface", async () => {
    writeHomeSubject(7, 2);
    const { gateway, client } = setup();
    await screen.findByRole("button", { name: "Math" });
    act(() => {
      client.setQueryData(["subjects", "list", 7], []);
    });
    await waitFor(() => expect(readHomeSubject(7)).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: i18n.t("home:v3.startStudy") }));
    expect(gateway.startStudy).toHaveBeenCalledWith(null);
  });

  it("keeps the saved subject on failure and requires retry or explicit no subject", async () => {
    writeHomeSubject(7, 2);
    mocked.subjects.mockRejectedValue(new Error("offline"));
    const { gateway } = setup();
    await userEvent.click(
      await screen.findByRole("button", { name: i18n.t("home:v3.startStudy") }),
    );
    expect(gateway.startStudy).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      i18n.t("home:v3.subject.verifyFailed"),
    );
    expect(readHomeSubject(7)).toBe(2);
    await userEvent.click(screen.getByRole("button", { name: i18n.t("home:v3.subject.saved") }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: i18n.t("home:v3.subject.none") }),
    );
    await userEvent.click(screen.getByRole("button", { name: i18n.t("home:v3.startStudy") }));
    expect(gateway.startStudy).toHaveBeenCalledWith(null);
  });

  it("clears a subject verification error when a later subject refresh succeeds", async () => {
    writeHomeSubject(7, 2);
    mocked.subjects.mockRejectedValue(new Error("offline"));
    const { client, gateway } = setup();
    await userEvent.click(
      await screen.findByRole("button", { name: i18n.t("home:v3.startStudy") }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      i18n.t("home:v3.subject.verifyFailed"),
    );

    mocked.subjects.mockResolvedValue([
      { id: 2, name: "Math", colorIndex: 0, tasks: [], studySec: 0, focusSec: 0 },
    ]);
    await act(async () => {
      await client.refetchQueries({ queryKey: ["subjects", "list", 7] });
    });

    await screen.findByRole("button", { name: "Math" });
    expect(screen.queryByText(i18n.t("home:v3.subject.verifyFailed"))).not.toBeInTheDocument();
    expect(readHomeSubject(7)).toBe(2);
    expect(gateway.startStudy).not.toHaveBeenCalled();
  });
});
