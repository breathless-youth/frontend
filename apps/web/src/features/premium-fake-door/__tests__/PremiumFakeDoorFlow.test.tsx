import { render, screen } from "@testing-library/react";
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
        nickname={null}
        onClose={() => {}}
        onApplied={() => {}}
      />
    </MemoryRouter>,
  );
}

async function finishApplying() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "사전 신청하기" }));
  await user.click(screen.getByRole("button", { name: "앱 알림으로 신청하기" }));
  await screen.findByText("출시되면 앱에서 알려드릴게요.");
}

beforeEach(() => {
  // 혜택 화면의 불꽃 캔버스가 그리기 판을 찾는다. jsdom에는 없어서 없는 것으로 둔다.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  putPremiumWaitlist.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.clearAllMocks();
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
