import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/lib/i18n";
import { showToast } from "@/lib/toast";

import { buildPointsFixture } from "../../fixtures";
import type { AdResult, ChargePack, ChargeResult, ClaimResult, EarnToday } from "../../types";
import { EarnTab } from "../EarnTab";

vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));

const fixture = buildPointsFixture("default");

afterEach(async () => {
  vi.mocked(showToast).mockClear();
  await i18n.changeLanguage("ko");
});

function setup(
  over: {
    earn?: EarnToday;
    inApp?: boolean;
    onClaim?: () => Promise<ClaimResult>;
    onWatchAd?: () => Promise<AdResult>;
    onCharge?: (id: string, onPaid?: () => void) => Promise<ChargeResult>;
    packs?: ChargePack[];
    member?: boolean;
    allowAction?: () => boolean;
  } = {},
) {
  const onClaim = over.onClaim ?? vi.fn(async () => ({ granted: true, points: 60, balance: 1300 }));
  const onWatchAd =
    over.onWatchAd ?? vi.fn(async (): Promise<AdResult> => ({ status: "unavailable" }));
  const onCharge =
    over.onCharge ??
    vi.fn(async (): Promise<ChargeResult> => ({
      status: "completed",
      granted: 2000,
      bonus: 0,
      balance: 3240,
    }));
  render(
    <MemoryRouter>
      <EarnTab
        earn={over.earn ?? fixture.earn}
        packs={over.packs ?? fixture.packs}
        onClaim={onClaim}
        onWatchAd={over.inApp === false ? undefined : onWatchAd}
        onCharge={over.inApp === false ? undefined : onCharge}
        {...(over.member === undefined ? {} : { member: over.member })}
        {...(over.allowAction === undefined ? {} : { allowAction: over.allowAction })}
      />
    </MemoryRouter>,
  );
  return { onClaim, onWatchAd, onCharge };
}

describe("EarnTab 무료 포인트", () => {
  it("공부 줄과 세 타일을 보인다", () => {
    setup();
    expect(screen.getByText(/30분 공부할 때마다/)).toHaveTextContent("30분 공부할 때마다 +7P");
    expect(screen.getByText("오늘 1시간 24분")).toBeInTheDocument();
    expect(screen.getByText("최대 10시간")).toBeInTheDocument();
    expect(screen.getByText("0/3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^보기/ })).toBeInTheDocument();
    expect(screen.getByText("완료")).toBeInTheDocument();
    expect(screen.getByText("36분 남음")).toBeInTheDocument();
    expect(screen.getByText("하루 목표 3시간")).toBeInTheDocument();
    expect(screen.getByText("+60P")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "하루 목표 포인트 안내" })).toBeInTheDocument();
    expect(screen.queryByText(/50P 받기/)).not.toBeInTheDocument();
  });

  it("목표가 1시간이면 gateway가 준 보상을 그대로 보인다", () => {
    const earn = {
      ...fixture.earn,
      dailyGoal: { ...fixture.earn.dailyGoal, goalSec: 3600, reward: 20 },
    };
    setup({ earn });
    expect(screen.getByText("하루 목표 1시간")).toBeInTheDocument();
    expect(screen.getByText("+20P")).toBeInTheDocument();
  });

  it("30분당 기준이 없으면 그 줄을 그리지 않는다", () => {
    const { unitSec, pointsPerUnit, ...goal } = fixture.earn.dailyGoal;
    void unitSec;
    void pointsPerUnit;
    setup({ earn: { ...fixture.earn, dailyGoal: goal } });
    expect(screen.getByText("하루 목표 3시간")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "하루 목표 포인트 안내" })).not.toBeInTheDocument();
  });

  it("목표가 없으면 제목과 안내 한 줄만 보이고 보상과 버튼이 없다", () => {
    setup({
      earn: {
        ...fixture.earn,
        dailyGoal: { ...fixture.earn.dailyGoal, goalSec: null, remainingSec: null, reward: 0 },
      },
    });
    expect(screen.getByText("하루 목표")).toBeInTheDocument();
    expect(screen.getByText("목표를 정하면 받을 수 있어요")).toBeInTheDocument();
    expect(screen.queryByText("+0P")).not.toBeInTheDocument();
    expect(screen.queryByText(/남음/)).not.toBeInTheDocument();
  });

  it("광고가 없는 경계는 광고 줄과 충전 칸 없이 줄 두 개만 그린다", () => {
    const { ad, ...rest } = fixture.earn;
    void ad;
    render(
      <MemoryRouter>
        <EarnTab earn={rest} packs={[]} onClaim={vi.fn()} chargeAvailable={false} />
      </MemoryRouter>,
    );
    expect(screen.queryByText("광고 보기")).not.toBeInTheDocument();
    expect(screen.queryByText("포인트 충전")).not.toBeInTheDocument();
    expect(screen.queryByText("충전과 광고 보상은 앱에서 할 수 있어요")).not.toBeInTheDocument();
    expect(screen.getByText("출석")).toBeInTheDocument();
    expect(screen.getByText("하루 목표 3시간")).toBeInTheDocument();
  });

  it("받은 광고 타일은 완료다", () => {
    setup({ earn: buildPointsFixture("allDone").earn });
    expect(screen.getAllByText("완료")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /^보기/ })).not.toBeInTheDocument();
  });
});

