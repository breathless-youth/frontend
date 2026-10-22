import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";
import { FIXTURE_SESSION_GAINS } from "@/lib/rankingFixtures";

import { gainCardView } from "../gainView";
import { RankingGainCard } from "../RankingGainCard";

const analytics = vi.hoisted(() => ({
  trackRankingGainCardShown: vi.fn(),
  trackRankingGainCardTapped: vi.fn(),
}));
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  ...analytics,
}));

const haptic = vi.hoisted(() => vi.fn());
vi.mock("@/lib/haptics", () => ({ haptic }));

afterEach(() => vi.clearAllMocks());

const VIEW = gainCardView(FIXTURE_SESSION_GAINS)!;

describe("RankingGainCard", () => {
  it("주간 순공 순위 변화와 오른 판 칩을 보인다", () => {
    render(<RankingGainCard view={VIEW} roomType="single" onOpen={vi.fn()} />);

    const card = screen.getByRole("region", { name: "랭킹이 올랐어요" });
    expect(within(card).getByText("주간 순공")).toBeInTheDocument();
    expect(within(card).getByText("1,205위 → 1,202위")).toBeInTheDocument();
    expect(within(card).getByText("▲3")).toBeInTheDocument();
    const chips = within(card).getAllByRole("listitem");
    expect(chips.map((chip) => chip.firstChild?.textContent)).toEqual([
      "집중률",
      "저녁 구간",
      "누적 시간",
    ]);
    expect(chips.map((chip) => within(chip).getByText(/^▲/).textContent)).toEqual([
      "▲208",
      "▲9",
      "▲41",
    ]);
  });

  it("화면 낭독기는 ▲ 기호 대신 오른 계단 수를 문장으로 읽는다", () => {
    render(<RankingGainCard view={VIEW} roomType="single" onOpen={vi.fn()} />);

    const card = screen.getByRole("region", { name: "랭킹이 올랐어요" });
    expect(within(card).getByText("▲3")).toHaveAttribute("aria-hidden", "true");
    expect(within(card).getByText("3계단 올랐어요")).toBeInTheDocument();
    const chip = within(card).getAllByRole("listitem")[0]!;
    expect(within(chip).getByText("▲208")).toHaveAttribute("aria-hidden", "true");
    expect(within(chip).getByText("208계단 올랐어요")).toBeInTheDocument();
  });

  it("칩이 없으면 칩 줄을 그리지 않는다", () => {
    render(<RankingGainCard view={{ ...VIEW, chips: [] }} roomType="single" onOpen={vi.fn()} />);

    expect(screen.queryByRole("list")).toBeNull();
  });

  it("보이면 노출 이벤트를 한 번만 남긴다", () => {
    // StrictMode는 effect를 두 번 돌리므로 노출을 한 번만 세는지 여기서 드러난다.
    // 다시 그릴 때도 같은 트리로 감싸야 새로 마운트되지 않는다.
    const { rerender } = render(
      <StrictMode>
        <RankingGainCard view={VIEW} roomType="social" onOpen={vi.fn()} />
      </StrictMode>,
    );
    rerender(
      <StrictMode>
        <RankingGainCard view={{ ...VIEW }} roomType="social" onOpen={vi.fn()} />
      </StrictMode>,
    );

    expect(analytics.trackRankingGainCardShown).toHaveBeenCalledTimes(1);
    expect(analytics.trackRankingGainCardShown).toHaveBeenCalledWith({
      delta: 3,
      chipCount: 3,
      roomType: "social",
    });
  });

  it("보이면 light 햅틱을 한 번만 울린다 — StrictMode와 다시 그리기에도", () => {
    const { rerender } = render(
      <StrictMode>
        <RankingGainCard view={VIEW} roomType="single" onOpen={vi.fn()} />
      </StrictMode>,
    );
    rerender(
      <StrictMode>
        <RankingGainCard view={{ ...VIEW }} roomType="single" onOpen={vi.fn()} />
      </StrictMode>,
    );

    expect(haptic).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledWith("light");
  });

  it("랭킹 보기의 화살표는 보이기만 하고 이름에는 넣지 않는다", () => {
    render(<RankingGainCard view={VIEW} roomType="single" onOpen={vi.fn()} />);

    expect(screen.getByRole("button", { name: "랭킹 보기" })).toHaveTextContent("랭킹 보기 ›");
  });

  it("랭킹 보기를 누르면 이벤트를 남기고 연다", async () => {
    const onOpen = vi.fn();
    render(<RankingGainCard view={VIEW} roomType="single" onOpen={onOpen} />);

    await userEvent.click(screen.getByRole("button", { name: "랭킹 보기" }));

    expect(analytics.trackRankingGainCardTapped).toHaveBeenCalledWith("single");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
