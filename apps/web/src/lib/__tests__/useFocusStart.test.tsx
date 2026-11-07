import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { markSessionGuideSeen } from "@/features/study-session/sessionGuide";
import type * as Amplitude from "@/lib/amplitude";
import { requestSessionStart } from "@/lib/sessionStart";
import { useFocusStart } from "@/lib/useFocusStart";

vi.mock("@/lib/sessionStart", () => ({ requestSessionStart: vi.fn() }));
const analytics = vi.hoisted(() => ({ trackFocusStartTapped: vi.fn() }));
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackFocusStartTapped: analytics.trackFocusStartTapped,
}));
const haptic = vi.hoisted(() => vi.fn());
vi.mock("@/lib/haptics", () => ({ haptic }));

beforeEach(() => markSessionGuideSeen(7));
afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

function Starter({ userId = 7 }: { userId?: number | null }) {
  const startFocus = useFocusStart(userId);
  return (
    <button type="button" onClick={() => startFocus("ranking_card")}>
      집중 시작
    </button>
  );
}

function RoomProbe() {
  const location = useLocation();
  return <div data-testid="room-probe">{location.pathname + location.search}</div>;
}

function GuideProbe() {
  const location = useLocation();
  return (
    <div data-testid="guide-probe" data-state={JSON.stringify(location.state)}>
      {location.pathname + location.search}
    </div>
  );
}

function renderStarter(userId: number | null = 7) {
  render(
    <MemoryRouter initialEntries={["/ranking?userId=7"]}>
      <Routes>
        <Route path="/ranking" element={<Starter userId={userId} />} />
        <Route path="/room/1" element={<RoomProbe />} />
        <Route path="/session-guide" element={<GuideProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("useFocusStart", () => {
  it("가이드를 안 본 계정은 세션을 시작하지 않고 누른 자리를 들고 가이드로 간다", async () => {
    localStorage.clear();
    renderStarter();

    await userEvent.click(screen.getByRole("button", { name: "집중 시작" }));

    const guide = await screen.findByTestId("guide-probe");
    expect(guide).toHaveTextContent("/session-guide?userId=7");
    expect(guide).toHaveAttribute("data-state", JSON.stringify({ source: "ranking_card" }));
    expect(requestSessionStart).not.toHaveBeenCalled();
    expect(analytics.trackFocusStartTapped).not.toHaveBeenCalled();
  });

  it("신원이 없으면 가이드 없이 바로 시작한다", async () => {
    localStorage.clear();
    vi.mocked(requestSessionStart).mockResolvedValue("web");
    renderStarter(null);

    await userEvent.click(screen.getByRole("button", { name: "집중 시작" }));

    expect(screen.queryByTestId("guide-probe")).not.toBeInTheDocument();
    expect(requestSessionStart).toHaveBeenCalledWith(null, expect.any(Function));
  });

  it("누르면 출처를 남기고 세션 시작을 요청한다", async () => {
    vi.mocked(requestSessionStart).mockResolvedValue("web");
    renderStarter();

    await userEvent.click(screen.getByRole("button", { name: "집중 시작" }));

    expect(analytics.trackFocusStartTapped).toHaveBeenCalledWith("ranking_card");
    expect(requestSessionStart).toHaveBeenCalledWith(7, expect.any(Function));
  });

  it("웹에서 시작하면 쿼리를 지킨 채 세션 화면으로 간다", async () => {
    vi.mocked(requestSessionStart).mockImplementation(async (_userId, navigateToRoom) => {
      navigateToRoom();
      return "web";
    });
    renderStarter();

    await userEvent.click(screen.getByRole("button", { name: "집중 시작" }));

    expect((await screen.findByTestId("room-probe")).textContent).toBe("/room/1?userId=7");
  });

  it("처리 중에는 다시 눌러도 한 번만 시작한다", async () => {
    vi.mocked(requestSessionStart).mockReturnValue(new Promise(() => {}));
    renderStarter();
    const button = screen.getByRole("button", { name: "집중 시작" });

    await userEvent.click(button);
    await userEvent.click(button);

    expect(requestSessionStart).toHaveBeenCalledTimes(1);
  });

  it("누르는 순간 medium 햅틱을 한 번 울리고 처리 중 재탭에는 울리지 않는다", async () => {
    vi.mocked(requestSessionStart).mockReturnValue(new Promise(() => {}));
    renderStarter();
    const button = screen.getByRole("button", { name: "집중 시작" });

    await userEvent.click(button);
    await userEvent.click(button);

    expect(haptic).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledWith("medium");
  });

  it("세션 시작이 실패해도 잠금이 풀려 다시 누를 수 있다", async () => {
    vi.mocked(requestSessionStart).mockRejectedValueOnce(new Error("network"));
    vi.mocked(requestSessionStart).mockResolvedValueOnce("web");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    renderStarter();
    const button = screen.getByRole("button", { name: "집중 시작" });

    await userEvent.click(button);
    await userEvent.click(button);

    expect(requestSessionStart).toHaveBeenCalledTimes(2);
  });
});
