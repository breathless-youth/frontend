import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { SessionReward } from "../../types";
import { ResultPointsCard } from "../ResultPointsCard";

const HOUR = 3600;
const reward: SessionReward = {
  earned: 20,
  todayFocusSec: 2 * HOUR + 600,
  capSec: 12 * HOUR,
  nextMascot: { id: "lamp", remainingSec: 2 * HOUR + 48 * 60, progress: 0.907 },
};

describe("ResultPointsCard", () => {
  it("받은 포인트와 오늘 진행, 다음 마스코트를 보인다", () => {
    render(<ResultPointsCard reward={reward} onOpenShop={vi.fn()} />);
    expect(screen.getByText("+20P 받았어요")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "오늘 12시간 중 2시간 10분 공부했어요" }),
    ).toBeInTheDocument();
    expect(screen.getByText("오늘 2시간 10분")).toBeInTheDocument();
    expect(screen.getByText("최대 12시간")).toBeInTheDocument();
    expect(screen.getByText("램프까지 순공 2시간 48분 남았어요")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "램프까지 91% 모았어요" })).toBeInTheDocument();
  });

  it("상점 버튼이 상점을 연다", async () => {
    const onOpenShop = vi.fn();
    render(<ResultPointsCard reward={reward} onOpenShop={onOpenShop} />);
    await userEvent.click(screen.getByRole("button", { name: /상점/ }));
    expect(onOpenShop).toHaveBeenCalledOnce();
  });

  it("받은 포인트가 0이면 마스코트 줄만 보인다", () => {
    render(<ResultPointsCard reward={{ ...reward, earned: 0 }} onOpenShop={vi.fn()} />);
    expect(screen.queryByText(/받았어요/)).not.toBeInTheDocument();
    expect(screen.queryByText("최대 12시간")).not.toBeInTheDocument();
    expect(screen.getByText("램프까지 순공 2시간 48분 남았어요")).toBeInTheDocument();
  });

  it("reward가 null이면 카드가 없다", () => {
    const { container } = render(<ResultPointsCard reward={null} onOpenShop={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("다 모았고 받은 포인트도 0이면 카드가 없다", () => {
    const { container } = render(
      <ResultPointsCard reward={{ ...reward, earned: 0, nextMascot: null }} onOpenShop={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("다 모았어도 받은 포인트가 있으면 마스코트 줄 없이 포인트 줄만 보인다", () => {
    render(<ResultPointsCard reward={{ ...reward, nextMascot: null }} onOpenShop={vi.fn()} />);
    expect(screen.getByText("+20P 받았어요")).toBeInTheDocument();
    expect(screen.queryByText(/남았어요/)).not.toBeInTheDocument();
  });
});
