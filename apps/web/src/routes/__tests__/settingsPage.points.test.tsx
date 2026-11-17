import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as amplitude from "@/lib/amplitude";
import type * as userIdModule from "@/lib/userId";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetAppPointsGatewayForTests,
  appPointsGateway,
} from "@/features/points/gateway/appPointsGateway";
import { ApiError } from "@/lib/api";
import { __resetPointsForTests } from "@/lib/pointsCapability";
import { getProfile } from "@/lib/profileApi";
import { showToast } from "@/lib/toast";
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
vi.mock("@/lib/profileApi", () => ({ getProfile: vi.fn() }));
vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
const track = vi.hoisted(() => vi.fn());
vi.mock("@/lib/amplitude", async (original) => ({
  ...(await original<typeof amplitude>()),
  trackSettingsRowPressed: track,
}));

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderSettings(
  flag: boolean,
  search = "/?points=1&pointsMock=default",
  /** 경계를 새로 고른 뒤 화면을 그리기 전에 가짜 응답을 바꾼다. */
  arrange: () => void = () => {},
) {
  window.history.replaceState(null, "", flag ? search : "/");
  __resetPointsForTests();
  __resetAppPointsGatewayForTests();
  arrange();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/settings"]}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/points/history" element={<Where />} />
          <Route path="/settings/login" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function signIn(loginProvider: "KAKAO" | null) {
  vi.mocked(getProfile).mockResolvedValue({
    nickname: "열공곰",
    goal: null,
    category: null,
    initial: "열",
    colorIndex: 0,
    profileImageUrl: null,
    loginProvider,
  });
}

beforeEach(() => {
  signIn("KAKAO");
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
  __resetPointsForTests();
  __resetAppPointsGatewayForTests();
  vi.mocked(showToast).mockClear();
  vi.mocked(getProfile).mockReset();
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

  it("실제 경계에서도 줄이 보이고 잔액을 API로 받는다", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ balance: 300 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      renderSettings(true, "/?points=1");
      expect(await screen.findByRole("button", { name: "포인트 기록, 300P" })).toBeInTheDocument();
      expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/api/points"))).toBe(
        true,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("설정의 구매 복원 줄", () => {
  const restoreRow = () => screen.findByRole("button", { name: "구매 복원" });

  it("회원이고 복원을 맡을 수 있는 앱이면 포인트 기록 줄 바로 아래에 보인다", async () => {
    renderSettings(true);
    const row = await restoreRow();
    const buttons = screen.getAllByRole("button");
    const history = buttons.findIndex((button) => button.textContent?.includes("포인트 기록"));
    expect(history).toBeGreaterThan(-1);
    expect(buttons[history + 1]).toBe(row);
  });

  it.each([
    ["restored", "구매한 상품을 다시 불러왔어요"],
    ["nothing", "복원할 상품이 없어요"],
    ["failed", "잠시 후 다시 시도해 주세요"],
  ] as const)("앱의 복원 결과 %s를 한 번 알린다", async (status, message) => {
    renderSettings(true);
    const restore = vi.spyOn(appPointsGateway(), "restorePurchases").mockResolvedValue(status);

    await userEvent.click(await restoreRow());

    await vi.waitFor(() => expect(showToast).toHaveBeenCalledWith(message));
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it("복원이 끝나기 전에 다시 눌러도 요청은 한 번만 나간다", async () => {
    renderSettings(true);
    let finish: (status: "restored") => void = () => {};
    const restore = vi
      .spyOn(appPointsGateway(), "restorePurchases")
      .mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    const row = await restoreRow();

    await userEvent.click(row);
    await userEvent.click(row);
    finish("restored");

    await vi.waitFor(() => expect(showToast).toHaveBeenCalledTimes(1));
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it("비회원에게도 줄이 보이고 누르면 복원하지 않고 로그인 화면으로 간다", async () => {
    signIn(null);
    renderSettings(true);
    const restore = vi.spyOn(appPointsGateway(), "restorePurchases");

    await userEvent.click(await restoreRow());

    expect(await screen.findByTestId("where")).toHaveTextContent("/settings/login");
    expect(restore).not.toHaveBeenCalled();
  });

  it("서버가 비회원에게 포인트 조회를 거절하면 포인트 기록 줄과 함께 줄이 없다", async () => {
    signIn(null);
    // 잔액 조회가 회원 전용으로 거절되면 포인트 입구를 모두 숨긴다.
    const balance = vi.fn().mockRejectedValue(new ApiError("member only", 403, "MEMBER_ONLY"));
    renderSettings(true, undefined, () => {
      vi.spyOn(appPointsGateway(), "getBalance").mockImplementation(balance);
    });
    await vi.waitFor(() => expect(balance).toHaveBeenCalled());
    await vi.waitFor(() =>
      expect(screen.queryByRole("button", { name: /포인트 기록/ })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "구매 복원" })).not.toBeInTheDocument();
  });

  it("복원을 맡을 수 없는 곳에서는 줄이 없다", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ balance: 300 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      renderSettings(true, "/?points=1");
      await screen.findByRole("button", { name: /포인트 기록/ });
      expect(screen.queryByRole("button", { name: "구매 복원" })).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("포인트가 꺼져 있으면 줄이 없다", () => {
    renderSettings(false);
    expect(screen.queryByRole("button", { name: "구매 복원" })).not.toBeInTheDocument();
  });
});
