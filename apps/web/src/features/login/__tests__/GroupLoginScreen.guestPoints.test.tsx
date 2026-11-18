import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as NativeSocialLogin from "@/lib/nativeSocialLogin";

import { GroupLoginScreen } from "../GroupLoginScreen";
import { useGuestPointsAtRisk } from "../useGuestPointsAtRisk";

vi.mock("@/lib/nativeSocialLogin", async (importOriginal) => ({
  ...(await importOriginal<typeof NativeSocialLogin>()),
  nativeSocialLoginProviders: vi.fn(() => ["GOOGLE", "KAKAO", "APPLE"]),
  requestNativeSocialLogin: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("../useGuestPointsAtRisk", () => ({ useGuestPointsAtRisk: vi.fn(() => null) }));

afterEach(() => {
  vi.clearAllMocks();
  vi.mocked(useGuestPointsAtRisk).mockReturnValue(null);
});

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/settings/login"]}>
        <GroupLoginScreen entry="settings" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("GroupLoginScreen 비회원 포인트 안내", () => {
  it("모은 포인트가 있으면 잔액과 가입·로그인 차이를 알리는 카드를 보인다", () => {
    vi.mocked(useGuestPointsAtRisk).mockReturnValue(120);
    renderScreen();

    expect(screen.getByRole("heading", { name: "지금 120P를 모았어요" })).toBeInTheDocument();
    expect(
      screen.getByText("처음 가입하면 그대로 이어지고, 이미 있는 계정으로 로그인하면 사라져요"),
    ).toBeInTheDocument();
  });

  it("모은 포인트가 없으면 카드를 보이지 않는다", () => {
    renderScreen();

    expect(screen.queryByText(/를 모았어요/)).not.toBeInTheDocument();
  });
});
