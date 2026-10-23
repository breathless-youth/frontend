import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { App } from "@/App";

vi.mock("@/routes/HomeTabPage", () => ({
  HomeTabPage: function HomeProbe() {
    const location = useLocation();
    const navigate = useNavigate();
    return (
      <>
        <div data-testid="home-probe">{location.pathname + location.search}</div>
        <button type="button" onClick={() => navigate(-1)}>
          뒤로
        </button>
      </>
    );
  },
}));
vi.mock("@/routes/RankingPage", () => ({
  RankingPage: () => <div data-testid="ranking-probe" />,
}));

describe("/onboarding-guide 리다이렉트", () => {
  it("예전 가이드 주소는 entry만 빼고 쿼리를 지킨 채 홈으로 간다", async () => {
    render(
      <MemoryRouter initialEntries={["/onboarding-guide?userId=7&entry=focus-start"]}>
        <App />
      </MemoryRouter>,
    );

    expect((await screen.findByTestId("home-probe")).textContent).toBe("/home?userId=7");
  });

  it("entry만 있으면 쿼리 없이 홈으로 간다", async () => {
    render(
      <MemoryRouter initialEntries={["/onboarding-guide?entry=settings"]}>
        <App />
      </MemoryRouter>,
    );

    expect((await screen.findByTestId("home-probe")).textContent).toBe("/home");
  });

  it("쿼리 없이 열어도 홈으로 간다", async () => {
    render(
      <MemoryRouter initialEntries={["/onboarding-guide"]}>
        <App />
      </MemoryRouter>,
    );

    expect((await screen.findByTestId("home-probe")).textContent).toBe("/home");
  });

  it("기록을 바꿔치기해 뒤로 가면 가이드 주소를 건너뛴다", async () => {
    render(
      <MemoryRouter initialEntries={["/ranking", "/onboarding-guide?userId=7"]} initialIndex={1}>
        <App />
      </MemoryRouter>,
    );

    await screen.findByTestId("home-probe");
    await userEvent.click(screen.getByRole("button", { name: "뒤로" }));

    expect(await screen.findByTestId("ranking-probe")).toBeTruthy();
  });
});