describe("EarnTab 메달", () => {
  it("받으면 claim을 부르고 새 메달 없음으로 바뀐다", async () => {
    const { onClaim } = setup();
    await userEvent.click(screen.getByRole("button", { name: "+60P 받기" }));
    expect(onClaim).toHaveBeenCalledWith("medals");
    expect(await screen.findByText("새 랭킹 메달이 없어요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+60P 받기" })).not.toBeInTheDocument();
  });

  it("처음부터 메달이 없으면 안내를 보인다", () => {
    setup({ earn: buildPointsFixture("noMedal").earn });
    expect(screen.getByText("새 랭킹 메달이 없어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "메달별 포인트 안내" })).toBeInTheDocument();
  });

  it("메달 설명은 안내 버튼을 눌러야 일간·주간·월간 표로 보인다", async () => {
    setup();
    expect(screen.queryByText("월간")).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "메달별 포인트 안내" });
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    const table = await screen.findByText("월간", { selector: "[data-state] *" });
    const rows = table.closest("[data-state]") as HTMLElement;
    for (const text of ["일간", "주간", "월간", "30P", "100P", "300P", "20P", "200P", "10P"]) {
      expect(within(rows).getAllByText(new RegExp(text)).length).toBeGreaterThan(0);
    }
  });
});

