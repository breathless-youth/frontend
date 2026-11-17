import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildPointsFixture } from "../../../fixtures";
import type { ShopItem } from "../../../types";
import { InsufficientPointsSheet } from "../InsufficientPointsSheet";
import { MascotImage } from "../MascotImage";
import { PointsBalancePill, type PointsGain } from "../PointsBalancePill";
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

  it("환불로 잔액이 0 아래로 내려가면 안내 없이 음수 그대로 보인다", () => {
    render(<PointsBalancePill size="screen" balance={-300} onPress={() => {}} />);
    expect(screen.getByText("-300P")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "보유 포인트 -300P" })).toBeInTheDocument();
  });

  it("잔액을 모르면 숫자 대신 줄표를 보인다", () => {
    render(<PointsBalancePill size="screen" balance={undefined} />);
    expect(screen.getByText("–P")).toBeInTheDocument();
  });

  describe("받은 포인트 연출", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    function pill(gain: PointsGain | null, balance = 1390) {
      return <PointsBalancePill size="home" balance={balance} onPress={() => {}} gain={gain} />;
    }

    it("받기 전에는 배지 없이 알림 자리만 비워 둔다", () => {
      render(pill(null, 1240));
      expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
      expect(screen.getByRole("button", { name: "보유 포인트 1,240P" })).not.toHaveAttribute(
        "data-gained",
      );
    });

    it("받은 금액을 배지로 보이고 낭독기에는 받은 포인트로 한 번 알린다", () => {
      const view = render(pill(null, 1240));
      view.rerender(pill({ points: 150, id: 1 }));

      expect(screen.getByText("+150P")).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(/^150포인트 받음$/);
      expect(screen.getByRole("button", { name: "보유 포인트 1,390P" })).toHaveAttribute(
        "data-gained",
      );
    });

    it("배지와 테두리는 2초 동안 보였다가 사라진다", () => {
      const view = render(pill(null, 1240));
      view.rerender(pill({ points: 150, id: 1 }));

      act(() => vi.advanceTimersByTime(1999));
      expect(screen.getByText("+150P")).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(1));
      expect(screen.queryByText("+150P")).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
      expect(screen.getByRole("button")).not.toHaveAttribute("data-gained");
    });

    it("다시 받으면 그때 받은 금액으로 처음부터 다시 보인다", () => {
      const view = render(pill({ points: 50, id: 1 }, 50));
      act(() => vi.advanceTimersByTime(1500));
      view.rerender(pill({ points: 100, id: 2 }, 150));

      expect(screen.queryByText("+50P")).not.toBeInTheDocument();
      expect(screen.getByText("+100P")).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(1500));
      expect(screen.getByText("+100P")).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(500));
      expect(screen.queryByText("+100P")).not.toBeInTheDocument();
    });

    it("받은 포인트를 넘기지 않는 화면에는 알림 자리를 만들지 않는다", () => {
      render(<PointsBalancePill size="screen" balance={640} />);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });
});

