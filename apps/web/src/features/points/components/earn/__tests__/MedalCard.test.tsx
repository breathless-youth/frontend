import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EarnToday, MedalReward } from "../../../types";
import { MedalCard } from "../MedalCard";

afterEach(() => {
  vi.unstubAllGlobals();
});

const RATES: EarnToday["medalRates"] = {
  daily: { gold: 30, silver: 20, bronze: 10 },
  weekly: { gold: 100, silver: 60, bronze: 30 },
  monthly: { gold: 300, silver: 200, bronze: 100 },
};

function medal(rank: MedalReward["rank"], period: MedalReward["period"], reward: number) {
  return { rank, period, reward };
}

function Probe() {
  const { pathname, search } = useLocation();
  return <p data-testid="location">{`${pathname}${search}`}</p>;
}

function renderCard(medals: MedalReward[], pending = false) {
  const onClaim = vi.fn();
  const card = <MedalCard medals={medals} rates={RATES} pending={pending} onClaim={onClaim} />;
  render(
    <MemoryRouter initialEntries={["/points?tab=earn"]}>
      <Routes>
        <Route
          path="/points"
          element={
            <>
              {card}
              <Probe />
            </>
          }
        />
        <Route path="/ranking" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
  return { onClaim };
}

function sentToNative(postMessage: ReturnType<typeof vi.fn>) {
  return postMessage.mock.calls.map(
    ([raw]) => JSON.parse(raw as string) as Record<string, unknown>,
  );
}

/** 금·은·동 칸마다 화면 낭독기가 읽는 개수 */
const counts = () =>
  [1, 2, 3].map((rank) => screen.getByText(new RegExp(`^${rank}위 메달 \\d+개$`)).textContent);
/** 금·은·동 칸마다 화면에 보이는 개수 */
const shown = () => screen.getAllByText(/^×/).map((node) => node.textContent);

describe("MedalCard", () => {
  it("받을 메달이 없으면 세 칸 모두 0개로 두고 받기 대신 랭킹으로 가는 버튼을 둔다", () => {
    renderCard([]);

    expect(screen.getByText("새 랭킹 메달이 없어요")).toBeInTheDocument();
    expect(shown()).toEqual(["×0", "×0", "×0"]);
    expect(counts()).toEqual(["1위 메달 0개", "2위 메달 0개", "3위 메달 0개"]);
    expect(screen.getByRole("button", { name: "랭킹 ›" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /받기/ })).not.toBeInTheDocument();
  });

  it("앱에서 랭킹을 누르면 셸에 랭킹 탭 전환을 맡기고 홈 탭 웹뷰의 주소는 그대로 둔다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    renderCard([]);

    const ranking = screen.getByRole("button", { name: "랭킹 ›" });
    fireEvent.click(ranking);
    fireEvent.click(ranking);

    // 26.47.0 셸이 아는 발신처 중 이 카드에 맞는 값이 없어 via는 싣지 않는다.
    expect(sentToNative(postMessage)).toEqual([
      { type: "navigate-tab", tab: "ranking", atMs: expect.any(Number) as number },
    ]);
    expect(screen.getByTestId("location")).toHaveTextContent("/points?tab=earn");
  });

  it("브라우저에서 랭킹을 누르면 웹 라우터로 랭킹 화면에 간다", () => {
    renderCard([]);

    fireEvent.click(screen.getByRole("button", { name: "랭킹 ›" }));

    expect(screen.getByTestId("location")).toHaveTextContent(/^\/ranking$/);
  });

  it("메달이 하나면 그 순위만 1개로 세고 그 포인트를 받는 버튼을 둔다", () => {
    const { onClaim } = renderCard([medal(1, "DAILY", 30)]);

    expect(screen.getByText("랭킹 메달")).toBeInTheDocument();
    expect(shown()).toEqual(["×1", "×0", "×0"]);
    expect(screen.queryByRole("button", { name: "랭킹 ›" })).not.toBeInTheDocument();
    screen.getByRole("button", { name: "+30P 받기" }).click();
    expect(onClaim).toHaveBeenCalledOnce();
  });

  it("기간이 섞인 메달은 순위별로 세고 받기 버튼은 모두 더한 포인트다", () => {
    renderCard([
      medal(1, "DAILY", 30),
      medal(3, "WEEKLY", 30),
      medal(1, "MONTHLY", 300),
      medal(2, "DAILY", 20),
    ]);

    expect(shown()).toEqual(["×2", "×1", "×1"]);
    expect(counts()).toEqual(["1위 메달 2개", "2위 메달 1개", "3위 메달 1개"]);
    expect(screen.getByRole("button", { name: "+380P 받기" })).toBeInTheDocument();
  });

  it("99개를 넘으면 99+로 줄여 보이고 화면 낭독기에는 실제 개수를 읽는다", () => {
    renderCard(Array.from({ length: 120 }, () => medal(1, "DAILY", 30)));

    expect(shown()).toEqual(["×99+", "×0", "×0"]);
    expect(counts()[0]).toBe("1위 메달 120개");
    expect(screen.getByRole("button", { name: "+3,600P 받기" })).toBeInTheDocument();
  });

  it("받는 중에는 받기 버튼을 누를 수 없다", () => {
    renderCard([medal(2, "WEEKLY", 60)], true);

    expect(screen.getByRole("button", { name: "+60P 받기" })).toBeDisabled();
  });

  it("메달별 포인트 표는 안내 버튼을 누를 때만 뜬다", async () => {
    renderCard([medal(1, "DAILY", 30)]);

    expect(screen.queryByText("월간")).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "메달별 포인트 안내" });
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);

    const month = await screen.findByText("월간", { selector: "[data-state] *" });
    const table = month.closest("[data-state]") as HTMLElement;
    expect(within(table).getByText("300P")).toBeInTheDocument();
  });
});
