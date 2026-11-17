import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetAppPointsGatewayForTests,
  appPointsGateway,
} from "@/features/points/gateway/appPointsGateway";
import { ApiError } from "@/lib/api";
import { isNativeBridgeAvailable } from "@/lib/bridge";
import type * as Bridge from "@/lib/bridge";
import { __resetPointsForTests } from "@/lib/pointsCapability";
import { getProfile } from "@/lib/profileApi";
import { profileKeys } from "@/lib/profileQueries";

import { PointsAccessoriesPage } from "../PointsAccessoriesPage";
import { PointsBackgroundsPage } from "../PointsBackgroundsPage";
import { PointsLoginPage } from "../PointsLoginPage";
import { PointsMascotsPage } from "../PointsMascotsPage";
import { PointsPage } from "../PointsPage";

vi.mock("@/lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof Bridge>()),
  isNativeBridgeAvailable: vi.fn(() => true),
}));
vi.mock("@/lib/profileApi", () => ({ getProfile: vi.fn() }));
vi.mock("@/features/login/GroupLoginScreen", () => ({
  GroupLoginScreen: ({ entry }: { entry: string }) => <p>로그인 화면 {entry}</p>,
}));

const PROFILE = {
  nickname: "열공곰",
  goal: null,
  category: null,
  initial: "열",
  colorIndex: 0,
  profileImageUrl: null,
};

function signIn(loginProvider: "KAKAO" | null) {
  vi.mocked(getProfile).mockResolvedValue({ ...PROFILE, loginProvider });
}

/** 지나간 주소를 차례로 모은다. */
function PathLog({ into }: { into: string[] }) {
  const { pathname } = useLocation();
  useEffect(() => {
    into.push(pathname);
  }, [pathname, into]);
  return null;
}

