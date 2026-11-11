import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as amplitude from "@/lib/amplitude";
import type * as userIdModule from "@/lib/userId";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { __resetAppPointsGatewayForTests } from "@/features/points/gateway/appPointsGateway";
import { __resetPointsForTests } from "@/lib/pointsCapability";
import { SettingsPage } from "@/routes/SettingsPage";

vi.mock("@/features/app-lock/appLockCapability", () => ({ hasAppLockCapability: () => false }));
vi.mock("@/lib/interviewApi", () => ({
  getInterviewStatus: vi.fn().mockResolvedValue({
    cardEligible: false,
    cardUrl: null,
    settingsEnabled: false,
    settingsUrl: null,
  }),
}));
vi.mock("@/lib/userId", async (original) => ({
  ...(await original<typeof userIdModule>()),
  useUserId: () => 7,
}));
const track = vi.hoisted(() => vi.fn());
vi.mock("@/lib/amplitude", async (original) => ({
  ...(await original<typeof amplitude>()),
  trackSettingsRowPressed: track,
}));

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderSettings(flag: boolean, search = "/?points=1&pointsMock=default") {
  window.history.replaceState(null, "", flag ? search : "/");
  __resetPointsForTests();
  __resetAppPointsGatewayForTests();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/settings"]}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/points/history" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
  __resetPointsForTests();
  __resetAppPointsGatewayForTests();
});

describe("설정의 포인트 기록 줄", () => {
  it("플래그가 켜지면 프로필 묶음에 잔액과 함께 보이고 누르면 기록으로 간다", async () => {
    renderSettings(true);
    const row = await screen.findByRole("button", { name: "포인트 기록, 1,240P" });
    await userEvent.click(row);
    expect(track).toHaveBeenCalledWith("points_history");
    expect(await screen.findByTestId("where")).toHaveTextContent("/points/history");
  });

  it("플래그가 꺼지면 줄이 없다", () => {
    renderSettings(false);
    expect(screen.queryByRole("button", { name: /포인트 기록/ })).not.toBeInTheDocument();
  });

  it("기록이 없는 실제 경계에서는 줄도 잔액 조회도 없다", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      renderSettings(true, "/?points=1");
      expect(await screen.findByRole("button", { name: /프로필/ })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /포인트 기록/ })).not.toBeInTheDocument();
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/api/points"))).toBe(
        false,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
