import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";

import { PremiumFakeDoorFlow } from "../PremiumFakeDoorFlow";
import type { PremiumPlacement } from "../premiumFakeDoor";

const putPremiumWaitlist = vi.hoisted(() => vi.fn());
vi.mock("../premiumWaitlistApi", () => ({ putPremiumWaitlist }));
const trackApplyClicked = vi.hoisted(() => vi.fn());
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackPremiumFakeDoorApplyClicked: trackApplyClicked,
}));

function renderFlow(placement: PremiumPlacement) {
  return render(
    <MemoryRouter>
      <PremiumFakeDoorFlow
        price={2900}
        placement={placement}
        priceLabel="월 2,900원"
        onClose={() => {}}
        onApplied={() => {}}
      />
    </MemoryRouter>,
  );
}

/** 신청은 혜택 화면의 버튼 한 번이다(이메일·동의 화면 없음). */
async function finishApplying() {
  await userEvent.click(screen.getByRole("button", { name: "사전 신청하기" }));
  await screen.findByText("가장 먼저 알려드릴게요");
}

beforeEach(() => {
  // 혜택 화면의 불꽃 캔버스가 그리기 판을 찾는다. jsdom에는 없어서 없는 것으로 둔다.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  putPremiumWaitlist.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("PremiumFakeDoorFlow 완료 버튼", () => {
  it("세션에서 열었으면 공부로 돌아간다고 쓴다", async () => {
    renderFlow("SESSION");
    await finishApplying();

    expect(screen.getByRole("button", { name: "공부로 돌아가기" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "결과로 돌아가기" })).not.toBeInTheDocument();
  });

  it("결과 화면에서 열었으면 결과로 돌아간다고 쓴다", async () => {
    renderFlow("RESULT");
    await finishApplying();

    expect(screen.getByRole("button", { name: "결과로 돌아가기" })).toBeInTheDocument();
  });
});

describe("PremiumFakeDoorFlow 신청", () => {
  it("버튼을 누르면 이메일 화면 없이 바로 저장하고 완료 화면을 보인다", async () => {
    renderFlow("RESULT");
    await finishApplying();

    expect(putPremiumWaitlist).toHaveBeenCalledExactlyOnceWith({
      price: 2900,
      placement: "RESULT",
      ageOver14: true,
      email: null,
      expectedFeature: null,
    });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByText("알림은 앱으로 보내드려요.")).toBeInTheDocument();
  });

  it("버튼 위에 결제 안내와 동의 안내를 두 줄로 쓴다", () => {
    renderFlow("RESULT");

    expect(screen.getByText("사전 신청으로 자동 결제되지 않아요.")).toBeInTheDocument();
    expect(
      screen.getByText("신청하면 만 14세 이상이며 개인정보 이용에 동의한 걸로 처리돼요."),
    ).toBeInTheDocument();
  });

  it("저장하지 못하면 혜택 화면에 남아 알리고 같은 버튼으로 다시 보낸다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    putPremiumWaitlist.mockRejectedValueOnce(new Error("offline"));
    renderFlow("RESULT");
    await userEvent.click(screen.getByRole("button", { name: "사전 신청하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "신청하지 못했어요. 다시 시도해 주세요.",
    );
    await finishApplying();
    expect(putPremiumWaitlist).toHaveBeenCalledTimes(2);
  });

  it("저장하는 동안 다시 눌러도 한 번만 보낸다", async () => {
    let release = () => {};
    putPremiumWaitlist.mockReturnValueOnce(new Promise<void>((resolve) => (release = resolve)));
    renderFlow("RESULT");
    const button = screen.getByRole("button", { name: "사전 신청하기" });
    await userEvent.click(button);
    await userEvent.click(button);

    expect(putPremiumWaitlist).toHaveBeenCalledTimes(1);
    expect(trackApplyClicked).toHaveBeenCalledTimes(1);
    act(() => release());
    await screen.findByText("가장 먼저 알려드릴게요");
  });

  it("저장하는 동안 연 설명 시트의 신청 버튼도 막고, 저장이 끝나면 완료 화면만 보인다", async () => {
    let release = () => {};
    putPremiumWaitlist.mockReturnValueOnce(new Promise<void>((resolve) => (release = resolve)));
    renderFlow("RESULT");
    await userEvent.click(screen.getByRole("button", { name: "사전 신청하기" }));
    await userEvent.click(screen.getByRole("button", { name: /AI 플랜 비서/ }));
    const sheet = await screen.findByRole("dialog", { name: "AI 플랜 비서" });

    expect(within(sheet).getByRole("button", { name: "사전 신청하기" })).toBeDisabled();

    await act(async () => release());
    await screen.findByText("가장 먼저 알려드릴게요");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "AI 플랜 비서" })).not.toBeInTheDocument(),
    );
    expect(putPremiumWaitlist).toHaveBeenCalledTimes(1);
  });

  it("설명 시트의 버튼으로도 바로 신청하고 안내 두 줄을 보인다", async () => {
    renderFlow("RESULT");
    await userEvent.click(screen.getByRole("button", { name: /AI 플랜 비서/ }));
    const sheet = await screen.findByRole("dialog", { name: "AI 플랜 비서" });
    expect(
      within(sheet).getByText("신청하면 만 14세 이상이며 개인정보 이용에 동의한 걸로 처리돼요."),
    ).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "사전 신청하기" }));

    await screen.findByText("가장 먼저 알려드릴게요");
    expect(putPremiumWaitlist).toHaveBeenCalledTimes(1);
  });

  it("기대 기능을 고르면 이메일 없이 같은 본문에 기능을 채워 다시 보낸다", async () => {
    renderFlow("SESSION");
    await finishApplying();
    await userEvent.click(screen.getByRole("radio", { name: "전화 알림" }));

    await screen.findByText("답변해 주셔서 감사합니다!");
    expect(putPremiumWaitlist).toHaveBeenLastCalledWith({
      price: 2900,
      placement: "SESSION",
      ageOver14: true,
      email: null,
      expectedFeature: "PHONE_CALL",
    });
  });
});
