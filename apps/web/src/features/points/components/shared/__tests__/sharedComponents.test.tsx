import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { buildPointsFixture } from "../../../fixtures";
import type { ShopItem } from "../../../types";
import { InsufficientPointsSheet } from "../InsufficientPointsSheet";
import { MascotImage } from "../MascotImage";
import { PointsBalancePill } from "../PointsBalancePill";
import { PointsScreenFrame } from "../PointsScreenFrame";
import { PurchaseConfirmSheet } from "../PurchaseConfirmSheet";

const fixture = buildPointsFixture("default");
const crown = fixture.items.find((it) => it.id === "acc-stopwatch-crown") as ShopItem;

describe("PointsBalancePill", () => {
  it("잔액을 쉼표와 P로 보인다", () => {
    render(<PointsBalancePill size="screen" balance={1240} />);
    expect(screen.getByText("1,240P")).toBeInTheDocument();
  });

  it("누를 수 있으면 잔액을 이름으로 단 버튼이다", async () => {
    const onPress = vi.fn();
    render(<PointsBalancePill size="home" balance={1240} onPress={onPress} />);
    await userEvent.click(screen.getByRole("button", { name: "보유 포인트 1,240P" }));
    expect(onPress).toHaveBeenCalledOnce();
  });

  it("잔액을 모르면 숫자 대신 줄표를 보인다", () => {
    render(<PointsBalancePill size="screen" balance={undefined} />);
    expect(screen.getByText("–P")).toBeInTheDocument();
  });
});

describe("MascotImage", () => {
  it("잠긴 마스코트는 잠겼다고 읽힌다", () => {
    render(<MascotImage id="lamp" locked size={50} />);
    expect(screen.getByRole("img", { name: "잠긴 램프 마스코트" })).toBeInTheDocument();
  });
});

describe("PointsScreenFrame", () => {
  it("제목과 오른쪽 위 잔액 알약을 그린다", () => {
    render(
      <MemoryRouter>
        <PointsScreenFrame title="타이머 배경" onBack={() => {}} balance={640}>
          <p>본문</p>
        </PointsScreenFrame>
      </MemoryRouter>,
    );
    expect(screen.getByText("타이머 배경")).toBeInTheDocument();
    expect(screen.getByText("640P")).toBeInTheDocument();
    expect(screen.getByText("본문")).toBeInTheDocument();
  });
});

describe("PurchaseConfirmSheet", () => {
  it("가격과 구매 후 포인트, 구매 버튼을 보인다", async () => {
    const onConfirm = vi.fn();
    render(
      <PurchaseConfirmSheet
        open
        item={crown}
        balance={1240}
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    );
    expect(await screen.findByText("왕관을 구매할까요?")).toBeInTheDocument();
    expect(screen.getByText("600P")).toBeInTheDocument();
    expect(screen.getByText("구매 후 포인트")).toBeInTheDocument();
    expect(screen.getByText("640P")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "구매하기" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("사는 중에는 구매 버튼을 막는다", async () => {
    render(
      <PurchaseConfirmSheet
        open
        pending
        item={crown}
        balance={1240}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    expect(await screen.findByRole("button", { name: "구매하기" })).toBeDisabled();
  });
});

describe("InsufficientPointsSheet", () => {
  function renderSheet(watched: number) {
    const handlers = {
      onWatchAd: vi.fn(),
      onMissions: vi.fn(),
      onCharge: vi.fn(),
      onClose: vi.fn(),
    };
    render(
      <InsufficientPointsSheet
        open
        item={crown}
        balance={480}
        earn={{ ...fixture.earn, ad: { ...fixture.earn.ad, watched } }}
        packs={fixture.packs}
        {...handlers}
      />,
    );
    return handlers;
  }

  it("모자란 포인트와 받을 길을 보인다", async () => {
    const handlers = renderSheet(1);
    expect(await screen.findByText("왕관을 구매하려면 120P가 더 필요해요")).toBeInTheDocument();
    expect(screen.getByText("오늘 2번 더 받을 수 있어요")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /광고 보고 30P 받기/ }));
    expect(handlers.onWatchAd).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: /일일 미션 클리어하기/ }));
    expect(handlers.onMissions).toHaveBeenCalledOnce();
  });

  it("모자란 만큼을 채우는 가장 작은 묶음을 골라 둔다", async () => {
    const handlers = renderSheet(0);
    await userEvent.click(await screen.findByRole("button", { name: "500P 충전하고 구매하기" }));
    expect(handlers.onCharge).toHaveBeenCalledWith("points_500");
    await userEvent.click(screen.getByRole("button", { name: /1,200P/ }));
    await userEvent.click(screen.getByRole("button", { name: "1,200P 충전하고 구매하기" }));
    expect(handlers.onCharge).toHaveBeenLastCalledWith("points_1200");
  });

  it("광고를 다 본 날은 광고 줄을 막는다", async () => {
    renderSheet(3);
    expect(
      await screen.findByText("오늘은 다 봤어요. 내일 다시 3번 볼 수 있어요"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /광고 보고 30P 받기/ })).toBeDisabled();
  });

  it("광고와 충전을 못 하는 곳에서는 두 줄을 숨긴다", async () => {
    render(
      <InsufficientPointsSheet
        open
        item={crown}
        balance={480}
        earn={fixture.earn}
        packs={fixture.packs}
        onMissions={() => {}}
        onClose={() => {}}
      />,
    );
    expect(await screen.findByText("왕관을 구매하려면 120P가 더 필요해요")).toBeInTheDocument();
    expect(screen.queryByText(/광고 보고/)).not.toBeInTheDocument();
    expect(screen.queryByText("바로 충전하기")).not.toBeInTheDocument();
  });
});