describe("EarnTab 광고와 충전", () => {
  it("광고가 없으면 안내 창을 띄운다", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /^보기/ }));
    expect(await screen.findByText("지금은 볼 수 있는 광고가 없어요")).toBeInTheDocument();
    expect(screen.getByText("잠시 뒤에 다시 눌러 주세요.")).toBeInTheDocument();
  });

  it("광고를 봤어도 서버가 확인하기 전에는 횟수를 올리지 않는다", async () => {
    setup({ onWatchAd: async () => ({ status: "late" }) });
    await userEvent.click(screen.getByRole("button", { name: /^보기/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^보기/ })).toBeEnabled());
    expect(screen.getByText("0/3")).toBeInTheDocument();
  });

  it("광고를 보면 횟수가 오른다", async () => {
    setup({ onWatchAd: async () => ({ status: "rewarded", balance: 1270 }) });
    await userEvent.click(screen.getByRole("button", { name: /^보기/ }));
    await waitFor(() => expect(screen.getByText("1/3")).toBeInTheDocument());
  });

  it("충전이 끝나면 결과 표를 보인다", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /2,000P 충전/ }));
    expect(await screen.findByText("충전 완료")).toBeInTheDocument();
    expect(screen.getByText("+2,000P")).toBeInTheDocument();
    expect(screen.getByText("충전 포인트")).toBeInTheDocument();
    expect(screen.getByText("2,000P", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("3,240P")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "확인" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "상점 가기" })).toBeInTheDocument();
  });

  it("충전이 실패하면 실패 창과 문의 링크를 보인다", async () => {
    setup({ onCharge: async () => ({ status: "failed" }) });
    await userEvent.click(screen.getByRole("button", { name: /500P 충전/ }));
    expect(await screen.findByText("결제를 완료하지 못했어요")).toBeInTheDocument();
    expect(screen.getByText("결제 수단을 확인하고 다시 시도해 주세요.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "결제됐는데 포인트가 안 들어왔나요?" }),
    ).toHaveAttribute("href", "/contact");
  });

  it("결제 창에서 스스로 취소하면 아무 창도 띄우지 않고 다시 충전할 수 있다", async () => {
    const onCharge = vi.fn(async () => ({ status: "cancelled" as const }));
    setup({ onCharge });
    await userEvent.click(screen.getByRole("button", { name: /500P 충전/ }));
    await waitFor(() => expect(onCharge).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /500P 충전/ })).not.toBeDisabled(),
    );
    expect(screen.queryByText("결제를 완료하지 못했어요")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /500P 충전/ }));
    expect(onCharge).toHaveBeenCalledTimes(2);
  });

  it("서버가 더 넣어 준 포인트가 있어도 완료 창은 보너스 줄 없이 충전 포인트에 합계를 보인다", async () => {
    setup({
      onCharge: async () => ({ status: "completed", granted: 500, bonus: 50, balance: 1790 }),
    });
    await userEvent.click(screen.getByRole("button", { name: /500P 충전/ }));
    await screen.findByText("충전 완료");

    expect(screen.getByText("+550P")).toBeInTheDocument();
    expect(screen.getByText("550P", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getAllByRole("definition")).toHaveLength(2);
    expect(screen.queryByText(/보너스|\+50P/)).not.toBeInTheDocument();
  });

  it("결제가 끝나면 충전 중 창을 띄우고 포인트가 들어오면 완료 창으로 바꾼다", async () => {
    let settle: (result: ChargeResult) => void = () => {};
    setup({
      onCharge: (_id, onPaid) => {
        onPaid?.();
        return new Promise<ChargeResult>((resolve) => (settle = resolve));
      },
    });
    await userEvent.click(screen.getByRole("button", { name: /500P 충전/ }));
    expect(await screen.findByText("포인트를 충전하고 있어요")).toBeInTheDocument();
    expect(screen.queryByText("충전 완료")).not.toBeInTheDocument();

    settle({ status: "completed", granted: 500, bonus: 0, balance: 1740 });
    expect(await screen.findByText("충전 완료")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText("포인트를 충전하고 있어요")).not.toBeInTheDocument(),
    );
  });

  it("충전 중 창에서 포인트가 끝내 들어오지 않으면 다시 결제하는 길 없이 곧 들어온다고 알린다", async () => {
    let settle: (result: ChargeResult) => void = () => {};
    setup({
      onCharge: (_id, onPaid) => {
        onPaid?.();
        return new Promise<ChargeResult>((resolve) => (settle = resolve));
      },
    });
    await userEvent.click(screen.getByRole("button", { name: /500P 충전/ }));
    await screen.findByText("포인트를 충전하고 있어요");

    settle({ status: "late" });
    expect(await screen.findByText("포인트가 곧 들어와요")).toBeInTheDocument();
    expect(screen.getByText("결제는 끝났어요. 잠시 뒤 잔액을 확인해 주세요.")).toBeInTheDocument();
    expect(screen.queryByText("결제를 완료하지 못했어요")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "포인트가 계속 안 들어오나요?" })).toHaveAttribute(
      "href",
      "/contact",
    );
    await waitFor(() =>
      expect(screen.queryByText("포인트를 충전하고 있어요")).not.toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole("button", { name: "확인" }));
    await waitFor(() => expect(screen.queryByText("포인트가 곧 들어와요")).not.toBeInTheDocument());
  });

  it("결제 창을 닫기 전에는 충전 중 창을 띄우지 않는다", async () => {
    setup({ onCharge: () => new Promise<ChargeResult>(() => {}) });
    await userEvent.click(screen.getByRole("button", { name: /500P 충전/ }));
    expect(screen.queryByText("포인트를 충전하고 있어요")).not.toBeInTheDocument();
  });

  it("다시 시도는 같은 묶음을 다시 결제한다", async () => {
    const onCharge = vi
      .fn<(id: string, onPaid?: () => void) => Promise<ChargeResult>>()
      .mockResolvedValueOnce({ status: "failed" })
      .mockResolvedValueOnce({ status: "completed", granted: 500, bonus: 0, balance: 1740 });
    setup({ onCharge });
    await userEvent.click(screen.getByRole("button", { name: /500P 충전/ }));
    await userEvent.click(await screen.findByRole("button", { name: "다시 시도" }));
    await screen.findByText("충전 완료");
    expect(onCharge).toHaveBeenNthCalledWith(2, "points_500", expect.any(Function));
  });

  it("비회원에게는 묶음마다 포인트 수와 로그인 안내를 보이고 누르면 결제 대신 로그인 화면으로 보낸다", async () => {
    const allowAction = vi.fn(() => false);
    const { onCharge } = setup({
      member: false,
      allowAction,
      packs: fixture.packs.map((pack) => ({ ...pack, priceLabel: null })),
    });
    expect(screen.queryByText("가격 확인 중")).not.toBeInTheDocument();
    expect(screen.getAllByText("로그인하기")).toHaveLength(3);
    const pack = screen.getByRole("button", { name: "500P 충전, 로그인하기" });
    expect(pack).toBeEnabled();
    await userEvent.click(pack);
    expect(allowAction).toHaveBeenCalledOnce();
    expect(onCharge).not.toHaveBeenCalled();
  });

  it("스토어 가격을 받지 못한 묶음은 가격 확인 중을 보이고 눌러도 결제하지 않는다", async () => {
    const { onCharge } = setup({
      packs: fixture.packs.map((pack) => ({ ...pack, priceLabel: null })),
    });
    expect(screen.getAllByText("가격 확인 중")).toHaveLength(3);
    const pack = screen.getByRole("button", { name: "500P 충전" });
    expect(pack).toBeDisabled();
    await userEvent.click(pack);
    expect(onCharge).not.toHaveBeenCalled();
  });
});

