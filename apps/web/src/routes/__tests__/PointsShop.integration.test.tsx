import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakePointsGateway } from "@/features/points/gateway/createFakePointsGateway";
import type { PointsGateway } from "@/features/points/gateway/PointsGateway";
import { PointsGatewayProvider } from "@/features/points/gateway/PointsGatewayContext";
import type { PointsScene } from "@/features/points/fixtures";
import type { ChargeResult } from "@/features/points/types";
import { isNativeBridgeAvailable } from "@/lib/bridge";
import type * as Bridge from "@/lib/bridge";
import { getProfile } from "@/lib/profileApi";
import { __resetAppPointsGatewayForTests } from "@/features/points/gateway/appPointsGateway";
import { __resetPointsForTests } from "@/lib/pointsCapability";
import { pointsKeys } from "@/lib/pointsQueries";
import { showToast } from "@/lib/toast";

import { PointsAccessoriesPage } from "../PointsAccessoriesPage";
import { PointsPage } from "../PointsPage";

vi.mock("@/lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof Bridge>()),
  isNativeBridgeAvailable: vi.fn(() => true),
}));
vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/lib/profileApi", () => ({ getProfile: vi.fn() }));
vi.mock("@/features/login/GroupLoginScreen", () => ({
  GroupLoginScreen: () => <p>로그인 화면</p>,
}));

const USER = 1;
const CROWN = "acc-stopwatch-crown";

const PROFILE = {
  nickname: "열공곰",
  goal: null,
  category: null,
  initial: "열",
  colorIndex: 0,
  profileImageUrl: null,
};

function setFlag(on: boolean) {
  window.history.replaceState(null, "", on ? "/?points=1&pointsMock=default" : "/");
  __resetPointsForTests();
  __resetAppPointsGatewayForTests();
}

function renderWith(ui: ReactElement, path: string, gateway?: PointsGateway) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const routes = (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/points" element={ui} />
        <Route path="/points/accessories" element={ui} />
      </Routes>
    </MemoryRouter>
  );
  render(
    <QueryClientProvider client={client}>
      {gateway ? (
        <PointsGatewayProvider gateway={gateway} userId={USER}>
          {routes}
        </PointsGatewayProvider>
      ) : (
        routes
      )}
    </QueryClientProvider>,
  );
  return { client };
}

function fakeGateway(scene: PointsScene, balance: number) {
  return createFakePointsGateway(scene, { balance });
}

/** 잔액이 모자란 채로 왕관을 사려고 해서 모자람 창을 연다. */
async function openInsufficient(gateway: PointsGateway) {
  const view = renderWith(<PointsAccessoriesPage />, "/points/accessories", gateway);
  await userEvent.click(await screen.findByRole("button", { name: "600P로 구매" }));
  await screen.findByText(/왕관을 구매하려면/);
  return view;
}

beforeEach(() => {
  setFlag(true);
  vi.mocked(isNativeBridgeAvailable).mockReturnValue(true);
});

afterEach(() => {
  setFlag(false);
  vi.mocked(showToast).mockClear();
  vi.mocked(getProfile).mockReset();
});

