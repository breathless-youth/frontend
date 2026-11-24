import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PremiumFakeDoorFlow } from "../PremiumFakeDoorFlow";
import type { PremiumPlacement } from "../premiumFakeDoor";

const putPremiumWaitlist = vi.hoisted(() => vi.fn());
vi.mock("../premiumWaitlistApi", () => ({ putPremiumWaitlist }));

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

/** 리디자인 뒤 신청은 혜택 화면 → 이메일 화면 하나다(만 14세 확인 단계 없음). */
async function finishApplying() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "사전 신청하기" }));
  await user.type(screen.getByLabelText("이메일"), "minjun@example.com");
  await user.click(screen.getByRole("checkbox", { name: "[필수] 만 14세 이상이에요" }));
  await user.click(screen.getByRole("checkbox", { name: "[필수] 개인정보 수집·이용 동의" }));
  await user.click(screen.getByRole("button", { name: "사전 신청하기" }));
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

describe("PremiumFakeDoorFlow 키보드", () => {
  it("키보드가 올라오면 아래 버튼 줄을 키보드 위로 올린다", async () => {
    const viewport = new EventTarget() as EventTarget & { height: number; offsetTop: number };
    viewport.height = 800;
    viewport.offsetTop = 0;
    vi.stubGlobal("visualViewport", viewport);
    vi.stubGlobal("innerHeight", 800);
    renderFlow("SESSION");
    await userEvent.click(screen.getByRole("button", { name: "사전 신청하기" }));
    const footer = screen.getByRole("button", { name: "사전 신청하기" }).parentElement;
    expect(footer?.style.paddingBottom).toBe("");

    act(() => {
      viewport.height = 458;
      viewport.dispatchEvent(new Event("resize"));
    });

    expect(footer?.style.paddingBottom).toBe("354px");
  });
});
