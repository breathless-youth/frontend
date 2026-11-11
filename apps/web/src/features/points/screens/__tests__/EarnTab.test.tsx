import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { showToast } from "@/lib/toast";

import { buildPointsFixture } from "../../fixtures";
import type { AdResult, ChargeResult, EarnToday } from "../../types";
import { EarnTab } from "../EarnTab";

vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));

const fixture = buildPointsFixture("default");

afterEach(() => {
  vi.mocked(showToast).mockClear();
});

function setup(
  over: {
    earn?: EarnToday;
    inApp?: boolean;
    onClaim?: () => Promise<{ balance: number }>;
    onWatchAd?: () => Promise<AdResult>;
    onCharge?: (id: string) => Promise<ChargeResult>;
  } = {},
) {
  const onClaim = over.onClaim ?? vi.fn(async () => ({ balance: 1370 }));
  const onWatchAd =
    over.onWatchAd ?? vi.fn(async (): Promise<AdResult> => ({ status: "unavailable" }));
  const onCharge =
    over.onCharge ??
    vi.fn(async (): Promise<ChargeResult> => ({
      status: "completed",
      granted: 1200,
      bonus: 100,
      balance: 2540,
    }));
  render(
    <MemoryRouter>
      <EarnTab
        earn={over.earn ?? fixture.earn}
        packs={fixture.packs}
        onClaim={onClaim}
        onWatchAd={over.inApp === false ? undefined : onWatchAd}
        onCharge={over.inApp === false ? undefined : onCharge}
      />
    </MemoryRouter>,
  );
  return { onClaim, onWatchAd, onCharge };
}

describe("EarnTab 무료 포인트", () => {
  it("공부 줄과 세 타일을 보인다", () => {
    setup();
    expect(screen.getByText(/30분 공부할 때마다/)).toHaveTextContent("30분 공부할 때마다 +10P");
    expect(screen.getByText("오늘 1시간 24분")).toBeInTheDocument();
    expect(screen.getByText("최대 12시간")).toBeInTheDocument();
    expect(screen.getByText("광고 보기")).toHaveTextContent("광고 보기0/3");
    expect(screen.getByRole("button", { name: "보기" })).toBeInTheDocument();
    expect(screen.getByText("완료")).toBeInTheDocument();
    expect(screen.getByText("36분 남음")).toBeInTheDocument();
    expect(screen.queryByText(/50P 받기/)).not.toBeInTheDocument();
  });

  it("받은 광고 타일은 완료다", () => {
    setup({ earn: buildPointsFixture("allDone").earn });
    expect(screen.getAllByText("완료")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "보기" })).not.toBeInTheDocument();
  });
});

describe("EarnTab 메달", () => {
  it("받으면 claim을 부르고 새 메달 없음으로 바뀐다", async () => {
    const { onClaim } = setup();
    expect(screen.getByText("금메달 100P")).toBeInTheDocument();
    expect(screen.getByText("은메달 60P")).toBeInTheDocument();
    expect(screen.getByText("동메달 30P")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "+130P 받기" }));
    expect(onClaim).toHaveBeenCalledWith("medals");
    expect(await screen.findByText("새 랭킹 메달이 없어요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+130P 받기" })).not.toBeInTheDocument();
  });

  it("처음부터 메달이 없으면 안내를 보인다", () => {
    setup({ earn: buildPointsFixture("noMedal").earn });
    expect(screen.getByText("새 랭킹 메달이 없어요")).toBeInTheDocument();
  });
});

describe("EarnTab 광고와 충전", () => {
  it("광고가 없으면 안내 창을 띄운다", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "보기" }));
    expect(await screen.findByText("지금은 볼 수 있는 광고가 없어요")).toBeInTheDocument();
    expect(screen.getByText("잠시 뒤에 다시 눌러 주세요.")).toBeInTheDocument();
  });

  it("광고를 보면 횟수가 오른다", async () => {
    setup({ onWatchAd: async () => ({ status: "rewarded", balance: 1270 }) });
    await userEvent.click(screen.getByRole("button", { name: "보기" }));
    await waitFor(() => expect(screen.getByText("광고 보기")).toHaveTextContent("1/3"));
  });

  it("충전이 끝나면 결과 표를 보인다", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /1,200P 충전/ }));
    expect(await screen.findByText("충전 완료")).toBeInTheDocument();
    expect(screen.getByText("+1,300P")).toBeInTheDocument();
    expect(screen.getByText("충전 포인트")).toBeInTheDocument();
    expect(screen.getByText("1,200P", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("+100P", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("2,540P")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "확인" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "상점 가기" })).toBeInTheDocument();
  });

  it.each(["failed", "cancelled"] as const)(
    "충전이 %s면 실패 창과 문의 링크를 보인다",
    async (status) => {
      setup({ onCharge: async () => ({ status }) });
      await userEvent.click(screen.getByRole("button", { name: /500P 충전/ }));
      expect(await screen.findByText("결제를 완료하지 못했어요")).toBeInTheDocument();
      expect(screen.getByText("결제 수단을 확인하고 다시 시도해 주세요.")).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "결제됐는데 포인트가 안 들어왔나요?" }),
      ).toHaveAttribute("href", "/contact");
    },
  );

  it("다시 시도는 같은 묶음을 다시 결제한다", async () => {
    const onCharge = vi
      .fn<(id: string) => Promise<ChargeResult>>()
      .mockResolvedValueOnce({ status: "failed" })
      .mockResolvedValueOnce({ status: "completed", granted: 500, bonus: 0, balance: 1740 });
    setup({ onCharge });
    await userEvent.click(screen.getByRole("button", { name: /500P 충전/ }));
    await userEvent.click(await screen.findByRole("button", { name: "다시 시도" }));
    await screen.findByText("충전 완료");
    expect(onCharge).toHaveBeenNthCalledWith(2, "points_500");
  });

  it("가격 라벨이 없으면 자리 표시를 보인다", () => {
    setup();
    expect(screen.getAllByText("가격 확인 중")).toHaveLength(3);
  });
});

describe("EarnTab 앱 밖", () => {
  it("충전 칸 대신 앱에서 열기 안내와 버튼을 보인다", () => {
    setup({ inApp: false });
    expect(screen.queryByText("포인트 충전")).not.toBeInTheDocument();
    expect(screen.getByText("충전과 광고 보상은 앱에서 할 수 있어요")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "앱에서 열기" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "보기" })).not.toBeInTheDocument();
  });
});

describe("EarnTab 실패", () => {
  it.each([
    ["받기", { onClaim: () => Promise.reject(new Error("down")) }, "+130P 받기"],
    ["광고", { onWatchAd: () => Promise.reject(new Error("down")) }, "보기"],
    ["충전", { onCharge: () => Promise.reject(new Error("down")) }, /500P 충전/],
  ] as const)("%s 요청이 실패하면 알리고 다시 누를 수 있다", async (_, over, name) => {
    setup(over);
    await userEvent.click(screen.getByRole("button", { name }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith("잠시 후 다시 시도해 주세요"));
    expect(screen.getByRole("button", { name })).toBeEnabled();
  });
});