describe("MascotImage", () => {
  it("잠긴 마스코트는 잠겼다고 읽힌다", () => {
    render(<MascotImage id="lamp" locked size={50} />);
    expect(screen.getByRole("img", { name: "잠긴 램피 캐릭터" })).toBeInTheDocument();
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

  it("가격 줄 아래 버튼 위에 포인트로 산 소품은 환불되지 않는다는 한 줄을 보인다", async () => {
    render(
      <PurchaseConfirmSheet
        open
        item={crown}
        balance={1240}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    const notice = await screen.findByText("포인트로 산 소품은 환불되지 않아요.");
    const afterPrice = screen.getByText("구매 후 포인트");
    const buy = screen.getByRole("button", { name: "구매하기" });
    expect(
      afterPrice.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(notice.compareDocumentPosition(buy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("마스코트를 살 때는 마스코트가 환불되지 않는다고 알린다", async () => {
    render(
      <PurchaseConfirmSheet
        open
        item={crown}
        subject="mascot"
        balance={1240}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    expect(await screen.findByText("포인트로 산 캐릭터는 환불되지 않아요.")).toBeInTheDocument();
    expect(screen.queryByText("포인트로 산 소품은 환불되지 않아요.")).not.toBeInTheDocument();
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
        earn={{ ...fixture.earn, ad: { reward: 20, limit: 3, watched } }}
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
    await userEvent.click(screen.getByRole("button", { name: /광고 보고 20P 받기/ }));
    expect(handlers.onWatchAd).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: /일일 미션 클리어하기/ }));
    expect(handlers.onMissions).toHaveBeenCalledOnce();
  });

  it("모자란 만큼을 채우는 가장 작은 묶음을 골라 둔다", async () => {
    const handlers = renderSheet(0);
    await userEvent.click(await screen.findByRole("button", { name: "500P 충전하고 구매하기" }));
    expect(handlers.onCharge).toHaveBeenCalledWith("points_500");
    await userEvent.click(screen.getByRole("button", { name: /2,000P/ }));
    await userEvent.click(screen.getByRole("button", { name: "2,000P 충전하고 구매하기" }));
    expect(handlers.onCharge).toHaveBeenLastCalledWith("points_2000");
  });

  it("고른 묶음의 스토어 가격을 받지 못했으면 가격 확인 중을 보이고 충전하고 구매하기를 막는다", async () => {
    const onCharge = vi.fn();
    render(
      <InsufficientPointsSheet
        open
        item={crown}
        balance={480}
        packs={fixture.packs.map((pack) => ({ ...pack, priceLabel: null }))}
        onCharge={onCharge}
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findAllByText("가격 확인 중")).toHaveLength(3);
    const charge = screen.getByRole("button", { name: "500P 충전하고 구매하기" });
    expect(charge).toBeDisabled();
    await userEvent.click(charge);
    expect(onCharge).not.toHaveBeenCalled();
  });

  it("광고를 다 본 날은 광고 줄을 막는다", async () => {
    renderSheet(3);
    expect(
      await screen.findByText("오늘은 다 봤어요. 내일 다시 3번 볼 수 있어요"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /광고 보고 20P 받기/ })).toBeDisabled();
  });

  it("광고와 충전은 끝나기 전에 다시 눌러도 한 번만 부르고 그동안 막는다", async () => {
    let finishAd: () => void = () => {};
    let finishCharge: () => void = () => {};
    const onWatchAd = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishAd = resolve;
        }),
    );
    const onCharge = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishCharge = resolve;
        }),
    );
    render(
      <InsufficientPointsSheet
        open
        item={crown}
        balance={480}
        earn={fixture.earn}
        packs={fixture.packs}
        onWatchAd={onWatchAd}
        onMissions={() => {}}
        onCharge={onCharge}
        onClose={() => {}}
      />,
    );
    const ad = await screen.findByRole("button", { name: /광고 보고 20P 받기/ });
    const charge = screen.getByRole("button", { name: "500P 충전하고 구매하기" });
    fireEvent.click(ad);
    fireEvent.click(ad);
    fireEvent.click(charge);
    expect(onWatchAd).toHaveBeenCalledOnce();
    expect(onCharge).not.toHaveBeenCalled();
    await waitFor(() => expect(charge).toBeDisabled());
    finishAd();
    await waitFor(() => expect(charge).toBeEnabled());
    fireEvent.click(charge);
    fireEvent.click(charge);
    expect(onCharge).toHaveBeenCalledOnce();
    finishCharge();
    await waitFor(() => expect(ad).toBeEnabled());
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

  describe("받을 길이 없을 때의 공부 안내", () => {
    it("받기 데이터가 있으면 서버의 시간 단위와 지금 혼자 값으로 적는다", async () => {
      const study = { ...fixture.earn.study, unitSec: 3600, pointsPerUnit: 12 };
      render(
        <InsufficientPointsSheet
          open
          item={crown}
          balance={480}
          earn={{ ...fixture.earn, study }}
          packs={[]}
          onClose={() => {}}
        />,
      );

      expect(await screen.findByText("1시간 공부할 때마다 +12P")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "확인" })).toBeInTheDocument();
    });

    it("받기 데이터를 아직 받지 못했으면 숫자 없이 안내한다", async () => {
      render(
        <InsufficientPointsSheet open item={crown} balance={480} packs={[]} onClose={() => {}} />,
      );

      expect(await screen.findByText("공부할수록 포인트가 쌓여요")).toBeInTheDocument();
      expect(screen.queryByText(/\d+P$/)).not.toBeInTheDocument();
    });
  });
});
