import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runFocusStartFlow } from "@/features/onboarding/focusStartFlow";
import { useFocusStart } from "@/features/onboarding/useFocusStart";
import type * as Amplitude from "@/lib/amplitude";
import { requestSessionStart } from "@/lib/sessionStart";

vi.mock("@/features/onboarding/focusStartFlow", () => ({ runFocusStartFlow: vi.fn() }));
vi.mock("@/lib/sessionStart", () => ({ requestSessionStart: vi.fn() }));
const analytics = vi.hoisted(() => ({ trackFocusStartTapped: vi.fn() }));
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackFocusStartTapped: analytics.trackFocusStartTapped,
}));
const haptic = vi.hoisted(() => vi.fn());
vi.mock("@/lib/haptics", () => ({ haptic }));

afterEach(() => vi.clearAllMocks());

function Starter() {
  const startFocus = useFocusStart(7);
  return (
    <button type="button" onClick={() => startFocus("ranking_card")}>
      집중 시작
    </button>
  );
}

function GuideProbe() {
  const { pathname, search } = useLocation();
  return <p>{`${pathname}${search}`}</p>;
}

function renderStarter() {
  render(
    <MemoryRouter initialEntries={["/ranking?userId=7"]}>
      <Routes>
        <Route path="/ranking" element={<Starter />} />
        <Route path="/onboarding-guide" element={<GuideProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("useFocusStart", () => {
  it("가이드를 안 봤으면 쿼리를 지킨 채 가이드로 가고 출처를 남긴다", async () => {
    vi.mocked(runFocusStartFlow).mockImplementation(async (nav) => {
      nav.openOnboardingGuide("focus-start");
    });
    renderStarter();

    await userEvent.click(screen.getByRole("button", { name: "집중 시작" }));

    expect(analytics.trackFocusStartTapped).toHaveBeenCalledWith("guide", "ranking_card");
    expect(
      await screen.findByText("/onboarding-guide?userId=7&entry=focus-start"),
    ).toBeInTheDocument();
  });

  it("세션을 시작하면 출처를 남기고 세션 시작을 요청한다", async () => {
    vi.mocked(runFocusStartFlow).mockImplementation(async (nav) => {
      await nav.startSession();
    });
    renderStarter();

    await userEvent.click(screen.getByRole("button", { name: "집중 시작" }));

    expect(analytics.trackFocusStartTapped).toHaveBeenCalledWith("session", "ranking_card");
    expect(requestSessionStart).toHaveBeenCalledWith(7, expect.any(Function));
  });

  it("처리 중에는 다시 눌러도 한 번만 시작한다", async () => {
    vi.mocked(runFocusStartFlow).mockReturnValue(new Promise(() => {}));
    renderStarter();
    const button = screen.getByRole("button", { name: "집중 시작" });

    await userEvent.click(button);
    await userEvent.click(button);

    expect(runFocusStartFlow).toHaveBeenCalledTimes(1);
  });

  it("누르는 순간 medium 햅틱을 한 번 울리고 처리 중 재탭에는 울리지 않는다", async () => {
    vi.mocked(runFocusStartFlow).mockReturnValue(new Promise(() => {}));
    renderStarter();
    const button = screen.getByRole("button", { name: "집중 시작" });

    await userEvent.click(button);
    await userEvent.click(button);

    expect(haptic).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledWith("medium");
  });
});