/** 주소의 가짜 경계를 쓰는 포인트 화면들을 한 라우터에 올린다. */
function renderAt(...entries: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const visited: string[] = [];
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <PathLog into={visited} />
        <Routes>
          <Route path="/points" element={<PointsPage />} />
          <Route path="/points/accessories" element={<PointsAccessoriesPage />} />
          <Route path="/points/backgrounds" element={<PointsBackgroundsPage />} />
          <Route path="/points/mascots" element={<PointsMascotsPage />} />
          <Route path="/points/login" element={<PointsLoginPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { client, visited };
}

const loginScreen = () => screen.findByText("로그인 화면 points");

beforeEach(() => {
  window.history.replaceState(null, "", "/?points=1&pointsMock=default");
  __resetPointsForTests();
  __resetAppPointsGatewayForTests();
  vi.mocked(isNativeBridgeAvailable).mockReturnValue(true);
  signIn(null);
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
  __resetPointsForTests();
  __resetAppPointsGatewayForTests();
  vi.mocked(getProfile).mockReset();
  vi.restoreAllMocks();
});

describe("비회원의 포인트 화면", () => {
  it("서버가 조회를 열어 주면 로그인 없이 상점과 잔액을 본다", async () => {
    renderAt("/points?userId=7");
    expect(await screen.findByRole("tab", { name: "꾸미기 상점" })).toBeInTheDocument();
    expect(await screen.findByText("1,240P")).toBeInTheDocument();
    expect(screen.queryByText("로그인 화면 points")).not.toBeInTheDocument();
  });

  it("서버가 조회를 회원 전용이라고 거절하면 상점 대신 로그인 화면을 그린다", async () => {
    vi.spyOn(appPointsGateway(), "getBalance").mockRejectedValue(
      new ApiError("member only", 403, "MEMBER_ONLY"),
    );
    renderAt("/points?userId=7");
    expect(await loginScreen()).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("잔액을 받기 전에는 상점도 로그인 화면도 그리지 않는다", () => {
    vi.spyOn(appPointsGateway(), "getBalance").mockReturnValue(new Promise(() => undefined));
    renderAt("/points?userId=7");
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByText("로그인 화면 points")).not.toBeInTheDocument();
  });

  it("소품을 눌러 미리 입혀 보는 것은 로그인 없이 된다", async () => {
    renderAt("/points/accessories?userId=7");
    const raincoat = await screen.findByRole("button", { name: /우비 모자/ });
    await userEvent.click(raincoat);
    expect(raincoat).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("로그인 화면 points")).not.toBeInTheDocument();
  });

  it("포인트로 구매를 누르면 확인 창 대신 로그인 화면으로 간다", async () => {
    const purchase = vi.spyOn(appPointsGateway(), "purchase");
    renderAt("/points/accessories?userId=7");
    await userEvent.click(await screen.findByRole("button", { name: "600P로 구매" }));
    expect(await loginScreen()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "구매하기" })).not.toBeInTheDocument();
    expect(purchase).not.toHaveBeenCalled();
  });

  it("가진 소품을 착용하려고 하면 로그인 화면으로 간다", async () => {
    const equip = vi.spyOn(appPointsGateway(), "equipAccessory");
    renderAt("/points/accessories?userId=7&item=acc-stopwatch-ribbon");
    await userEvent.click(await screen.findByRole("button", { name: "착용하기" }));
    expect(await loginScreen()).toBeInTheDocument();
    expect(equip).not.toHaveBeenCalled();
  });

  it("타이머 배경을 사려고 하면 로그인 화면으로 간다", async () => {
    const purchase = vi.spyOn(appPointsGateway(), "purchase");
    renderAt("/points/backgrounds?userId=7");
    await userEvent.click(await screen.findByRole("button", { name: /P로 구매$/ }));
    expect(await loginScreen()).toBeInTheDocument();
    expect(purchase).not.toHaveBeenCalled();
  });

  it("마스코트를 고르려고 하면 로그인 화면으로 간다", async () => {
    const select = vi.spyOn(appPointsGateway(), "selectMascot");
    renderAt("/points/mascots?userId=7");
    await userEvent.click(await screen.findByRole("button", { name: "플래니 선택 가능" }));
    expect(await loginScreen()).toBeInTheDocument();
    expect(select).not.toHaveBeenCalled();
  });

  it("새로 열린 마스코트의 축하 화면은 로그인한 뒤에 보이도록 비회원에게는 띄우지 않는다", async () => {
    window.history.replaceState(null, "", "/?points=1&pointsMock=newMascot");
    __resetAppPointsGatewayForTests();
    const seen = vi.spyOn(appPointsGateway(), "markUnlocksSeen");
    renderAt("/points/mascots?userId=7");
    expect(await screen.findByText("누적 순공")).toBeInTheDocument();
    expect(screen.queryByText("새 캐릭터")).not.toBeInTheDocument();
    expect(seen).not.toHaveBeenCalled();
  });

  describe("포인트 받기 탭", () => {
    it("무엇으로 얼마를 받는지는 로그인 없이 본다", async () => {
      renderAt("/points?userId=7&tab=earn");
      expect(await screen.findByText("출석")).toBeInTheDocument();
      expect(screen.getByText("광고 보기")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "포인트 충전" })).toBeInTheDocument();
    });

    it("메달 포인트 받기를 누르면 받지 않고 로그인 화면으로 간다", async () => {
      const claim = vi.spyOn(appPointsGateway(), "claim");
      renderAt("/points?userId=7&tab=earn");
      await userEvent.click(await screen.findByRole("button", { name: /P 받기$/ }));
      expect(await loginScreen()).toBeInTheDocument();
      expect(claim).not.toHaveBeenCalled();
    });

    it("광고 보기를 누르면 광고를 띄우지 않고 로그인 화면으로 간다", async () => {
      const watchAd = vi.spyOn(appPointsGateway(), "watchAd");
      renderAt("/points?userId=7&tab=earn");
      await userEvent.click(await screen.findByRole("button", { name: /^보기/ }));
      expect(await loginScreen()).toBeInTheDocument();
      expect(watchAd).not.toHaveBeenCalled();
    });

    it("충전 묶음을 누르면 결제를 열지 않고 로그인 화면으로 간다", async () => {
      const charge = vi.spyOn(appPointsGateway(), "charge");
      renderAt("/points?userId=7&tab=earn");
      await userEvent.click(await screen.findByRole("button", { name: /500P 충전/ }));
      expect(await loginScreen()).toBeInTheDocument();
      expect(charge).not.toHaveBeenCalled();
    });
  });
});

describe("포인트 로그인 화면", () => {
  it("로그인해서 회원이 되면 보던 화면으로 돌아간다", async () => {
    // 앞 화면이 있는 것처럼 두어 뒤로 가기가 앞 주소로 돌아가게 한다.
    window.history.replaceState({ idx: 1 }, "", "/?points=1&pointsMock=default");
    const { client } = renderAt("/points/accessories?userId=7", "/points/login?userId=7");
    expect(await loginScreen()).toBeInTheDocument();

    signIn("KAKAO");
    await client.invalidateQueries({ queryKey: profileKeys.all });

    expect(await screen.findByRole("button", { name: "600P로 구매" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("로그인 화면 points")).not.toBeInTheDocument());
  });
});

describe("회원인데 서버가 회원 전용이라고 거절할 때", () => {
  it("구매 요청이 거절되면 로그인 화면으로 간다", async () => {
    signIn("KAKAO");
    vi.spyOn(appPointsGateway(), "purchase").mockRejectedValue(
      new ApiError("member only", 403, "MEMBER_ONLY"),
    );
    const { visited } = renderAt("/points/accessories?userId=7");
    await userEvent.click(await screen.findByRole("button", { name: "600P로 구매" }));
    await userEvent.click(await screen.findByRole("button", { name: "구매하기" }));
    // 로그인 화면은 이미 회원이면 그리자마자 보던 화면으로 돌아가서 화면 글자로는 잡히다 말다 한다.
    // 그래서 로그인 주소로 갔는지만 본다.
    await waitFor(() => expect(visited).toContain("/points/login"));
  });
});