describe("모자람 창의 충전", () => {
  it("충전을 연달아 눌러도 결제는 한 번만 부른다", async () => {
    const base = fakeGateway("default", 100);
    let finish: (result: ChargeResult) => void = () => {};
    const charge = vi.fn(
      () =>
        new Promise<ChargeResult>((resolve) => {
          finish = resolve;
        }),
    );
    await openInsufficient({ ...base, charge });
    const button = screen.getByRole("button", { name: "500P 충전하고 구매하기" });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(charge).toHaveBeenCalledOnce();
    finish({ status: "cancelled" });
    await waitFor(() => expect(showToast).toHaveBeenCalledWith("결제를 완료하지 못했어요"));
  });

  it("충전에 성공하면 그 상품까지 사서 입고, 잔액은 경계의 값과 같다", async () => {
    const gateway = fakeGateway("default", 100);
    const { client } = await openInsufficient(gateway);
    await userEvent.click(screen.getByRole("button", { name: "500P 충전하고 구매하기" }));

    expect(await screen.findByRole("status")).toHaveTextContent("왕관을 구매했어요!");
    await waitFor(() => expect(screen.getByRole("button", { name: "착용 중" })).toBeDisabled());
    expect(await gateway.getBalance()).toBe(0);
    expect(client.getQueryData(pointsKeys.balance(USER))).toBe(0);
    const crown = (await gateway.getShop()).items.find((item) => item.id === CROWN);
    expect(crown).toMatchObject({ owned: true, inUse: true });
  });

  it("충전은 됐는데 구매가 실패하면 채운 잔액은 두고 알린다", async () => {
    const base = fakeGateway("default", 100);
    const purchase = vi.fn(() => Promise.reject(new Error("purchase failed")));
    const { client } = await openInsufficient({ ...base, purchase });
    await userEvent.click(screen.getByRole("button", { name: "500P 충전하고 구매하기" }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith("잠시 후 다시 시도해 주세요"));
    expect(purchase).toHaveBeenCalledWith(CROWN);
    expect(client.getQueryData(pointsKeys.balance(USER))).toBe(600);
  });

  it("결제가 실패하면 안내가 뜨고 잔액은 그대로다", async () => {
    const gateway = fakeGateway("payFail", 100);
    const { client } = await openInsufficient(gateway);
    await userEvent.click(screen.getByRole("button", { name: "500P 충전하고 구매하기" }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith("결제를 완료하지 못했어요"));
    expect(client.getQueryData(pointsKeys.balance(USER))).toBe(100);
    expect(await gateway.getBalance()).toBe(100);
    expect(screen.getByRole("button", { name: "500P 충전하고 구매하기" })).toBeEnabled();
  });

  it("광고를 보면 잔액만 채우고 사지는 않는다", async () => {
    const gateway = fakeGateway("default", 100);
    const purchase = vi.spyOn(gateway, "purchase");
    const { client } = await openInsufficient(gateway);
    await userEvent.click(screen.getByRole("button", { name: /광고 보고 30P 받기/ }));

    await waitFor(() => expect(client.getQueryData(pointsKeys.balance(USER))).toBe(130));
    expect(purchase).not.toHaveBeenCalled();
  });

  it("앱 밖 브라우저에서는 광고와 충전 줄이 없다", async () => {
    vi.mocked(isNativeBridgeAvailable).mockReturnValue(false);
    await openInsufficient(fakeGateway("default", 100));
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).queryByText(/광고 보고/)).not.toBeInTheDocument();
    expect(within(sheet).queryByText(/충전하고 구매하기/)).not.toBeInTheDocument();
    expect(within(sheet).getByText("일일 미션 클리어하기")).toBeInTheDocument();
  });
});

describe("포인트 입구", () => {
  it("회원으로 확인되면 상점을 그린다", async () => {
    vi.mocked(getProfile).mockResolvedValue({ ...PROFILE, loginProvider: "KAKAO" });
    renderWith(<PointsPage />, "/points?userId=7");
    expect(await screen.findByRole("tab", { name: "꾸미기 상점" })).toBeInTheDocument();
    expect(screen.queryByText("로그인 화면")).not.toBeInTheDocument();
  });

  it("확인하는 동안은 로그인 화면도 상점도 그리지 않는다", () => {
    vi.mocked(getProfile).mockReturnValue(new Promise(() => undefined));
    renderWith(<PointsPage />, "/points?userId=7");
    expect(screen.queryByText("로그인 화면")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it.each([
    ["비회원", () => vi.mocked(getProfile).mockResolvedValue({ ...PROFILE, loginProvider: null })],
    ["로그인 공급자를 모름", () => vi.mocked(getProfile).mockResolvedValue({ ...PROFILE })],
    ["프로필을 받지 못함", () => vi.mocked(getProfile).mockRejectedValue(new Error("down"))],
  ])("%s이면 로그인 화면을 그린다", async (_, arrange) => {
    arrange();
    renderWith(<PointsPage />, "/points?userId=7");
    expect(await screen.findByText("로그인 화면")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("신원이 없으면 로그인 화면을 그린다", () => {
    renderWith(<PointsPage />, "/points");
    expect(screen.getByText("로그인 화면")).toBeInTheDocument();
  });
});