describe("EarnTab 결제·환불 안내", () => {
  it("충전 칸 아래에 결제·환불 안내 화면으로 가는 링크가 있고 창은 열지 않는다", () => {
    setup();
    expect(screen.getByRole("link", { name: "결제·환불 안내" })).toHaveAttribute(
      "href",
      "/points/payment-guide",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("EarnTab 앱 밖", () => {
  it("충전 칸 대신 앱에서 열기 안내와 버튼을 보인다", () => {
    setup({ inApp: false });
    expect(screen.queryByText("포인트 충전")).not.toBeInTheDocument();
    expect(screen.getByText("충전과 광고 보상은 앱에서 할 수 있어요")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "앱에서 열기" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /^보기/ })).not.toBeInTheDocument();
  });
});

describe("EarnTab 실패", () => {
  it.each([
    ["받기", { onClaim: () => Promise.reject(new Error("down")) }, "+60P 받기"],
    ["광고", { onWatchAd: () => Promise.reject(new Error("down")) }, /^보기/],
    ["충전", { onCharge: () => Promise.reject(new Error("down")) }, /500P 충전/],
  ] as const)("%s 요청이 실패하면 알리고 다시 누를 수 있다", async (_, over, name) => {
    setup(over);
    await userEvent.click(screen.getByRole("button", { name }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith("잠시 후 다시 시도해 주세요"));
    expect(screen.getByRole("button", { name })).toBeEnabled();
  });
});

describe("EarnTab 충전 묶음", () => {
  it.each(["ko", "en", "ja", "zh-Hant"])(
    "%s에서 보너스가 있는 묶음도 칸에는 묶음 포인트와 가격만 보인다",
    async (lng) => {
      await i18n.changeLanguage(lng);
      setup({
        packs: [{ productId: "points_1200", points: 1200, bonus: 100, priceLabel: "₩2,500" }],
      });

      const pack = screen.getByRole("button", { name: /1,200P/ });
      expect(pack).toHaveTextContent("1,200P");
      expect(pack).toHaveTextContent("₩2,500");
      expect(pack.textContent).not.toMatch(/100P|1,300P/);
    },
  );
});
